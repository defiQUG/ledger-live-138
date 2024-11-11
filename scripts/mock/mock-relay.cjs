const { MockProvider, MockWebSocketProvider } = require('./mock-provider.cjs');
const { promisify } = require('util');
const sleep = promisify(setTimeout);

class MockRelay {
    constructor(config = {}) {
        this.provider = new MockProvider(config);
        this.wsProvider = new MockWebSocketProvider('wss://mock.defi-oracle.io', config);
        this.isRunning = false;
        
        // Initialize counters for metrics
        this.metrics = {
            transactions: {
                started: 0,
                successful: 0,
                failed: 0
            },
            gasUsed: 0,
            lastBlockNumber: 0
        };
    }

    async start() {
        console.log('Starting mock relay...');
        this.isRunning = true;
        await this.wsProvider.connect();
        
        // Start monitoring for new blocks
        this.wsProvider.on('block', async (blockNumber) => {
            console.log(`\nNew block received: ${blockNumber}`);
            this.metrics.lastBlockNumber = blockNumber;
            await this.processBlock(blockNumber);
        });

        // Generate mock transactions periodically
        this.transactionInterval = setInterval(() => {
            if (this.isRunning) {
                this.generateAndProcessTransaction();
            }
        }, 10000); // Generate a new transaction every 10 seconds

        console.log('Mock relay started successfully');
        console.log('Monitoring for transactions...');
    }

    async stop() {
        console.log('\nStopping mock relay...');
        this.isRunning = false;
        await this.wsProvider.disconnect();
        if (this.transactionInterval) {
            clearInterval(this.transactionInterval);
        }
        console.log('Mock relay stopped');
        this.printMetrics();
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

            console.log(`\nProcessing transaction: ${txHash}`);
            this.metrics.transactions.started++;

            // Simulate transaction relay to Ethereum mainnet
            const relayedTx = await this.simulateRelayToMainnet(tx);
            
            if (relayedTx.status === 1) {
                this.metrics.transactions.successful++;
                this.metrics.gasUsed += parseInt(relayedTx.gasUsed);
                console.log(`✓ Transaction ${txHash} successfully relayed to mainnet`);
                console.log(`  View on Etherscan: https://etherscan.io/tx/${relayedTx.hash}`);
            } else {
                this.metrics.transactions.failed++;
                console.log(`✗ Transaction ${txHash} relay failed`);
            }
        } catch (error) {
            console.error(`Error processing transaction ${txHash}:`, error);
            this.metrics.transactions.failed++;
        }
    }

    async simulateRelayToMainnet(tx) {
        // Simulate network latency and processing time
        await sleep(1000);
        
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
            console.log('\nGenerated test transaction:', tx.hash);
            await this.processTransaction(tx.hash);
        } catch (error) {
            console.error('Error generating test transaction:', error);
        }
    }

    printMetrics() {
        console.log('\n=== Mock Relay Metrics ===');
        console.log(`Last Block Number: ${this.metrics.lastBlockNumber}`);
        console.log('\nTransactions:');
        console.log(`  Started:    ${this.metrics.transactions.started}`);
        console.log(`  Successful: ${this.metrics.transactions.successful}`);
        console.log(`  Failed:     ${this.metrics.transactions.failed}`);
        console.log(`\nTotal Gas Used: ${this.metrics.gasUsed}`);
        console.log('=====================');
    }
}

// Test script
async function testMockRelay() {
    const relay = new MockRelay();
    
    console.log('=== Starting Mock Relay Test ===');
    console.log('This test will:');
    console.log('1. Start the mock relay');
    console.log('2. Generate and process test transactions');
    console.log('3. Monitor block production');
    console.log('4. Run for 30 seconds');
    console.log('5. Display final metrics\n');

    await relay.start();

    // Run for 30 seconds
    await sleep(30000);

    await relay.stop();
    console.log('\nTest completed successfully');
}

// Run the test if this file is executed directly
if (require.main === module) {
    testMockRelay().catch(console.error);
}

module.exports = { MockRelay };
