import devnet from "../../../deployments/devnet.json";

export const devnetDeployment = devnet;

// The latest policy-locked autonomous-settlement program is the active DevNet
// deployment. Keep previous artifacts in the registry as historical evidence, but
// never create a new workflow against them.
export const marketplaceDeployment = devnet.autonomousSettlementCandidate;

export const hardenedDeploymentReady =
  typeof devnet.hardenedArtifact.programId === "string";

export const marketplaceDeploymentReady =
  typeof marketplaceDeployment.programId === "string";
