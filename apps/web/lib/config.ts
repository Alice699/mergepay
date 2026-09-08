import type { RialoNetwork } from "@mergepay/rialo-client";
import { marketplaceDeployment } from "./deployment";

const supportedNetworks: readonly RialoNetwork[] = [
  "devnet",
  "testnet",
  "mainnet",
  "localnet",
];

const configuredNetwork = process.env.NEXT_PUBLIC_RIALO_NETWORK;
const configuredRpcUrl = process.env.NEXT_PUBLIC_RIALO_RPC_URL?.trim();
const configuredProgramId = process.env.NEXT_PUBLIC_MERGEPAY_PROGRAM_ID?.trim();

function isRialoNetwork(value: string | undefined): value is RialoNetwork {
  return value !== undefined && supportedNetworks.includes(value as RialoNetwork);
}

export const webConfig = {
  network: isRialoNetwork(configuredNetwork) ? configuredNetwork : "devnet",
  rpcUrl: configuredRpcUrl || "/api/rialo",
  // DevNet has one canonical marketplace deployment. This prevents an old
  // local/hosted env value from creating or claiming workflows under a
  // different program than the listing and decoder use.
  programId:
    (isRialoNetwork(configuredNetwork) ? configuredNetwork : "devnet") === "devnet"
      ? marketplaceDeployment.programId
      : configuredProgramId || null,
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
