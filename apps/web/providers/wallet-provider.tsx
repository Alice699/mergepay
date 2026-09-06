"use client";

import {
  useActiveAccount,
  useActiveWallet,
  useConnectWallet,
  useConnectionStatus,
  useDisconnectWallet,
  useNativeBalance,
  useSignTransaction,
  useWallets,
  useWalletsReady,
} from "@rialo/frost";
import { MERGEPAY_INSTRUCTION_DISCRIMINANTS } from "@mergepay/rialo-client";
import { Transaction } from "@rialo/ts-cdk";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useEmbeddedWallet } from "@/hooks/use-embedded-wallet";
import { useNetwork } from "@/hooks/use-network";
import { EMBEDDED_WALLET_NAME } from "@/lib/embedded-wallet";
import { asError, MergePayUiError } from "@/lib/errors";
import { formatRlo } from "@/lib/format";
import {
  WalletContext,
  type EmbeddedWalletFundingPhase,
  type WalletBalanceSnapshot,
  type WalletConnectionStatus,
  type WalletSnapshot,
  type WalletSource,
  type WalletTransactionApproval,
  type WalletTransactionIntent,
  type WalletTransactionSnapshot,
} from "@/providers/wallet-context";

const DEVNET_AIRDROP_KELVIN = 1_000_000_000n;
const ALLOWED_EMBEDDED_INSTRUCTIONS = new Set<number>(
  Object.values(MERGEPAY_INSTRUCTION_DISCRIMINANTS),
);

const MAX_TRANSACTION_FAILURE_DETAIL_LENGTH = 220;

function trimTransactionFailureDetail(detail: string): string {
  const normalized = detail.replace(/\s+/g, " ").trim();
  if (normalized.length <= MAX_TRANSACTION_FAILURE_DETAIL_LENGTH) return normalized;
  return `${normalized.slice(0, MAX_TRANSACTION_FAILURE_DETAIL_LENGTH - 1)}…`;
}

async function readTransactionFailureDetail(
  client: typeof import("@/lib/rialo").mergePayClient,
  signature: string,
  fallback?: string,
): Promise<string | undefined> {
  try {
    const details = await client.getTransaction(signature);
    const programLog = [...(details?.meta.logMessages ?? [])]
      .reverse()
      .find((message) => /^MergePay\s/i.test(message));
    const detail = programLog ?? details?.meta.err ?? fallback;
    return detail ? trimTransactionFailureDetail(detail) : undefined;
  } catch {
    return fallback ? trimTransactionFailureDetail(fallback) : undefined;
  }
}

interface PendingApproval {
  resolve: () => void;
  reject: (error: Error) => void;
}

