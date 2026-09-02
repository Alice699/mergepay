import assert from "node:assert/strict";
import test from "node:test";
import { Keypair } from "@rialo/ts-cdk";
import {
  decryptWalletSecret,
  encryptWalletSecret,
  parseWalletBackup,
  serializeWalletBackup,
} from "../lib/embedded-wallet.ts";

test("encrypts and authenticates an embedded Rialo DevNet key", async () => {
  const keypair = Keypair.generate();
  const secretKey = keypair.secretKeyBytes();
  const password = "correct horse battery staple";

  try {
    const vault = await encryptWalletSecret(
      secretKey,
      keypair.publicKey.toString(),
      password,
    );
    const serialized = serializeWalletBackup(vault);

    assert.equal(vault.network, "devnet");
    assert.equal(vault.kdf.name, "PBKDF2");
    assert.equal(vault.kdf.iterations, 600_000);
    assert.equal(vault.cipher.name, "AES-GCM");
    assert.equal(serialized.includes(password), false);
    assert.deepEqual(parseWalletBackup(serialized), vault);

    const restoredSecret = await decryptWalletSecret(vault, password);
    try {
      assert.deepEqual(restoredSecret, secretKey);
    } finally {
      restoredSecret.fill(0);
    }

    await assert.rejects(
      decryptWalletSecret(vault, "incorrect wallet password"),
      (error) => error?.code === "EMBEDDED_WALLET_UNLOCK_FAILED",
    );
  } finally {
    secretKey.fill(0);
    keypair.dispose();
  }
});

test("rejects a backup outside the MergePay DevNet vault schema", () => {
  assert.throws(
    () =>
      parseWalletBackup(
        JSON.stringify({
          schema: "unknown.wallet",
          version: 1,
          network: "mainnet",
        }),
      ),
    (error) => error?.code === "EMBEDDED_WALLET_INVALID_BACKUP",
  );
});
