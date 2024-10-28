// Network configuration for DeFi Oracle Meta Mainnet integration
const config = {
    mock: {
        enabled: true, // Set to false when real endpoints are available
        blockTime: 5000,
        chainId: 138,
        networkId: 1,
        name: 'defi-oracle-meta'
    },
    mainnet: {
        // DeFi Oracle Meta Mainnet configuration from eip155-138+2.json
        rpc: 'https://rpc.defi-oracle.io',
        ws: 'wss://wss.defi-oracle.io',
        chainId: 138,
        networkId: 1,
        explorers: {
            blockscout: 'https://blockscout.defi-oracle.io',
            quorum: 'https://explorer.defi-oracle.io'
        }
    },
    ethereum: {
        // Ethereum mainnet configuration for transaction relay
        rpc: 'https://rpc.ankr.com/eth', // Ankr's public endpoint
        chainId: 1,
        networkId: 1,
        name: 'mainnet',
        network: 'mainnet',
        _defaultProvider: null,
        ensAddress: null,
        _network: {
            chainId: 1,
            name: 'mainnet'
        },
        etherscan: {
            baseUrl: 'https://api.etherscan.io/api',
            apiKey: process.env.ETHERSCAN_API_KEY || 'YourApiKey' // Use env var if available
        }
    },
    metrics: {
        enabled: true,
        collectInterval: 5000, // milliseconds
        retryAttempts: 3,
        retryDelay: 1000 // milliseconds
    }
};

module.exports = config;
