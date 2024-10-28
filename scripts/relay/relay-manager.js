const { ethers } = require('ethers');
const { MockWebSocketProvider } = require('../mock/mock-provider.cjs');
const config = require('../config/network-config');

class RelayManager {
    constructor() {
        this.config = config;
        this.provider = null;
        this.ethProvider = null;
        this.metrics = {
            transactions: 0,
            successful: 0,
            failed: 0,
            retries: 0,
            disconnections: 0
        };
    }

    async initialize() {
        // Initialize providers based on configuration
        if (this.config.mock.enabled) {
            console.log('Using mock provider for development');
            this.provider = new MockWebSocketProvider(this.config.mainnet.ws, {
                chainId: this.config.mainnet.chainId,
                networkId: this.config.mainnet.networkId,
                name: this.config.mock.name
            });
        } else {
            console.log('Using real WebSocket provider');
            this.provider = new ethers.providers.WebSocketProvider(this.config.mainnet.ws);
        }

        // Initialize Ethereum mainnet provider for relay
        this.ethProvider = new ethers.providers.JsonRpcProvider(this.config.ethereum.rpc);

        // Set up event listeners
        this.provider.on('connect', () => this.handleConnect());
        this.provider.on('disconnect', () => this.handleDisconnect());
        this.provider.on('block', (blockNumber) => this.handleNewBlock(blockNumber));

        await this.provider.connect();
    }

    async handleConnect() {
        console.log('✓ Connected to provider');
    }

    async handleDisconnect() {
        console.log('! Network disconnection detected');
        this.metrics.disconnections++;
        console.log('Attempting reconnection...');
        await this.provider.connect();
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

            // Relay transaction to Ethereum mainnet
            const relayedTx = await this.ethProvider.sendTransaction({
                to: tx.to,
                from: tx.from,
                value: tx.value,
                data: tx.data,
                gasLimit: tx.gasLimit,
                gasPrice: tx.gasPrice
            });

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
}

module.exports = RelayManager;
