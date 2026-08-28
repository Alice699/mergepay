import devnet from "../../../deployments/devnet.json";

export const devnetDeployment = devnet;

export const hardenedDeploymentReady =
  typeof devnet.hardenedArtifact.programId === "string";
