import { MetricsCollector } from './metrics.js';
import { ethers } from 'ethers';
import ReconnectingWebSocket from 'reconnecting-websocket';
import WebSocket from 'ws';

class TransactionMonitor {
    constructor(wsProvider = 'wss://wss.defi-oracle.io') {
        this.wsUrl = wsProvider;
        this.metrics = new MetricsCollector(parseInt(process.env.METRICS_PORT || '9091'));
        this.isRunning = false;
        this.reconnectAttempts = 0;
        this.maxReconnectAttempts = 5;
        this.reconnectDelay = 1000; // Start with 1 second delay
    }

    async setupWebSocket() {
        const options = {
            WebSocket: WebSocket,
            connectionTimeout: 5000,
            maxRetries: 10,
            maxReconnectionDelay: 10000,
            minReconnectionDelay: 1000
        };

        const ws = new ReconnectingWebSocket(this.wsUrl, [], options);
        
        this.provider = new ethers.providers.WebSocketProvider(
            ws,
            {
                chainId: 138,
                name: 'defi-oracle-meta'
            }
        );

        ws.addEventListener('open', () => {
            console.log('WebSocket connection established');
            this.reconnectAttempts = 0;
            this.reconnectDelay = 1000;
        });

        ws.addEventListener('error', (error) => {
            console.error('WebSocket error:', error);
            this.metrics.recordConnectionError();
        });

        ws.addEventListener('close', () => {
            console.log('WebSocket connection closed');
            this.handleReconnection();
        });

        return this.provider;
    }

    async handleReconnection() {
        if (this.reconnectAttempts >= this.maxReconnectAttempts) {
            console.error('Max reconnection attempts reached. Stopping monitor...');
            await this.stop();
            return;
        }

        this.reconnectAttempts++;
        this.reconnectDelay *= 2; // Exponential backoff
        console.log(`Attempting to reconnect (${this.reconnectAttempts}/${this.maxReconnectAttempts}) in ${this.reconnectDelay}ms...`);
        
        setTimeout(async () => {
            try {
                await this.setupWebSocket();
                if (this.isRunning) {
                    await this.startBlockMonitoring();
                }
            } catch (error) {
                console.error('Reconnection failed:', error);
            }
        }, this.reconnectDelay);
    }

    async startBlockMonitoring() {
        // Monitor new blocks for transactions
        this.provider.on('block', async (blockNumber) => {
            try {
                const block = await this.provider.getBlock(blockNumber, true);
                if (!block) return;

                console.log(`New block ${blockNumber}: ${block.transactions.length} transactions`);
                this.metrics.updateBlockHeight(blockNumber);
                
                // Process each transaction in the block
                for (const tx of block.transactions) {
                    try {
                        const receipt = await this.provider.getTransactionReceipt(tx.hash);
                        if (!receipt) continue;

                        const txInfo = {
                            hash: tx.hash,
                            blockNumber,
                            status: receipt.status,
                            gasUsed: receipt.gasUsed.toString(),
                            timestamp: Date.now(),
                            blockscoutUrl: `https://blockscout.defi-oracle.io/tx/${tx.hash}`,
                            quorumUrl: `https://explorer.defi-oracle.io/tx/${tx.hash}`
                        };

                        console.log(`Transaction processed: ${tx.hash}`);
                        console.log('View on Blockscout:', txInfo.blockscoutUrl);
                        console.log('View on Quorum Explorer:', txInfo.quorumUrl);

                        // Update metrics
                        this.metrics.updateGasUsage(receipt.gasUsed);
                        if (receipt.status) {
                            this.metrics.recordTransactionSuccess(tx.hash);
                        } else {
                            this.metrics.recordTransactionFailure(tx.hash);
                        }
                    } catch (txError) {
                        console.error(`Error processing transaction ${tx.hash}:`, txError);
                        this.metrics.recordTransactionError(tx.hash);
                    }
                }
            } catch (blockError) {
                console.error('Error processing block:', blockError);
                this.metrics.recordBlockError(blockNumber);
            }
        });
    }

    async start() {
        if (this.isRunning) return;
        
        try {
            await this.setupWebSocket();
            await this.startBlockMonitoring();
            this.isRunning = true;
            console.log('Transaction monitor started');
        } catch (error) {
            console.error('Failed to start transaction monitor:', error);
            throw error;
        }
    }

    async stop() {
        if (!this.isRunning) return;
        
        try {
            // Remove all event listeners
            this.provider.removeAllListeners();
            
            // Close WebSocket connection
            if (this.provider._websocket) {
                this.provider._websocket.close();
            }
            
            // Shutdown metrics server
            await this.metrics.shutdown();
            
            this.isRunning = false;
            console.log('Transaction monitor stopped');
        } catch (error) {
            console.error('Error stopping transaction monitor:', error);
            throw error;
        }
    }
}

export default TransactionMonitor;
