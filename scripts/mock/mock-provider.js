// Mock Provider Implementation for Testing Transaction Relay
import { EventEmitter } from 'events';

class MockProvider extends EventEmitter {
    constructor(config = {}) {
        super();
        this.blockNumber = 0;
        this.transactions = new Map();
        this.config = {
            chainId: 138,
            networkId: 1,
            name: 'defi-oracle-meta',
            ...config
        };
        this.interval = null;
    }

    async getNetwork() {
        return {
            chainId: this.config.chainId,
            name: this.config.name
        };
    }

    async getBlockNumber() {
        return this.blockNumber;
    }

    async getBlock(blockNumberOrHash) {
        const number = typeof blockNumberOrHash === 'string' ? 
            parseInt(blockNumberOrHash) : 
            blockNumberOrHash;
            
        return {
            number: this.blockNumber,
            hash: `0x${Buffer.from(this.blockNumber.toString()).toString('hex').padStart(64, '0')}`,
            timestamp: Math.floor(Date.now() / 1000),
            transactions: Array.from(this.transactions.keys())
        };
    }

    async getTransaction(hash) {
        return this.transactions.get(hash) || null;
    }

    async sendTransaction(transaction) {
        const hash = `0x${Buffer.from(Date.now().toString()).toString('hex').padStart(64, '0')}`;
        const tx = {
            ...transaction,
            hash,
            blockNumber: this.blockNumber,
            timestamp: Math.floor(Date.now() / 1000),
            status: 1
        };
        this.transactions.set(hash, tx);
        return tx;
    }

    // Simulate block production
    startBlockProduction(interval = 5000) {
        this.interval = setInterval(() => {
            this.blockNumber++;
            this.emit('block', this.blockNumber);
        }, interval);
    }

    stopBlockProduction() {
        if (this.interval) {
            clearInterval(this.interval);
            this.interval = null;
        }
    }

    // Get transaction receipt (simulated)
    async getTransactionReceipt(hash) {
        const tx = await this.getTransaction(hash);
        if (!tx) return null;

        return {
            ...tx,
            status: 1,
            gasUsed: '21000',
            effectiveGasPrice: '1000000000'
        };
    }

    // Generate mock transaction for testing
    generateMockTransaction() {
        const hash = `0x${Buffer.from(Date.now().toString()).toString('hex').padStart(64, '0')}`;
        const tx = {
            hash,
            from: '0x' + '1'.repeat(40),
            to: '0x' + '2'.repeat(40),
            value: '1000000000000000000',
            gasLimit: '21000',
            gasPrice: '1000000000',
            nonce: this.transactions.size,
            data: '0x',
            chainId: this.config.chainId,
            blockNumber: this.blockNumber,
            timestamp: Math.floor(Date.now() / 1000),
            status: 1
        };
        this.transactions.set(hash, tx);
        return tx;
    }
}

export class MockWebSocketProvider extends EventEmitter {
    constructor(url, config = {}) {
        super();
        this.mockProvider = new MockProvider(config);
        this.connected = false;
        this.url = url;
    }

    async connect() {
        this.connected = true;
        this.mockProvider.startBlockProduction();
        this.emit('connect');
        
        // Forward block events
        this.mockProvider.on('block', (blockNumber) => {
            this.emit('block', blockNumber);
        });
    }

    async disconnect() {
        this.connected = false;
        this.mockProvider.stopBlockProduction();
        this.emit('disconnect');
    }

    isConnected() {
        return this.connected;
    }

    async getBlockNumber() {
        return this.mockProvider.getBlockNumber();
    }

    async getBlock(blockNumber) {
        return this.mockProvider.getBlock(blockNumber);
    }

    async getTransaction(hash) {
        return this.mockProvider.getTransaction(hash);
    }

    // Helper method to generate test transactions
    generateTestTransaction() {
        return this.mockProvider.generateMockTransaction();
    }
}

// Export both providers
export { MockProvider };
