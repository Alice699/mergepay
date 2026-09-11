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
    case "TRANSACTION_INSTRUCTION_REJECTED":
      return "The local wallet refused a transaction outside its approved MergePay boundary.";
    case "GITHUB_APP_AUTH_UNAVAILABLE":
      return errorText(cause);
    case "GITHUB_APP_AUTH_INVALID":
      return "The encrypted GitHub App authorization was invalid. Refresh the page and try funding again.";
    case "TRANSACTION_PROGRAM_REJECTED":
      return errorText(cause);
    case "BALANCE_UNAVAILABLE":
      return "The signer balance is not available yet. Refresh the wallet balance before creating a bounty.";
    case "INSUFFICIENT_FUNDS":
      return "This wallet needs at least 0.002 RLO for workflow rent and transaction fees. Request 1 RLO from the DevNet faucet, refresh the balance, then try again.";
    case "AIRDROP_FAILED":
      return "The Rialo DevNet faucet rejected this request. Wait before trying again.";
    case "WORKFLOW_ACCOUNT_NOT_FOUND":
      return "This bounty workflow is not available on the configured program. Return to the marketplace and open a current listing.";
    case "WORKFLOW_PROGRAM_MISMATCH":
      return errorText(cause);
    case "WORKFLOW_STORAGE_RENT_UNAVAILABLE":
      return "Rialo could not estimate the workflow storage rent. Refresh the workflow and try again.";
    case "WORKFLOW_STORAGE_TOO_LARGE":
      return errorText(cause);
    case "CLAIM_RECORD_OWNER_MISMATCH":
    case "CLAIM_RECORD_INVALID":
    case "CLAIM_GITHUB_REVIEW_UNAVAILABLE":
    case "CLAIM_GITHUB_REVIEW_INVALID":
    case "CLAIM_GITHUB_AUTHOR_MISMATCH":
      return errorText(cause);
    case "TRANSACTION_FAILED": {
      const detail = errorText(cause).trim();
      if (/InvalidInstructionData/i.test(detail)) {
        return "The deployed MergePay program does not match this app's ABI. Restart the app so the Rialo client rebuilds, then use the matching deployed program.";
      }
      if (!detail || detail === "Rialo rejected the transaction onchain.") {
        return "Rialo confirmed the transaction but rejected its onchain execution.";
      }
      return `Rialo rejected the transaction onchain: ${detail}`;
    }
  }

  if (/rpc|network|fetch|timeout|gateway|service unavailable|failed to fetch/i.test(errorText(cause))) {
    return "Rialo RPC is unavailable. Check the endpoint and try again.";
  }

  return errorText(cause);
}
