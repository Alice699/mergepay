import type { RialoNetwork } from "@mergepay/rialo-client";

const supportedNetworks: readonly RialoNetwork[] = [
  "devnet",
  "testnet",
  "mainnet",
  "localnet",
];

const configuredNetwork = process.env.NEXT_PUBLIC_RIALO_NETWORK;
const configuredRpcUrl = process.env.NEXT_PUBLIC_RIALO_RPC_URL?.trim();

function isRialoNetwork(value: string | undefined): value is RialoNetwork {
  return value !== undefined && supportedNetworks.includes(value as RialoNetwork);
}

export const webConfig = {
  network: isRialoNetwork(configuredNetwork) ? configuredNetwork : "devnet",
  rpcUrl: configuredRpcUrl || "/api/rialo",
  programId: process.env.NEXT_PUBLIC_MERGEPAY_PROGRAM_ID || null,
} as const;

export function networkLabel(network: RialoNetwork): string {
  const labels: Record<RialoNetwork, string> = {
    devnet: "DevNet",
    testnet: "TestNet",
    mainnet: "MainNet",
    localnet: "LocalNet",
  };
  return labels[network];
}
