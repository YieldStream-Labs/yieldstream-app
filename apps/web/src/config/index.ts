export const CONFIG = {
  networkPassphrase:
    process.env.NEXT_PUBLIC_NETWORK_PASSPHRASE ||
    "Test SDF Network ; September 2015",
  rpcUrl:
    process.env.NEXT_PUBLIC_RPC_URL ||
    "https://soroban-testnet.stellar.org",
  contractId:
    process.env.NEXT_PUBLIC_DISTRIBUTOR_CONTRACT_ID ||
    "CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAD2KM",
  horizonUrl:
    process.env.HORIZON_URL ||
    "https://horizon-testnet.stellar.org",
};
