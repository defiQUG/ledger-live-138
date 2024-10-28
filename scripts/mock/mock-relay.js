import { MockProvider, MockWebSocketProvider } from './mock-provider.js';
import { MetricsCollector } from '../monitoring/metrics.js';

class MockRelay {
    constructor(config = {}) {
        this.provider = new MockProvider(config);
        this.wsProvider = new MockWebSocketProvider('wss://mock.defi-oracle.io', config);
        this.metrics = new MetricsCollector(parseInt(process.env.METRICS_PORT || '9091'));
        this.isRunning = false;
    }

    async start() {
        console.log('Starting mock relay...');
        this.isRunning = true;
        await this.wsProvider.connect();
        
        // Start monitoring for new blocks
        this.wsProvider.on('block', async (blockNumber) => {
            console.log(`New block received: ${blockNumber}`);
            await this.processBlock(blockNumber);
        });

        // Generate mock transactions periodically
        this.transactionInterval = setInterval(() => {
            if (this.isRunning) {
                this.generateAndProcessTransaction();
            }
        }, 10000); // Generate a new transaction every 10 seconds

        console.log('Mock relay started successfully');
    }

    async stop() {
        console.log('Stopping mock relay...');
        this.isRunning = false;
        await this.wsProvider.disconnect();
        if (this.transactionInterval) {
            clearInterval(this.transactionInterval);
        }
        console.log('Mock relay stopped');
    }

    async processBlock(blockNumber) {
        try {
            const block = await this.wsProvider.getBlock(blockNumber);
            console.log(`Processing block ${blockNumber} with ${block.transactions.length} transactions`);
            
            for (const txHash of block.transactions) {
                await this.processTransaction(txHash);
            }
        } catch (error) {
            console.error(`Error processing block ${blockNumber}:`, error);
        }
    }

    async processTransaction(txHash) {
        try {
            const tx = await this.wsProvider.getTransaction(txHash);
            if (!tx) return;

            console.log(`Processing transaction: ${txHash}`);
            this.metrics.recordTransactionStart();

            // Simulate transaction relay to Ethereum mainnet
            const relayedTx = await this.simulateRelayToMainnet(tx);
            
            if (relayedTx.status === 1) {
                this.metrics.recordTransactionSuccess();
                console.log(`Transaction ${txHash} successfully relayed to mainnet`);
                console.log(`View on Etherscan: https://etherscan.io/tx/${relayedTx.hash}`);
            } else {
                this.metrics.recordTransactionFailure();
                console.log(`Transaction ${txHash} relay failed`);
            }

            // Record gas usage
            this.metrics.recordGasUsage(parseInt(relayedTx.gasUsed));
        } catch (error) {
            console.error(`Error processing transaction ${txHash}:`, error);
            this.metrics.recordTransactionFailure();
        }
    }

    async simulateRelayToMainnet(tx) {
        // Simulate network latency
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        return {
            ...tx,
            status: 1,
            gasUsed: '50000',
            hash: `0x${Buffer.from(Date.now().toString()).toString('hex').padStart(64, '0')}`
        };
    }

    async generateAndProcessTransaction() {
        try {
            const tx = this.wsProvider.generateTestTransaction();
            console.log('Generated test transaction:', tx.hash);
            await this.processTransaction(tx.hash);
        } catch (error) {
            console.error('Error generating test transaction:', error);
        }
    }

    // Get current metrics
    async getMetrics() {
        return this.metrics.getMetrics();
    }
}

// Test the mock relay
async function testMockRelay() {
    const relay = new MockRelay();
    
    console.log('Starting mock relay test...');
    await relay.start();

    // Run for 1 minute
    await new Promise(resolve => setTimeout(resolve, 60000));

    console.log('Stopping mock relay...');
    await relay.stop();

    const metrics = await relay.getMetrics();
    console.log('Final metrics:', metrics);
}

// Run the test if this file is executed directly
if (process.argv[1] === import.meta.url) {
    testMockRelay().catch(console.error);
}

export { MockRelay };
