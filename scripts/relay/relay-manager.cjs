const { ethers } = require('ethers');
const { MockWebSocketProvider } = require('../mock/mock-provider.cjs');
const config = require('../config/network-config.cjs');

class RelayManager {
    constructor(config) {
        this.config = {
            ...require('../config/network-config.cjs'),  // Default config
            ...config  // Override with provided config
        };
        this.provider = null;
        this.ethProvider = null;
        this.wallet = null;  // Add wallet for signing transactions
        this.metrics = {
            transactions: 0,
            successful: 0,
            failed: 0,
            retries: 0,
            disconnections: 0
        };
        this.connectionState = {
            source: false,
            target: false
        };
    }

    async initialize() {
        // Initialize providers based on configuration
        if (this.config.mock.enabled) {
            console.log('Using mock providers for development');
            // Initialize source network mock provider
            const sourceConfig = this.config.sourceNetwork;
            console.log('Initializing source network with config:', {
                chainId: sourceConfig.chainId,
                networkId: sourceConfig.networkId,
                name: sourceConfig.name
            });
            this.provider = new MockWebSocketProvider(sourceConfig.ws || sourceConfig.rpc, {
                chainId: sourceConfig.chainId || 138,
                networkId: sourceConfig.networkId || 1,
                name: sourceConfig.name || 'defi-oracle-meta'
            });
            // Initialize target network provider (always use JsonRpcProvider for mainnet)
            const ethereumConfig = this.config.ethereum;
            console.log('Initializing Ethereum mainnet provider...');

            // Use minimal network configuration for Ethereum mainnet
            this.ethProvider = new ethers.providers.JsonRpcProvider(
                'https://rpc.ankr.com/eth',
                { chainId: 1, name: 'mainnet' }
            );

            // Initialize test wallet for signing transactions
            const testPrivateKey = '0x' + '1'.repeat(64); // Test private key for mock transactions
            this.wallet = new ethers.Wallet(testPrivateKey, this.ethProvider);

            console.log('Ethereum provider initialized with Ankr RPC endpoint');

            // Set up event listeners for source provider only
            this.provider.on('connect', () => this.handleConnect('source'));
            this.provider.on('disconnect', () => this.handleDisconnect('source'));
            this.provider.on('block', (blockNumber) => this.handleNewBlock(blockNumber));

            // Verify Ethereum provider network
            try {
                const network = await this.ethProvider.getNetwork();
                console.log('Ethereum provider network detected:', network);
                this.handleConnect('target');
            } catch (error) {
                console.log('Failed to detect Ethereum network:', error.message);
                throw error;
            }

            // Connect source provider and wait for connections
            console.log('Connecting to source network...');
            await this.provider.connect();
            await this.waitForConnections();
        } else {
            console.log('Using real WebSocket provider');
            const sourceConfig = this.config.sourceNetwork;
            this.provider = new ethers.providers.WebSocketProvider(sourceConfig.ws || sourceConfig.rpc, {
                chainId: sourceConfig.chainId,
                name: sourceConfig.name || 'source-network'
            });
            // Initialize Ethereum mainnet provider for relay
            const ethereumConfig = this.config.ethereum;
            const network = {
                name: 'mainnet',
                chainId: 1,
                ensAddress: null,
                _defaultProvider: null
            };

            this.ethProvider = new ethers.providers.JsonRpcProvider(
                ethereumConfig.rpc,
                network
            );

            // Set up event listeners
            this.provider.on('connect', () => this.handleConnect('source'));
            this.provider.on('disconnect', () => this.handleDisconnect('source'));
            this.provider.on('block', (blockNumber) => this.handleNewBlock(blockNumber));

            await this.provider.connect();
            await this.verifyNetworkConnection(this.provider, 'source');
            await this.verifyNetworkConnection(this.ethProvider, 'target');
        }
    }

    async handleConnect(network) {
        console.log(`✓ Connected to ${network} provider`);
        this.connectionState[network] = true;
    }

    async handleDisconnect(network) {
        console.log(`! Network disconnection detected for ${network}`);
        this.connectionState[network] = false;
        this.metrics.disconnections++;
        console.log(`Attempting reconnection to ${network}...`);
        const provider = network === 'source' ? this.provider : this.ethProvider;
        await provider.connect();
    }

    async handleNewBlock(blockNumber) {
        console.log(`New block received: ${blockNumber}`);
        const block = await this.provider.getBlock(blockNumber);
        if (block && block.transactions) {
            for (const txHash of block.transactions) {
                await this.relayTransaction(txHash);
            }
        }
    }

    async relayTransaction(txHash) {
        try {
            this.metrics.transactions++;
            const tx = await this.provider.getTransaction(txHash);
            if (!tx) return;

            // Format transaction for ethers.js
            const formattedTx = {
                to: tx.to,
                value: ethers.BigNumber.from(tx.value),
                data: tx.data || '0x',
                gasLimit: ethers.BigNumber.from(tx.gasLimit),
                gasPrice: ethers.BigNumber.from(tx.gasPrice)
            };

            // Always use wallet for transaction signing and sending
            let relayedTx;
            try {
                // Sign and send transaction using wallet
                relayedTx = await this.wallet.sendTransaction(formattedTx);
            } catch (error) {
                console.error('Transaction signing failed:', error.message);
                throw error;
            }

            const receipt = await relayedTx.wait();
            if (receipt.status === 1) {
                console.log(`✓ Transaction ${txHash} relayed successfully`);
                this.metrics.successful++;

                // Generate Etherscan URL for verification
                const etherscanUrl = `https://etherscan.io/tx/${relayedTx.hash}`;
                console.log(`Transaction viewable at: ${etherscanUrl}`);
            } else {
                throw new Error('Transaction failed');
            }
        } catch (error) {
            console.error(`! Error relaying transaction ${txHash}:`, error.message);
            this.metrics.failed++;

            // Implement retry logic
            if (this.shouldRetry(txHash)) {
                this.metrics.retries++;
                await this.retryTransaction(txHash);
            }
        }
    }

