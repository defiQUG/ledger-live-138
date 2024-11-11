const { EventEmitter } = require('events');

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
        // Format transaction values, handling BigNumber objects
        const formattedTx = {
            to: transaction.to,
            from: transaction.from || '0x' + '1'.repeat(40),
            // Extract hex value if BigNumber, otherwise use directly
            value: transaction.value?.hex || transaction.value || '0x0',
            gasLimit: transaction.gasLimit?.hex || transaction.gasLimit || '0x5208',
            gasPrice: transaction.gasPrice?.hex || transaction.gasPrice || '0x3b9aca00',
            data: transaction.data || '0x',
            hash,
            blockNumber: this.blockNumber,
            timestamp: Math.floor(Date.now() / 1000),
            status: 1,
            wait: async () => {
                return {
                    to: transaction.to,
                    from: transaction.from || '0x' + '1'.repeat(40),
                    hash,
                    blockNumber: this.blockNumber,
                    status: 1,
                    gasUsed: '0x5208', // 21000 in hex
                    effectiveGasPrice: '0x3b9aca00' // 1 gwei in hex
                };
            }
        };
        this.transactions.set(hash, formattedTx);
        return formattedTx;
    }

    startBlockProduction(interval = 5000) {
        this.interval = setInterval(() => {
            this.blockNumber++;
            // Generate 1-3 random transactions per block
            const txCount = Math.floor(Math.random() * 3) + 1;
            for (let i = 0; i < txCount; i++) {
                this.generateMockTransaction();
            }
            this.emit('block', this.blockNumber);
        }, interval);
    }

    stopBlockProduction() {
        if (this.interval) {
            clearInterval(this.interval);
            this.interval = null;
        }
    }

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

    generateMockTransaction() {
        const hash = `0x${Buffer.from(Date.now().toString()).toString('hex').padStart(64, '0')}`;
        const tx = {
            hash,
            from: '0x' + '1'.repeat(40),
            to: '0x' + '2'.repeat(40),
            value: `0x${(1000000000000000000n).toString(16)}`,  // 1 ETH in wei, hex format
            gasLimit: `0x${(21000n).toString(16)}`,  // Standard gas limit in hex
            gasPrice: `0x${(1000000000n).toString(16)}`,  // 1 Gwei in hex
            nonce: `0x${this.transactions.size.toString(16)}`,  // Hex nonce
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

class MockWebSocketProvider extends EventEmitter {
    constructor(url, config = {}) {
        super();
        this.mockProvider = new MockProvider(config);
        this.connected = false;
        this.url = url;
        this.networkState = {
            chainId: config.chainId || 138,
            name: config.name || 'defi-oracle-meta',
            ensAddress: null,
            _defaultProvider: null
        };
        this.connectionAttempts = 0;
        this.maxRetries = 3;
    }

    async connect() {
        try {
            if (this.connectionAttempts >= this.maxRetries) {
                throw new Error('Max connection attempts reached');
            }
            this.connectionAttempts++;

            // Simulate network detection
            await this.detectNetwork();

            this.connected = true;
            this.mockProvider.startBlockProduction();
            this.emit('connect');

            this.mockProvider.on('block', (blockNumber) => {
                this.emit('block', blockNumber);
            });
        } catch (error) {
            this.emit('error', error);
            throw error;
        }
    }

    async detectNetwork() {
        // Simulate network detection delay
        await new Promise(resolve => setTimeout(resolve, 100));
        return this.networkState;
    }

    async disconnect() {
        this.connected = false;
        this.mockProvider.stopBlockProduction();
        this.connectionAttempts = 0;
        this.emit('disconnect');
    }

    isConnected() {
        return this.connected;
    }

    async getBlockNumber() {
        this.ensureConnected();
        return this.mockProvider.getBlockNumber();
    }

    async getBlock(blockNumber) {
        this.ensureConnected();
        return this.mockProvider.getBlock(blockNumber);
    }

    async getTransaction(hash) {
        this.ensureConnected();
        return this.mockProvider.getTransaction(hash);
    }

    async getTransactionReceipt(hash) {
        this.ensureConnected();
        return this.mockProvider.getTransactionReceipt(hash);
    }

    generateTestTransaction() {
        this.ensureConnected();
        return this.mockProvider.generateMockTransaction();
    }

    async sendTransaction(transaction) {
        this.ensureConnected();
        return this.mockProvider.sendTransaction(transaction);
    }

    async send(method, params) {
        this.ensureConnected();

        switch (method) {
            case 'eth_chainId':
                return `0x${this.networkState.chainId.toString(16)}`;
            case 'eth_networkVersion':
            case 'net_version':
                return this.networkState.chainId.toString();
            case 'eth_blockNumber':
                const blockNumber = await this.mockProvider.getBlockNumber();
                return `0x${blockNumber.toString(16)}`;
            case 'eth_getBlockByNumber':
                const block = await this.mockProvider.getBlock(parseInt(params[0], 16));
                return block;
            case 'eth_getTransactionByHash':
                return await this.mockProvider.getTransaction(params[0]);
            case 'eth_getTransactionReceipt':
                return await this.mockProvider.getTransactionReceipt(params[0]);
            case 'net_listening':
                return true;
            case 'eth_syncing':
                return false;
            default:
                throw new Error(`Method ${method} not implemented`);
        }
    }

    async getNetwork() {
        if (!this.connected) {
            try {
                await this.connect();
            } catch (error) {
                console.log('Network detection during connection attempt failed:', error.message);
                // Return minimal network info to allow initialization to proceed
                return {
                    chainId: this.networkState.chainId,
                    name: this.networkState.name
                };
            }
        }

        try {
            // Verify chain ID with direct RPC call
            const chainIdHex = await this.send('eth_chainId', []);
            const chainId = parseInt(chainIdHex, 16);

            if (chainId !== this.networkState.chainId) {
                console.log(`Chain ID mismatch. Expected ${this.networkState.chainId}, got ${chainId}`);
            }

            // Return simplified network state matching ethers.js Network interface
            return {
                chainId: chainId,
                name: this.networkState.name,
                ensAddress: null,
                _defaultProvider: null
            };
        } catch (error) {
            console.log('Network detection failed:', error.message);
            return {
                chainId: this.networkState.chainId,
                name: this.networkState.name
            };
        }
    }

    ensureConnected() {
        if (!this.connected) {
            throw new Error('Provider not connected');
        }
    }
}

module.exports = {
    MockProvider,
    MockWebSocketProvider
};
