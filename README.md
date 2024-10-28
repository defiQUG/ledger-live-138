# DeFi Oracle Meta Transaction Relay

A transaction relay system that forwards transactions from the DeFi Oracle Meta network to the Ethereum Mainnet, making them viewable on Etherscan. This implementation includes a mock provider for development and testing purposes.

## Implemented Features

- Transaction relay from DeFi Oracle Meta to Ethereum Mainnet
- Mock provider implementation for development and testing
- Basic transaction monitoring and metrics collection
- Etherscan integration for transaction verification
- Automatic retry mechanisms for failed transactions
- Network state verification and connection management

## Quick Start

1. Clone the repository
2. Install dependencies:
   ```bash
   npm install
   ```
3. Copy `.env.example` to `.env` and configure:
   ```bash
   cp .env.example .env
   ```

## Configuration

Required environment variables in `.env`:

```
ETHEREUM_RPC_URL=https://rpc.ankr.com/eth
ETHEREUM_PRIVATE_KEY=your_private_key_here
MOCK_ENABLED=true  # Set to false for production
```

## Usage

### Development Mode (Mock Provider)
```bash
node scripts/verify-relay.cjs --mock
```

### Production Mode
```bash
node scripts/verify-relay.cjs
```

## Components

### RelayManager
- Manages transaction relay between networks
- Handles network connections and verification
- Implements retry mechanisms for failed transactions
- Collects transaction metrics

### Mock Provider
- Simulates DeFi Oracle Meta network for development
- Generates mock transactions for testing
- Simulates block production and network events
- Provides WebSocket connection simulation

### Monitoring System
- Tracks transaction success/failure rates
- Monitors network connection status
- Collects performance metrics:
  - Transaction count
  - Success rate
  - Retry attempts
  - Connection status

## Development

The mock provider implementation allows development and testing without requiring access to the actual DeFi Oracle Meta network. It simulates:

- Transaction generation
- Block production
- Network events
- Connection states

### Mock Transaction Format
```javascript
{
    to: "0x...",
    value: "0x...",
    gasLimit: "0x...",
    gasPrice: "0x...",
    data: "0x",
    nonce: "0x..."
}
```

## Metrics

The system collects the following metrics:
- Total transactions processed
- Successful transactions
- Failed transactions
- Retry attempts
- Network disconnections

## Error Handling

- Automatic retry for failed transactions
- Network connection recovery
- Transaction receipt verification
- Error logging and monitoring

## Security Notes

- Never commit `.env` files containing private keys
- Use `.env.example` for configuration templates
- Keep private keys and sensitive data secure
- Monitor transaction relay status regularly

## License

MIT
