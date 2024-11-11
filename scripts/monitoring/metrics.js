import promClient from 'prom-client';
import express from 'express';
const app = express();

// Create a Registry to register the metrics
const register = new promClient.Registry();

// Add a default label which is added to all metrics
register.setDefaultLabels({
    app: 'defi-oracle-meta'
});

// Enable the collection of default metrics
promClient.collectDefaultMetrics({ register });

// Custom metrics
const transactionCounter = new promClient.Counter({
    name: 'defi_oracle_transactions_total',
    help: 'Total number of transactions processed by the bridge',
    labelNames: ['status']
});

const transactionDuration = new promClient.Histogram({
    name: 'defi_oracle_transaction_duration_seconds',
    help: 'Time taken to process bridge transactions',
    buckets: [0.1, 0.5, 1, 2, 5]
});

const gasUsageGauge = new promClient.Gauge({
    name: 'defi_oracle_gas_usage',
    help: 'Current gas usage for bridge transactions'
});

const queueSizeGauge = new promClient.Gauge({
    name: 'defi_oracle_queue_size',
    help: 'Current size of the transaction queue'
});

const etherscanVerificationDuration = new promClient.Histogram({
    name: 'defi_oracle_etherscan_verification_duration_seconds',
    help: 'Time taken to verify transactions on Etherscan',
    buckets: [1, 5, 10, 30, 60]
});

// Register custom metrics
register.registerMetric(transactionCounter);
register.registerMetric(transactionDuration);
register.registerMetric(gasUsageGauge);
register.registerMetric(queueSizeGauge);
register.registerMetric(etherscanVerificationDuration);

// Expose metrics endpoint
app.get('/metrics', async (req, res) => {
    try {
        res.set('Content-Type', register.contentType);
        res.end(await register.metrics());
    } catch (err) {
        res.status(500).end(err);
    }
});

// Health check endpoint
app.get('/health', (req, res) => {
    res.status(200).json({ status: 'healthy' });
});

class MetricsCollector {
    constructor(port = 9090) {
        this.server = app.listen(port, () => {
            console.log(`Metrics server listening on port ${port}`);
        });
    }

    // Transaction metrics
    recordTransactionStart(txHash) {
        const end = transactionDuration.startTimer();
        return end;
    }

    recordTransactionSuccess(txHash) {
        transactionCounter.labels('success').inc();
    }

    recordTransactionFailure(txHash) {
        transactionCounter.labels('failure').inc();
    }

    // Gas usage metrics
    updateGasUsage(gasAmount) {
        gasUsageGauge.set(gasAmount);
    }

    // Queue metrics
    updateQueueSize(size) {
        queueSizeGauge.set(size);
    }

    // Etherscan verification metrics
    recordVerificationStart(txHash) {
        const end = etherscanVerificationDuration.startTimer();
        return end;
    }

    // Graceful shutdown
    async shutdown() {
        if (this.server) {
            await new Promise((resolve) => {
                this.server.close(resolve);
            });
        }
    }
}

export { MetricsCollector, transactionCounter, transactionDuration, gasUsageGauge, queueSizeGauge, etherscanVerificationDuration };
export default MetricsCollector;