export function WalletProvider({ children }: Readonly<{ children: ReactNode }>) {
  const network = useNetwork();
  const embeddedWallet = useEmbeddedWallet();
  const connectionStatus = useConnectionStatus();
  const account = useActiveAccount();
  const activeWallet = useActiveWallet();
  const wallets = useWallets();
  const walletsReady = useWalletsReady();
  const nativeBalance = useNativeBalance();
  const connectMutation = useConnectWallet();
  const disconnectMutation = useDisconnectWallet();
  const signMutation = useSignTransaction();
  const [transaction, setTransaction] = useState<WalletTransactionSnapshot>({
    phase: "idle",
    signature: null,
    error: null,
  });
  const [approval, setApproval] = useState<WalletTransactionApproval | null>(null);
  const [embeddedBalance, setEmbeddedBalance] = useState<
    Omit<WalletBalanceSnapshot, "refresh">
  >({ status: "idle", kelvin: null, formatted: null, error: null });
  const [funding, setFunding] = useState<{
    phase: EmbeddedWalletFundingPhase;
    signature: string | null;
    error: Error | null;
  }>({ phase: "idle", signature: null, error: null });
  const approvalRef = useRef<PendingApproval | null>(null);
  const approvalIdRef = useRef(0);
  const balanceRequestRef = useRef(0);

  const frostConnected = connectionStatus === "connected" && account !== null;
  const embeddedConnected = embeddedWallet.status === "unlocked";
  const source: WalletSource = frostConnected
    ? "extension"
    : embeddedConnected
      ? "embedded"
      : null;
  const embeddedAvailable = network.network === "devnet";

  const status: WalletConnectionStatus = source
    ? "connected"
    : connectionStatus === "connecting" ||
        embeddedWallet.status === "creating" ||
        embeddedWallet.status === "unlocking" ||
        embeddedWallet.status === "restoring"
      ? "connecting"
      : connectionStatus === "reconnecting"
        ? "reconnecting"
        : embeddedWallet.status === "loading"
          ? "discovering"
          : embeddedWallet.status === "locked"
            ? "locked"
            : "disconnected";

  const extensionChains = account?.chains.length
    ? account.chains
    : activeWallet?.chains ?? [];
  const networkSupported =
    source === "embedded"
      ? embeddedAvailable
      : account || activeWallet
        ? extensionChains.includes(network.expectedChainId)
        : null;

  const address =
    source === "embedded" ? embeddedWallet.address : account?.address ?? null;

  const settleApproval = useCallback((approved: boolean) => {
    const pending = approvalRef.current;
    if (!pending) return;
    approvalRef.current = null;
    setApproval(null);
    if (approved) {
      pending.resolve();
    } else {
      pending.reject(
        new MergePayUiError(
          "The local wallet signature request was declined.",
          "USER_REJECTED",
        ),
      );
    }
  }, []);

  useEffect(
    () => () => {
      approvalRef.current?.reject(
        new MergePayUiError(
          "The wallet session ended before approval.",
          "WALLET_DISCONNECTED",
        ),
      );
      approvalRef.current = null;
    },
    [],
  );

  useEffect(() => {
    if (approval && embeddedWallet.status !== "unlocked") {
      settleApproval(false);
    }
  }, [approval, embeddedWallet.status, settleApproval]);

  const connect = useCallback(
    async (walletName?: string) => {
      const selectedWallet = walletName ?? wallets[0]?.name;
      if (!selectedWallet) {
        throw new MergePayUiError(
          "No Rialo wallet extension was detected in this browser.",
          "WALLET_UNAVAILABLE",
        );
      }

      if (embeddedWallet.status === "unlocked") embeddedWallet.lock();
      connectMutation.reset();
      return connectMutation.mutateAsync({ walletName: selectedWallet });
    },
    [connectMutation, embeddedWallet, wallets],
  );

  const disconnect = useCallback(async () => {
    settleApproval(false);
    if (source === "embedded") {
      embeddedWallet.lock();
      return;
    }
    disconnectMutation.reset();
    await disconnectMutation.mutateAsync();
  }, [disconnectMutation, embeddedWallet, settleApproval, source]);

  const refreshEmbeddedBalance = useCallback(async () => {
    const requestId = ++balanceRequestRef.current;
    if (
      embeddedWallet.status !== "unlocked" ||
      !embeddedWallet.address ||
      network.rpcStatus === "unavailable"
    ) {
      setEmbeddedBalance({
        status: "idle",
        kelvin: null,
        formatted: null,
        error: null,
      });
      return;
    }

    setEmbeddedBalance((current) => ({ ...current, status: "loading", error: null }));
    try {
      const kelvin = await network.client.rpc.getBalance(embeddedWallet.address);
      if (requestId !== balanceRequestRef.current) return;
      setEmbeddedBalance({
        status: "ready",
        kelvin,
        formatted: formatRlo(kelvin),
        error: null,
      });
    } catch (cause) {
      if (requestId !== balanceRequestRef.current) return;
      setEmbeddedBalance({
        status: "error",
        kelvin: null,
        formatted: null,
        error: asError(cause),
      });
    }
  }, [embeddedWallet.address, embeddedWallet.status, network]);

  useEffect(() => {
    if (source !== "embedded") return;
    const refreshTimer = window.setTimeout(() => {
      void refreshEmbeddedBalance();
    }, 0);
    return () => window.clearTimeout(refreshTimer);
  }, [refreshEmbeddedBalance, source]);

  const requestApproval = useCallback(
    (unsignedTransaction: Transaction, intent?: WalletTransactionIntent) => {
      const message = unsignedTransaction.getMessage();
      const programs = Array.from(
        new Set(
          message.instructions.map((instruction) => {
            const program = message.accountKeys[instruction.programIdIndex];
            if (!program) {
              throw new MergePayUiError(
                "The transaction contains an invalid program reference.",
                "TRANSACTION_INVALID",
              );
            }
            return program.toString();
          }),
        ),
      );
      if (
        programs.length === 0 ||
        programs.some((program) => program !== network.client.programId)
      ) {
        throw new MergePayUiError(
          "The local wallet only signs instructions for the active MergePay program.",
          "TRANSACTION_PROGRAM_REJECTED",
        );
      }
      for (const instruction of message.instructions) {
        if (instruction.data.byteLength < 4) {
          throw new MergePayUiError(
            "The local wallet rejected an instruction without a public MergePay discriminant.",
            "TRANSACTION_INSTRUCTION_REJECTED",
          );
        }
        const discriminant = new DataView(
          instruction.data.buffer,
          instruction.data.byteOffset,
          instruction.data.byteLength,
        ).getUint32(0, true);
        if (!ALLOWED_EMBEDDED_INSTRUCTIONS.has(discriminant)) {
          throw new MergePayUiError(
            "The local wallet only signs public MergePay workflow instructions.",
            "TRANSACTION_INSTRUCTION_REJECTED",
          );
        }
      }
      const signers = unsignedTransaction.getSigners().map((signer) => signer.toString());
      if (
        !embeddedWallet.address ||
        signers.length !== 1 ||
        signers[0] !== embeddedWallet.address
      ) {
        throw new MergePayUiError(
          "The transaction signer does not match the active local wallet.",
          "EMBEDDED_WALLET_SIGNER_MISMATCH",
        );
      }

      approvalRef.current?.reject(
        new MergePayUiError(
          "A newer wallet approval replaced this request.",
          "USER_REJECTED",
        ),
      );

      const nextApproval: WalletTransactionApproval = {
        id: ++approvalIdRef.current,
        action: intent?.action ?? "Approve MergePay transaction",
        summary:
          intent?.summary ??
          "Review the signer and active program before authorizing this transaction.",
        payer: embeddedWallet.address,
        programs,
        instructionCount: message.instructions.length,
        validFrom: message.validFrom?.toString() ?? null,
        amountKelvin: intent?.amountKelvin ?? null,
        workflowAddress: intent?.workflowAddress ?? null,
      };
      setApproval(nextApproval);

      return new Promise<void>((resolve, reject) => {
        approvalRef.current = { resolve, reject };
      });
    },
    [embeddedWallet.address, network.client.programId],
  );

  const submitTransaction = useCallback(
    async (
      unsignedTransaction: Transaction | Uint8Array,
      intent?: WalletTransactionIntent,
    ) => {
      if (!source || !address) {
        const error = new MergePayUiError(
          "Connect or unlock a Rialo wallet before signing.",
          "WALLET_DISCONNECTED",
        );
        setTransaction({ phase: "failed", signature: null, error });
        throw error;
      }

      if (!network.isExpectedNetwork || networkSupported === false) {
        const error = new MergePayUiError(
          "The active wallet is not on the configured Rialo network.",
          "UNSUPPORTED_CHAIN",
        );
        setTransaction({ phase: "failed", signature: null, error });
        throw error;
      }

      if (network.rpcStatus !== "available") {
        const error = new MergePayUiError(
          "Rialo RPC is not ready. Try again when the network is reachable.",
          "RPC_UNAVAILABLE",
        );
        setTransaction({ phase: "failed", signature: null, error });
        throw error;
      }

      let signature: string | null = null;
      try {
        let signedTransaction: Uint8Array;
        if (source === "embedded") {
          const transactionToApprove =
            unsignedTransaction instanceof Uint8Array
              ? Transaction.deserialize(unsignedTransaction)
              : unsignedTransaction;
          setTransaction({ phase: "reviewing", signature: null, error: null });
          await requestApproval(transactionToApprove, intent);
          setTransaction({ phase: "signing", signature: null, error: null });
          signedTransaction = embeddedWallet.signTransaction(transactionToApprove);
        } else {
          setTransaction({ phase: "signing", signature: null, error: null });
          const signed = await signMutation.mutateAsync({
            transaction: unsignedTransaction,
          });
          signedTransaction = signed.signedTransaction;
        }

        setTransaction({ phase: "submitting", signature: null, error: null });
        signature = await network.client.rpc.sendTransaction(signedTransaction);
        setTransaction({ phase: "submitting", signature, error: null });
        const confirmation = await network.client.confirm(signature);

        if (!confirmation.executed) {
          const failureDetail = await readTransactionFailureDetail(
            network.client,
            signature,
            confirmation.err,
          );
          const error = new MergePayUiError(
            failureDetail ?? "Rialo rejected the transaction onchain.",
            "TRANSACTION_FAILED",
          );
          setTransaction({ phase: "failed", signature, error });
          throw error;
        }

        setTransaction({ phase: "confirmed", signature, error: null });
        if (source === "embedded") void refreshEmbeddedBalance();
        return confirmation;
      } catch (cause) {
        const error = asError(cause);
        setTransaction({ phase: "failed", signature, error });
        throw error;
      }
    },
    [
      address,
      embeddedWallet,
      network,
      networkSupported,
      refreshEmbeddedBalance,
      requestApproval,
      signMutation,
      source,
    ],
  );

  const requestDevnetFunds = useCallback(async () => {
    if (
      !embeddedAvailable ||
      embeddedWallet.status !== "unlocked" ||
      !embeddedWallet.address
    ) {
      throw new MergePayUiError(
        "Unlock a MergePay DevNet wallet before requesting test funds.",
        "EMBEDDED_WALLET_LOCKED",
      );
    }
    if (network.rpcStatus !== "available") {
      throw new MergePayUiError(
        "Rialo RPC must be available before requesting DevNet funds.",
        "RPC_UNAVAILABLE",
      );
    }

    setFunding({ phase: "requesting", signature: null, error: null });
    try {
      const confirmation = await network.client.rpc.requestAirdropAndConfirm(
        embeddedWallet.address,
        DEVNET_AIRDROP_KELVIN,
      );
      if (!confirmation.executed) {
        throw new MergePayUiError(
          confirmation.err ?? "The Rialo DevNet faucet rejected this request.",
          "AIRDROP_FAILED",
        );
      }
      setFunding({
        phase: "confirmed",
        signature: confirmation.signature,
        error: null,
      });
      await refreshEmbeddedBalance();
      return confirmation;
    } catch (cause) {
      const error = asError(cause);
      setFunding({ phase: "failed", signature: null, error });
      throw error;
    }
  }, [embeddedAvailable, embeddedWallet, network, refreshEmbeddedBalance]);

  const frostBalance: WalletBalanceSnapshot = useMemo(
    () => ({
      status: !account
        ? "idle"
        : nativeBalance.isLoading
          ? "loading"
          : nativeBalance.isError
            ? "error"
            : "ready",
      kelvin: nativeBalance.balance ?? null,
      formatted: nativeBalance.formatted ?? null,
      error: nativeBalance.error,
      refresh: nativeBalance.refetch,
    }),
    [account, nativeBalance],
  );

  const balance = useMemo<WalletBalanceSnapshot>(
    () =>
      source === "embedded"
        ? {
            ...embeddedBalance,
            refresh: () => void refreshEmbeddedBalance(),
          }
        : frostBalance,
    [embeddedBalance, frostBalance, refreshEmbeddedBalance, source],
  );

  const value = useMemo<WalletSnapshot>(
    () => ({
      status,
      source,
      address,
      walletName:
        source === "embedded"
          ? EMBEDDED_WALLET_NAME
          : activeWallet?.name ?? account?.walletName ?? null,
      activeAccount: source === "extension" ? account : null,
      activeWallet: source === "extension" ? activeWallet : null,
      wallets,
      walletsReady,
      connectError: connectMutation.error,
      disconnectError: disconnectMutation.error,
      balance,
      transaction,
      approval,
      embedded: {
        available: embeddedAvailable,
        status: embeddedWallet.status,
        address: embeddedWallet.address,
        createdAt: embeddedWallet.createdAt,
        error: embeddedWallet.error,
        funding,
        create: embeddedWallet.create,
        unlock: embeddedWallet.unlock,
        lock: embeddedWallet.lock,
        remove: embeddedWallet.remove,
        exportBackup: embeddedWallet.exportBackup,
        restoreBackup: embeddedWallet.restoreBackup,
        requestDevnetFunds,
      },
      expectedChainId: network.expectedChainId,
      networkSupported,
      connect,
      disconnect,
      submitTransaction,
      approveTransaction: () => settleApproval(true),
      rejectTransaction: () => settleApproval(false),
      resetTransaction: () =>
        setTransaction({ phase: "idle", signature: null, error: null }),
    }),
    [
      account,
      activeWallet,
      address,
      approval,
      balance,
      connect,
      connectMutation.error,
      disconnect,
      disconnectMutation.error,
      embeddedAvailable,
      embeddedWallet,
      funding,
      network.expectedChainId,
      networkSupported,
      requestDevnetFunds,
      settleApproval,
      source,
      status,
      submitTransaction,
      transaction,
      wallets,
      walletsReady,
    ],
  );

  return (
    <WalletContext.Provider value={value}>{children}</WalletContext.Provider>
  );
}
