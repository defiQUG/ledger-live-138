import MainnetRelay from './mainnet-relay.js';

// Create singleton instance
const relay = new MainnetRelay(process.env.MAINNET_RPC_URL);

export default relay;
