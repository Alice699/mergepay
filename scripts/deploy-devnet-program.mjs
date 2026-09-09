import fs from "node:fs";
import path from "node:path";
import {
  Keypair,
  ProgramDeployment,
  RIALO_DEVNET_CHAIN,
  createRialoClient,
} from "@rialo/ts-cdk";

const artifactPath = path.resolve(
  process.cwd(),
  process.argv[2] ??
    "programs/mergepay-rialo/target/rialo-build/mergepay-rialo-riscv/mergepay_rialo.polkavm",
);

if (!fs.existsSync(artifactPath)) {
  throw new Error(`Artifact not found: ${artifactPath}`);
}

const client = createRialoClient({
  chain: RIALO_DEVNET_CHAIN,
  transport: {
    timeout: 60_000,
    maxRetries: 5,
    retryBaseDelay: 500,
    retryMaxDelay: 3_000,
  },
});
const payer = Keypair.generate();
const programKeypair = Keypair.generate();

try {
  // DevNet faucet requests are capped at 1 RLO; two requests cover the
  // program rent reserve and deployment transaction fees.
  for (let index = 0; index < 2; index += 1) {
    const result = await client.requestAirdropAndConfirm(
      payer.publicKey,
      1_000_000_000n,
      { maxRetries: 60, retryDelayMs: 1_000 },
    );
    console.error(`Airdrop ${index + 1}/2 confirmed: ${result.signature}`);
  }

  const programData = new Uint8Array(fs.readFileSync(artifactPath));
  const deployment = new ProgramDeployment({
    programData,
    programKeypair,
    config: {
      chunkSize: 900,
      maxRetries: 5,
      confirmationBatchSize: 25,
    },
  });
  const programId = await deployment.deploy(client, payer);
  const account = await client.getAccountInfo(programId);

  console.log(
    JSON.stringify(
      {
        programId: programId.toString(),
        payer: payer.publicKey.toString(),
        artifactPath,
        artifactBytes: programData.length,
        account: account
          ? {
              kelvin: account.kelvin.toString(),
              owner: account.owner.toString(),
              space: account.space.toString(),
              executable: account.executable,
            }
          : null,
      },
      null,
      2,
    ),
  );
} finally {
  payer.dispose();
  programKeypair.dispose();
}
