import { ethers } from 'ethers';
import { MetricsCollector } from '../monitoring/metrics.js';
import dotenv from 'dotenv';

// Load environment variables with defaults
dotenv.config();
const MAX_RETRIES = parseInt(process.env.MAX_RETRIES || '3');
const RETRY_DELAY = parseInt(process.env.RETRY_DELAY || '1000');
const GAS_PRICE_BUFFER = parseFloat(process.env.GAS_PRICE_BUFFER || '1.2');
const MAX_GAS_PRICE = ethers.utils.parseUnits(process.env.MAX_GAS_PRICE || '100', 'gwei');
const CHAIN_ID = 138; // From listing data
const NETWORK_ID = 1;  // From listing data
const RPC_URLS = {
    http: 'https://rpc.defi-oracle.io',
    ws: 'wss://wss.defi-oracle.io'
};

class MainnetRelay {
    constructor(provider = RPC_URLS.http) {
        this.provider = new ethers.providers.JsonRpcProvider(provider, {
            chainId: CHAIN_ID,
            name: 'defi-oracle-meta'
        });
        this.wsProvider = new ethers.providers.WebSocketProvider(RPC_URLS.ws, {
            chainId: CHAIN_ID,
            name: 'defi-oracle-meta'
        });
        this.transactions = new Map();
        this.isInitialized = false;
        this.metrics = new MetricsCollector(parseInt(process.env.METRICS_PORT || '9090'));
    }

    async initialize(privateKey) {
        try {
            this.wallet = new ethers.Wallet(privateKey, this.provider);
            this.isInitialized = true;
            console.log('Mainnet relay initialized with address:', this.wallet.address);
            return true;
        } catch (error) {
            console.error('Failed to initialize mainnet relay:', error);
            return false;
        }
    }

    async relayTransaction(transaction) {
        if (!this.isInitialized) {
            throw new Error('Relay not initialized');
        }

        let attempts = 0;
        const maxRetries = process.env.MAX_RETRIES || 3;
        const retryDelay = process.env.RETRY_DELAY || 1000;
        const end = this.metrics.recordTransactionStart();

        while (attempts < maxRetries) {
            try {
                // Prepare transaction with EIP1559 support
                const tx = {
                    to: transaction.to,
                    value: transaction.value || 0,
                    data: transaction.data || '0x',
                    gasLimit: transaction.gasLimit || await this.estimateGas(transaction),
                    nonce: await this.wallet.getTransactionCount(),
                    type: 2, // EIP1559 transaction type
                    maxFeePerGas: transaction.maxFeePerGas,
                    maxPriorityFeePerGas: transaction.maxPriorityFeePerGas
                };

                // If EIP1559 params not provided, fall back to legacy
                if (!tx.maxFeePerGas || !tx.maxPriorityFeePerGas) {
                    delete tx.maxFeePerGas;
                    delete tx.maxPriorityFeePerGas;
                    delete tx.type;

                    const gasPrice = await this.provider.getGasPrice();
                    const maxGasPrice = ethers.utils.parseUnits(process.env.MAX_GAS_PRICE || '100', 'gwei');
                    if (gasPrice.gt(maxGasPrice)) {
                        throw new Error('Gas price exceeds maximum allowed');
                    }
                    tx.gasPrice = gasPrice;
                }

                // Send transaction
                const sentTx = await this.wallet.sendTransaction(tx);
                const network = await this.provider.getNetwork();

                // Generate explorer URLs based on chain configuration
                const blockscoutUrl = `https://blockscout.defi-oracle.io/tx/${sentTx.hash}`;
                const quorumUrl = `https://explorer.defi-oracle.io/tx/${sentTx.hash}`;

                console.log('Transaction sent:', sentTx.hash);
                console.log('View on Blockscout:', blockscoutUrl);
                console.log('View on Quorum Explorer:', quorumUrl);

                // Wait for confirmation and verify
                const receipt = await sentTx.wait(1); // Wait for 1 confirmation

                // Additional verification check
                if (!receipt.status) {
                    throw new Error('Transaction failed on-chain');
                }

                const txInfo = {
                    status: receipt.status,
                    blockNumber: receipt.blockNumber,
                    timestamp: Date.now(),
                    blockscoutUrl,
                    quorumUrl,
                    gasUsed: receipt.gasUsed.toString(),
                    effectiveGasPrice: receipt.effectiveGasPrice.toString(),
                    chainId: 138, // Defi Oracle Meta Mainnet chain ID
                    networkId: 1  // Network ID from listing data
                };

                this.transactions.set(sentTx.hash, txInfo);
                this.metrics.recordTransactionSuccess(sentTx.hash);
                this.metrics.updateGasUsage(receipt.gasUsed.toString());
                end(); // Stop timing the transaction

                // Wait for explorer indexing
                await new Promise(resolve => setTimeout(resolve, 5000));

                return {
                    success: true,
                    hash: sentTx.hash,
                    ...txInfo
                };
            } catch (error) {
                attempts++;
                console.error(`Transaction relay attempt ${attempts} failed:`, error);

                if (sentTx?.hash) {
                    this.metrics.recordTransactionFailure(sentTx.hash);
                }

                if (attempts >= maxRetries) {
                    end(); // Stop timing even on failure
                    throw error;
                }

                await new Promise(resolve => setTimeout(resolve, retryDelay));
            }
        }
    }

    async estimateGas(transaction) {
        try {
            const estimate = await this.provider.estimateGas({
                to: transaction.to,
                value: transaction.value || 0,
                data: transaction.data || '0x'
            });
            // Add configurable buffer for safety
            const buffer = process.env.GAS_PRICE_BUFFER || 1.2; // Default 20% buffer if not set
            const bufferBasisPoints = Math.floor(buffer * 100);
            return estimate.mul(bufferBasisPoints).div(100);
        } catch (error) {
            console.error('Gas estimation failed:', error);
            return ethers.BigNumber.from('500000'); // Fallback gas limit
        }
    }

    getTransaction(hash) {
        return this.transactions.get(hash);
    }

    getAllTransactions() {
        return Array.from(this.transactions.entries()).map(([hash, info]) => ({
            hash,
            ...info
        }));
    }

    async shutdown() {
        if (this.metrics) {
            await this.metrics.shutdown();
            console.log('Metrics server shut down successfully');
        }

        // Clear transaction map and reset initialization
        this.transactions.clear();
        this.isInitialized = false;
    }
}

// Export the class
export default MainnetRelay;
