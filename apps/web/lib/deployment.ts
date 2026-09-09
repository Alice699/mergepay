import devnet from "../../../deployments/devnet.json";

export const devnetDeployment = devnet;

// The autonomous-settlement candidate is now the active DevNet deployment for
// local verification. Keep the previous marketplace artifact in the registry
// as historical evidence, but never create a new workflow against it.
export const marketplaceDeployment = devnet.autonomousSettlementCandidate;

export const hardenedDeploymentReady =
  typeof devnet.hardenedArtifact.programId === "string";

export const marketplaceDeploymentReady =
  typeof marketplaceDeployment.programId === "string";
