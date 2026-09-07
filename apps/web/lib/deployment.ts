import devnet from "../../../deployments/devnet.json";

export const devnetDeployment = devnet;

export const marketplaceDeployment = devnet.marketplaceArtifact;

export const hardenedDeploymentReady =
  typeof devnet.hardenedArtifact.programId === "string";

export const marketplaceDeploymentReady =
  typeof marketplaceDeployment.programId === "string";
