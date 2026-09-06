"use client";

import {
  Check,
  CircleAlert,
  LoaderCircle,
  LockKeyhole,
  RefreshCw,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useCreateBounty } from "@/features/create-bounty/use-create-bounty";
import { useWallet } from "@/hooks/use-wallet";
import { useNetwork } from "@/hooks/use-network";
import { asError, describeRialoError } from "@/lib/errors";
import { MINIMUM_CREATE_BALANCE_KELVIN, routes } from "@/lib/constants";
import { generateWorkflowSlug } from "@/lib/validation";
import type { CreateBountyFormValues } from "../schema";

function readFormValues(form: HTMLFormElement): CreateBountyFormValues {
  const data = new FormData(form);
  const value = (name: keyof CreateBountyFormValues) => {
    const field = data.get(name);
    return typeof field === "string" ? field.trim() : "";
  };

  const deadline = value("deadlineUnixMs");
  const deadlineUnixMs = Date.parse(deadline);
  if (!Number.isSafeInteger(deadlineUnixMs) || deadlineUnixMs <= Date.now()) {
    throw new Error("Choose a future deadline.");
  }

  return {
    workflowSlug: value("workflowSlug"),
    beneficiary: value("beneficiary"),
    githubOwner: value("githubOwner"),
    githubRepo: value("githubRepo"),
    pullNumber: value("pullNumber"),
    amountKelvin: value("amountKelvin"),
    deadlineUnixMs: String(deadlineUnixMs),
  };
}

interface CreateBountyFormProps {
  initialWorkflowSlug: string;
}

