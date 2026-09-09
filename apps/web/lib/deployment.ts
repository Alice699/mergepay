import devnet from "../../../deployments/devnet.json";

export const devnetDeployment = devnet;

// The runtime-proven autonomous-settlement program is the active DevNet deployment.
// Keep the previous marketplace artifact in the registry
// as historical evidence, but never create a new workflow against it.
export const marketplaceDeployment = devnet.autonomousSettlementCandidate;

export const hardenedDeploymentReady =
  typeof devnet.hardenedArtifact.programId === "string";

export const marketplaceDeploymentReady =
  typeof marketplaceDeployment.programId === "string";
