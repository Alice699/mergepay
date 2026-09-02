export class MergePayUiError extends Error {
  constructor(
    message: string,
    readonly code: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = "MergePayUiError";
  }
}

export function errorCode(cause: unknown): string | null {
  if (typeof cause !== "object" || cause === null || !("code" in cause)) {
    return null;
  }

  const code = cause.code;
  return typeof code === "string" ? code : null;
}

export function asError(cause: unknown): Error {
  return cause instanceof Error ? cause : new Error(String(cause));
}

function errorText(cause: unknown): string {
  if (cause instanceof Error) return cause.message;
  return String(cause);
}

export function isWalletRejection(cause: unknown): boolean {
  return /reject|denied|declined|cancelled|canceled|user abort/i.test(
    errorText(cause),
  );
}

export function describeRialoError(cause: unknown): string {
  const code = errorCode(cause);

  if (
    (code === "CONNECTION_FAILED" || code === "WALLET_ERROR") &&
    isWalletRejection(cause)
  ) {
    return "The wallet request was declined. Nothing was submitted.";
  }

  switch (code) {
    case "WALLET_NOT_FOUND":
      return "That wallet is no longer available. Refresh the page and try again.";
    case "WALLET_DISCONNECTED":
      return "The wallet is disconnected. Connect it before signing.";
    case "UNSUPPORTED_CHAIN":
      return "This wallet does not support the configured Rialo network.";
    case "UNSUPPORTED_FEATURE":
      return "This wallet cannot sign the required Rialo transaction.";
    case "USER_REJECTED":
      return "The signature request was declined. Nothing was submitted.";
    case "EMBEDDED_WALLET_UNLOCK_FAILED":
      return "The wallet password is incorrect or the encrypted backup is damaged.";
    case "EMBEDDED_WALLET_LOCKED":
      return "Unlock the local DevNet wallet before continuing.";
    case "EMBEDDED_WALLET_STORAGE_UNAVAILABLE":
    case "EMBEDDED_WALLET_UNAVAILABLE":
      return "This browser cannot securely store the local DevNet wallet.";
    case "EMBEDDED_WALLET_INVALID_BACKUP":
      return "That file is not a valid MergePay encrypted wallet backup.";
    case "EMBEDDED_WALLET_SIGNER_MISMATCH":
    case "TRANSACTION_PROGRAM_REJECTED":
    case "TRANSACTION_INSTRUCTION_REJECTED":
      return "The local wallet refused a transaction outside its approved MergePay boundary.";
    case "AIRDROP_FAILED":
      return "The Rialo DevNet faucet rejected this request. Wait before trying again.";
    case "TRANSACTION_FAILED":
      return "Rialo confirmed the transaction but rejected its onchain execution.";
  }

  if (/rpc|network|fetch|timeout|gateway|service unavailable|failed to fetch/i.test(errorText(cause))) {
    return "Rialo RPC is unavailable. Check the endpoint and try again.";
  }

  return errorText(cause);
}