    shouldRetry(txHash) {
        // Implement retry decision logic based on configuration
        return this.metrics.retries < this.config.metrics.retryAttempts;
    }

    async retryTransaction(txHash) {
        console.log(`Retrying transaction ${txHash}`);
        await new Promise(resolve => setTimeout(resolve, this.config.metrics.retryDelay));
        await this.relayTransaction(txHash);
    }

    getMetrics() {
        return {
            ...this.metrics,
            successRate: (this.metrics.successful / this.metrics.transactions * 100).toFixed(2) + '%',
            retrySuccessRate: (this.metrics.retries > 0 ? 
                ((this.metrics.successful - this.metrics.retries) / this.metrics.retries * 100).toFixed(2) : 
                'N/A') + '%'
        };
    }

    async stop() {
        if (this.provider) {
            await this.provider.disconnect();
        }
    }

    async waitForConnections(timeout = 30000) {
        console.log('Waiting for both providers to connect and verify networks...');
        const start = Date.now();
        let sourceVerified = false;
        let targetVerified = false;
        let attempts = 0;
        const maxAttempts = 5;
        const retryDelay = 2000;

        // Initial delay after provider initialization
        console.log('Waiting 3 seconds for providers to initialize...');
        await new Promise(resolve => setTimeout(resolve, 3000));

        // Helper function for direct chain ID verification
        const verifyChainId = async (provider, expectedChainId) => {
            try {
                // Make direct JSON-RPC call for chain ID
                const chainIdHex = await provider.send('eth_chainId', []);
                const chainId = parseInt(chainIdHex, 16);
                console.log(`Detected chain ID: ${chainId}, Expected: ${expectedChainId}`);
                if (chainId !== expectedChainId) {
                    console.log(`Chain ID mismatch for provider. Got ${chainId}, expected ${expectedChainId}`);
                }
                return chainId === expectedChainId;
            } catch (error) {
                console.log('Direct chain ID verification failed:', error.message);
                return false;
            }
        };

        while (Date.now() - start < timeout && attempts < maxAttempts) {
            attempts++;
            console.log(`\nAttempt ${attempts}/${maxAttempts}`);

            try {
                // Verify source network connection with direct RPC call
                if (this.provider && !sourceVerified) {
                    console.log('Attempting to verify source network...');
                    try {
                        const blockNumber = await this.provider.send('eth_blockNumber', []);
                        console.log(`Source provider block number: ${parseInt(blockNumber, 16)}`);
                        const isValidChainId = await verifyChainId(this.provider, this.config.sourceNetwork.chainId);
                        if (isValidChainId) {
                            this.connectionState.source = true;
                            sourceVerified = true;
                            console.log(`✓ Source network verified with chainId: ${this.config.sourceNetwork.chainId}`);
                        }
                    } catch (error) {
                        console.log('Source network verification failed:', error.message);
                    }
                }

                // Verify target network connection with direct RPC call
                if (this.ethProvider && !targetVerified) {
                    console.log('Attempting to verify target network (Ethereum)...');
                    try {
                        const blockNumber = await this.ethProvider.send('eth_blockNumber', []);
                        console.log(`Target provider block number: ${parseInt(blockNumber, 16)}`);
                        const isValidChainId = await verifyChainId(this.ethProvider, 1); // Ethereum mainnet
                        if (isValidChainId) {
                            this.connectionState.target = true;
                            targetVerified = true;
                            console.log('✓ Target network verified as Ethereum mainnet');
                        }
                    } catch (error) {
                        console.log('Target network verification failed:', error.message);
                    }
                }

                if (sourceVerified && targetVerified) {
                    console.log('✓ Both providers connected and networks verified successfully');
                    return true;
                }
            } catch (error) {
                console.log(`Network verification attempt ${attempts} failed:`, {
                    error: error.message,
                    code: error.code,
                    event: error.event,
                    reason: error.reason
                });
                console.log('Detailed provider states:', {
                    source: {
                        initialized: !!this.provider,
                        connected: this.connectionState.source,
                        network: sourceVerified ? 'verified' : 'unverified'
                    },
                    target: {
                        initialized: !!this.ethProvider,
                        connected: this.connectionState.target,
                        network: targetVerified ? 'verified' : 'unverified'
                    }
                });
            }

            if (!sourceVerified || !targetVerified) {
                console.log(`Waiting ${retryDelay}ms before next attempt...`);
                await new Promise(resolve => setTimeout(resolve, retryDelay));
            }
        }

        throw new Error(
            `Connection verification failed after ${attempts} attempts (${timeout}ms timeout).` +
            `\nSource verified: ${sourceVerified}` +
            `\nTarget verified: ${targetVerified}` +
            `\nLast attempt: ${new Date().toISOString()}`
        );
    }
}

module.exports = RelayManager;