export function CreateBountyForm({ initialWorkflowSlug }: CreateBountyFormProps) {
  const wallet = useWallet();
  const network = useNetwork();
  const router = useRouter();
  const createBounty = useCreateBounty();
  const [formError, setFormError] = useState<Error | null>(null);
  const [workflowSlug, setWorkflowSlug] = useState(initialWorkflowSlug);
  const isBusy = createBounty.status === "pending";

  function regenerateWorkflowSlug() {
    if (!isBusy && createBounty.transaction.phase !== "confirmed") {
      setWorkflowSlug(generateWorkflowSlug());
    }
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!event.currentTarget.reportValidity() || isBusy) return;

    setFormError(null);
    let values: CreateBountyFormValues;
    try {
      values = readFormValues(event.currentTarget);
    } catch (cause) {
      setFormError(asError(cause));
      return;
    }

    try {
      const result = await createBounty.execute(values);
      const detailQuery = new URLSearchParams({
        event: "create",
        tx: result.signature,
      });
      if (wallet.address) detailQuery.set("sponsor", wallet.address);
      router.push(routes.bounty(result.workflowSlug) + "?" + detailQuery.toString());
    } catch {
      // The transaction state below is the source of truth for submission failure.
    }
  }

  const transactionPhase = createBounty.transaction.phase;
  const balanceChecking =
    wallet.balance.status === "idle" || wallet.balance.status === "loading";
  const balanceUnavailable =
    wallet.balance.status === "error" || wallet.balance.kelvin === null;
  const balanceNeedsFunding =
    wallet.balance.status === "ready" &&
    wallet.balance.kelvin !== null &&
    wallet.balance.kelvin < MINIMUM_CREATE_BALANCE_KELVIN;
  const unavailable =
    wallet.status !== "connected" ||
    !wallet.address ||
    !network.isExpectedNetwork ||
    wallet.networkSupported === false ||
    network.rpcStatus !== "available" ||
    balanceChecking ||
    balanceUnavailable ||
    balanceNeedsFunding;
  const statusTone =
    formError || createBounty.status === "error" || transactionPhase === "failed"
      ? "error"
      : createBounty.status === "success" || transactionPhase === "confirmed"
        ? "success"
        : isBusy || transactionPhase === "signing" || transactionPhase === "submitting"
          ? "pending"
          : "idle";

  let statusTitle = "Ready to sign";
  let statusCopy = "Your active signer will review the immutable terms.";
  let buttonLabel = "Create bounty";

  if (wallet.status === "discovering") {
    statusTitle = "Loading wallet";
    statusCopy = "Preparing the encrypted local vault and wallet discovery.";
  } else if (wallet.status === "locked") {
    statusTitle = "Wallet locked";
    statusCopy = "Unlock your MergePay DevNet wallet before creating the workflow.";
  } else if (wallet.status !== "connected" || !wallet.address) {
    statusTitle = "Wallet required";
    statusCopy = "Create, unlock, or connect a Rialo wallet before continuing.";
  } else if (!network.isExpectedNetwork || wallet.networkSupported === false) {
    statusTitle = "Wrong network";
    statusCopy = `Switch to ${network.label} before signing.`;
  } else if (network.rpcStatus === "checking") {
    statusTitle = "Checking Rialo RPC";
    statusCopy = "The network connection is being verified before signing.";
  } else if (network.rpcStatus === "unavailable") {
    statusTitle = "RPC unavailable";
    statusCopy = "Rialo cannot be reached right now. Try again shortly.";
  } else if (balanceChecking) {
    statusTitle = "Checking wallet balance";
    statusCopy = "Confirming the signer can cover workflow rent and the transaction fee.";
  } else if (balanceUnavailable) {
    statusTitle = "Balance unavailable";
    statusCopy = "Refresh the active wallet balance before creating the workflow.";
  } else if (balanceNeedsFunding) {
    statusTitle = "Faucet required";
    statusCopy = `Available balance is ${wallet.balance.formatted ?? "0"} RLO. Request 1 RLO from the DevNet faucet, then refresh.`;
  } else if (transactionPhase === "reviewing") {
    statusTitle = "Review transaction";
    statusCopy = "Verify the signer, program, amount, and workflow account.";
    buttonLabel = "Awaiting review";
  } else if (transactionPhase === "signing") {
    statusTitle = "Awaiting signature";
    statusCopy = "Review and approve the transaction in your wallet.";
    buttonLabel = "Awaiting signature";
  } else if (transactionPhase === "submitting") {
    statusTitle = "Submitting transaction";
    statusCopy = "The signed transaction is being sent to Rialo.";
    buttonLabel = "Submitting";
  } else if (createBounty.status === "success" || transactionPhase === "confirmed") {
    statusTitle = "Bounty created";
    statusCopy = "Transaction confirmed. Opening the verified workflow record.";
    buttonLabel = "Confirmed";
  } else if (formError) {
    statusTitle = "Check the form";
    statusCopy = describeRialoError(formError);
    buttonLabel = "Try again";
  } else if (createBounty.status === "error" || transactionPhase === "failed") {
    statusTitle = "Transaction failed";
    statusCopy = describeRialoError(createBounty.error ?? createBounty.transaction.error);
    buttonLabel = "Try again";
  }

  return (
    <form className="bounty-form" aria-label="Create a MergePay bounty" onSubmit={handleSubmit}>
      <fieldset className="form-section">
        <legend className="sr-only">GitHub target</legend>
        <div className="form-section__heading">
          <span className="mono">01</span>
          <div><p className="form-section__eyebrow mono">SOURCE CONDITION</p><h2>GitHub target</h2><p>One public pull request per bounty.</p></div>
        </div>
        <div className="form-grid form-grid--three">
          <label className="form-field"><span>Owner <b aria-hidden="true">*</b></span><input name="githubOwner" autoComplete="off" placeholder="Repository owner" required spellCheck={false} /></label>
          <label className="form-field"><span>Repository <b aria-hidden="true">*</b></span><input name="githubRepo" autoComplete="off" placeholder="Repository name" required spellCheck={false} /></label>
          <label className="form-field"><span>Pull request <b aria-hidden="true">*</b></span><input name="pullNumber" inputMode="numeric" min="1" placeholder="PR number" required type="number" /></label>
        </div>
      </fieldset>

      <fieldset className="form-section">
        <legend className="sr-only">Settlement terms</legend>
        <div className="form-section__heading">
          <span className="mono">02</span>
          <div><p className="form-section__eyebrow mono">IMMUTABLE STATE</p><h2>Settlement terms</h2><p>These values are committed to the workflow account.</p></div>
        </div>
        <div className="form-grid form-grid--two">
          <label className="form-field form-grid__wide"><span>Beneficiary address <b aria-hidden="true">*</b></span><input aria-describedby="beneficiary-hint" name="beneficiary" autoComplete="off" placeholder="Rialo public address" required spellCheck={false} /><small id="beneficiary-hint">Receives the payout automatically after unanimous merge confirmation.</small></label>
          <label className="form-field"><span>Bounty amount <b aria-hidden="true">*</b></span><div className="input-affix"><input name="amountKelvin" inputMode="numeric" min="1" placeholder="Amount" required step="1" type="number" /><b>KELVIN</b></div></label>
          <label className="form-field"><span>Deadline <b aria-hidden="true">*</b></span><input name="deadlineUnixMs" required type="datetime-local" /></label>
          <div className="form-field form-grid__wide">
            <div className="form-field__label-row">
              <label htmlFor="workflow-id">Workflow ID <b aria-hidden="true">*</b></label>
              <button
                aria-label="Generate a new workflow ID"
                className="workflow-id__generate"
                disabled={isBusy || transactionPhase === "confirmed"}
                onClick={regenerateWorkflowSlug}
                type="button"
              >
                <RefreshCw aria-hidden="true" size={13} />
                Generate new
              </button>
            </div>
            <input
              id="workflow-id"
              aria-describedby="workflow-id-hint"
              name="workflowSlug"
              autoComplete="off"
              minLength={64}
              maxLength={64}
              pattern="[0-9a-fA-F]{64}"
              required
              readOnly
              spellCheck={false}
              value={workflowSlug}
            />
            <small id="workflow-id-hint">Generated automatically for this on-chain workflow. Generate a new ID if you need to retry.</small>
          </div>
        </div>
      </fieldset>

      <div className="form-submit">
        <div className={`form-submit__status form-submit__status--${statusTone}`} aria-live="polite">
          <i aria-hidden="true" />
          <div><p>{statusTitle}</p><span>{statusCopy}</span></div>
        </div>
        <button className="button" disabled={unavailable || isBusy || statusTone === "success"} type="submit">
          {isBusy || transactionPhase === "reviewing" || transactionPhase === "signing" || transactionPhase === "submitting" ? <LoaderCircle aria-hidden="true" className="ui-icon ui-icon--spin" size={15} /> : statusTone === "success" ? <Check aria-hidden="true" size={15} /> : statusTone === "error" ? <CircleAlert aria-hidden="true" size={15} /> : <LockKeyhole aria-hidden="true" size={15} />}
          {buttonLabel}
        </button>
      </div>
    </form>
  );
}
