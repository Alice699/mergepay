"use client";

import { Keypair, Transaction } from "@rialo/ts-cdk";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  EMBEDDED_WALLET_AUTO_LOCK_MS,
  decryptWalletSecret,
  deleteStoredWalletVault,
  encryptWalletSecret,
  EmbeddedWalletError,
  parseWalletBackup,
  readStoredWalletVault,
  serializeWalletBackup,
  writeStoredWalletVault,
  type EncryptedWalletVault,
} from "@/lib/embedded-wallet";
import { asError } from "@/lib/errors";

export type EmbeddedWalletStatus =
  | "loading"
  | "empty"
  | "locked"
  | "unlocked"
  | "creating"
  | "unlocking"
  | "restoring"
  | "removing"
  | "error";

export interface EmbeddedWalletController {
  status: EmbeddedWalletStatus;
  address: string | null;
  createdAt: string | null;
  error: Error | null;
  create: (password: string) => Promise<void>;
  unlock: (password: string) => Promise<void>;
  lock: () => void;
  remove: () => Promise<void>;
  exportBackup: () => Promise<string>;
  restoreBackup: (backup: string, password: string) => Promise<void>;
  signTransaction: (transaction: Transaction | Uint8Array) => Uint8Array;
}

export function useEmbeddedWallet(): EmbeddedWalletController {
  const [vault, setVault] = useState<EncryptedWalletVault | null>(null);
  const [status, setStatus] = useState<EmbeddedWalletStatus>("loading");
  const [error, setError] = useState<Error | null>(null);
  const keypairRef = useRef<Keypair | null>(null);
  const autoLockRef = useRef<number | null>(null);

  const clearAutoLock = useCallback(() => {
    if (autoLockRef.current !== null) {
      window.clearTimeout(autoLockRef.current);
      autoLockRef.current = null;
    }
  }, []);

  const disposeKeypair = useCallback(() => {
    keypairRef.current?.dispose();
    keypairRef.current = null;
  }, []);

  const lock = useCallback(() => {
    clearAutoLock();
    disposeKeypair();
    setError(null);
    setStatus((current) =>
      current === "empty" || current === "loading" ? current : "locked",
    );
  }, [clearAutoLock, disposeKeypair]);

  const armAutoLock = useCallback(() => {
    clearAutoLock();
    autoLockRef.current = window.setTimeout(
      lock,
      EMBEDDED_WALLET_AUTO_LOCK_MS,
    );
  }, [clearAutoLock, lock]);

  useEffect(() => {
    let active = true;
    void readStoredWalletVault()
      .then((storedVault) => {
        if (!active) return;
        setVault(storedVault);
        setStatus(storedVault ? "locked" : "empty");
      })
      .catch((cause) => {
        if (!active) return;
        setError(asError(cause));
        setStatus("error");
      });

    return () => {
      active = false;
      clearAutoLock();
      disposeKeypair();
    };
  }, [clearAutoLock, disposeKeypair]);

  const create = useCallback(
    async (password: string) => {
      if (vault) {
        throw new EmbeddedWalletError(
          "A MergePay DevNet wallet already exists in this browser.",
          "EMBEDDED_WALLET_EXISTS",
        );
      }

      setStatus("creating");
      setError(null);
      const keypair = Keypair.generate();
      const secretKey = keypair.secretKeyBytes();
      try {
        const nextVault = await encryptWalletSecret(
          secretKey,
          keypair.publicKey.toString(),
          password,
        );
        await writeStoredWalletVault(nextVault);
        disposeKeypair();
        keypairRef.current = keypair;
        setVault(nextVault);
        setStatus("unlocked");
        armAutoLock();
      } catch (cause) {
        keypair.dispose();
        const nextError = asError(cause);
        setError(nextError);
        setStatus(vault ? "locked" : "empty");
        throw nextError;
      } finally {
        secretKey.fill(0);
      }
    },
    [armAutoLock, disposeKeypair, vault],
  );

  const unlock = useCallback(
    async (password: string) => {
      if (!vault) {
        throw new EmbeddedWalletError(
          "No MergePay DevNet wallet exists in this browser.",
          "EMBEDDED_WALLET_NOT_FOUND",
        );
      }

      setStatus("unlocking");
      setError(null);
      let secretKey: Uint8Array | null = null;
      try {
        secretKey = await decryptWalletSecret(vault, password);
        const keypair = Keypair.fromSecretKey(secretKey);
        disposeKeypair();
        keypairRef.current = keypair;
        setStatus("unlocked");
        armAutoLock();
      } catch (cause) {
        const nextError = asError(cause);
        setError(nextError);
        setStatus("locked");
        throw nextError;
      } finally {
        secretKey?.fill(0);
      }
    },
    [armAutoLock, disposeKeypair, vault],
  );

  const remove = useCallback(async () => {
    setStatus("removing");
    setError(null);
    try {
      clearAutoLock();
      disposeKeypair();
      await deleteStoredWalletVault();
      setVault(null);
      setStatus("empty");
    } catch (cause) {
      const nextError = asError(cause);
      setError(nextError);
      setStatus(vault ? "locked" : "empty");
      throw nextError;
    }
  }, [clearAutoLock, disposeKeypair, vault]);

  const exportBackup = useCallback(async () => {
    const currentVault = vault ?? (await readStoredWalletVault());
    if (!currentVault) {
      throw new EmbeddedWalletError(
        "Create a MergePay DevNet wallet before exporting a backup.",
        "EMBEDDED_WALLET_NOT_FOUND",
      );
    }
    return serializeWalletBackup(currentVault);
  }, [vault]);

  const restoreBackup = useCallback(
    async (backup: string, password: string) => {
      if (vault) {
        throw new EmbeddedWalletError(
          "Remove the existing local wallet before restoring another backup.",
          "EMBEDDED_WALLET_EXISTS",
        );
      }

      setStatus("restoring");
      setError(null);
      const restoredVault = parseWalletBackup(backup);
      let secretKey: Uint8Array | null = null;
      try {
        secretKey = await decryptWalletSecret(restoredVault, password);
        const keypair = Keypair.fromSecretKey(secretKey);
        await writeStoredWalletVault(restoredVault);
        disposeKeypair();
        keypairRef.current = keypair;
        setVault(restoredVault);
        setStatus("unlocked");
        armAutoLock();
      } catch (cause) {
        const nextError = asError(cause);
        setError(nextError);
        setStatus("empty");
        throw nextError;
      } finally {
        secretKey?.fill(0);
      }
    },
    [armAutoLock, disposeKeypair, vault],
  );

  const signTransaction = useCallback(
    (unsignedTransaction: Transaction | Uint8Array) => {
      const keypair = keypairRef.current;
      if (!keypair || status !== "unlocked") {
        throw new EmbeddedWalletError(
          "Unlock the MergePay DevNet wallet before signing.",
          "EMBEDDED_WALLET_LOCKED",
        );
      }

      const transaction =
        unsignedTransaction instanceof Uint8Array
          ? Transaction.deserialize(unsignedTransaction)
          : unsignedTransaction;
      const required = transaction
        .getSigners()
        .some((signer) => signer.equals(keypair.publicKey));
      if (!required) {
        throw new EmbeddedWalletError(
          "This transaction does not require the active DevNet wallet signature.",
          "EMBEDDED_WALLET_SIGNER_MISMATCH",
        );
      }

      const signed = transaction.sign(keypair);
      signed.ensureSigned();
      armAutoLock();
      return signed.serialize();
    },
    [armAutoLock, status],
  );

  return {
    status,
    address: vault?.address ?? null,
    createdAt: vault?.createdAt ?? null,
    error,
    create,
    unlock,
    lock,
    remove,
    exportBackup,
    restoreBackup,
    signTransaction,
  };
}
