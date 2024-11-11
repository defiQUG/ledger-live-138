const { Prometheus } = require('prom-client');
const express = require('express');
const app = express();
const port = 3000;

// Create a Prometheus registry
const register = new Prometheus.Registry();

// Create a gauge metric
const transactionGauge = new Prometheus.Gauge({
    name: 'transaction_status',
    help: 'Status of transactions',
    registers: [register]
});

// Monitor transactions
function monitorTransactions() {
    // Logic to monitor transactions
    transactionGauge.set(1); // Example: set gauge to 1 for success
}

app.get('/metrics', async (req, res) => {
    res.set('Content-Type', register.contentType);
    res.end(await register.metrics());
});

app.listen(port, () => {
    console.log(`Monitoring server running on port ${port}`);
    monitorTransactions();
});
