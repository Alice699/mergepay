"use client";

import {
  Check,
  CircleAlert,
  GitCommitHorizontal,
  GitPullRequest,
  LoaderCircle,
  LockKeyhole,
  RefreshCw,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useCreateBounty } from "@/features/create-bounty/use-create-bounty";
import {
  useGitHubSettlementPreview,
  type GitHubSettlementPreview,
} from "@/hooks/use-github-settlement-preview";
import { useWallet } from "@/hooks/use-wallet";
import { useNetwork } from "@/hooks/use-network";
import { asError, describeRialoError } from "@/lib/errors";
import { MINIMUM_CREATE_BALANCE_KELVIN, routes } from "@/lib/constants";
import { webConfig } from "@/lib/config";
import { formatTimeZoneLabel, parseRloToKelvin } from "@/lib/format";
import { generateWorkflowSlug } from "@/lib/validation";
import type { CreateBountyFormValues } from "../schema";

function readTargetValues(form: HTMLFormElement) {
  const data = new FormData(form);
  const value = (name: string) => {
    const field = data.get(name);
    return typeof field === "string" ? field.trim() : "";
  };

  const number = Number(value("pullNumber"));
  if (
    !/^[A-Za-z0-9._-]{1,100}$/.test(value("githubOwner")) ||
    !/^[A-Za-z0-9._-]{1,100}$/.test(value("githubRepo")) ||
    !Number.isSafeInteger(number) ||
    number <= 0
  ) {
    throw new Error("Enter a valid public GitHub owner, repository, and PR number.");
  }

  return {
    owner: value("githubOwner"),
    repo: value("githubRepo"),
    number,
  };
}

function targetMatchesPreview(
  target: ReturnType<typeof readTargetValues>,
  preview: GitHubSettlementPreview,
) {
  return (
    target.owner.toLowerCase() === preview.owner.toLowerCase() &&
    target.repo.toLowerCase() === preview.repo.toLowerCase() &&
    target.number === preview.number
  );
}

function readFormValues(
  form: HTMLFormElement,
  preview: GitHubSettlementPreview | null,
): CreateBountyFormValues {
  const data = new FormData(form);
  const value = (name: string) => {
    const field = data.get(name);
    return typeof field === "string" ? field.trim() : "";
  };
  const target = readTargetValues(form);

  if (!preview || !targetMatchesPreview(target, preview)) {
    throw new Error("Verify the GitHub target again before signing the bounty.");
  }

  const deadline = value("deadlineUnixMs");
  const deadlineUnixMs = Date.parse(deadline);
  if (!Number.isSafeInteger(deadlineUnixMs) || deadlineUnixMs <= Date.now()) {
    throw new Error("Choose a future deadline.");
  }
  parseRloToKelvin(value("amountRlo"));
  const minimumApprovals = value("minimumApprovals");
  if (!/^(?:[0-9]|10)$/.test(minimumApprovals)) {
    throw new Error("Choose a valid approval requirement between 0 and 10.");
  }

  return {
    workflowSlug: value("workflowSlug"),
    githubOwner: target.owner,
    githubRepo: target.repo,
    pullNumber: String(target.number),
    amountRlo: value("amountRlo"),
    deadlineUnixMs: String(deadlineUnixMs),
    expectedHeadSha: preview.headSha,
    expectedBaseRef: preview.baseRef,
    requireCiSuccess: data.get("requireCiSuccess") === "on",
    minimumApprovals,
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
  const targetPreview = useGitHubSettlementPreview();
  const formRef = useRef<HTMLFormElement>(null);
  const [formError, setFormError] = useState<Error | null>(null);
  const [workflowSlug, setWorkflowSlug] = useState(initialWorkflowSlug);
  const [timeZoneLabel, setTimeZoneLabel] = useState("local time");
  const isSubmitting = createBounty.status === "pending";
  const isBusy = isSubmitting || targetPreview.status === "loading";

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setTimeZoneLabel(formatTimeZoneLabel());
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  function regenerateWorkflowSlug() {
    if (!isSubmitting && createBounty.transaction.phase !== "confirmed") {
      setWorkflowSlug(generateWorkflowSlug());
    }
  }

  function handleTargetChanged() {
    if (targetPreview.status !== "idle") targetPreview.reset();
    if (formError) setFormError(null);
  }

  async function handleVerifyTarget() {
    if (!formRef.current || isBusy) return;
    setFormError(null);
    try {
      const target = readTargetValues(formRef.current);
      await targetPreview.verify(target);
    } catch (cause) {
      if (cause instanceof Error && cause.name === "AbortError") return;
      // The hook keeps the structured upstream error as the visible source of truth.
    }
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!event.currentTarget.reportValidity() || isBusy) return;

    setFormError(null);
    let values: CreateBountyFormValues;
    try {
      values = readFormValues(event.currentTarget, targetPreview.preview);
    } catch (cause) {
      setFormError(asError(cause));
      return;
    }

    try {
      const result = await createBounty.execute(values);
      const detailQuery = new URLSearchParams({
        event: "create",
        tx: result.signature,
        account: result.workflowAddress,
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
    balanceNeedsFunding ||
    !webConfig.rexBytecodeAccount ||
    targetPreview.status !== "success";
  const statusTone =
    formError ||
    targetPreview.status === "error" ||
    createBounty.status === "error" ||
    transactionPhase === "failed"
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
  } else if (!webConfig.rexBytecodeAccount) {
    statusTitle = "Verifier deployment pending";
    statusCopy = "The custom settlement REX account must be configured before a strong-proof bounty can be created.";
  } else if (targetPreview.status === "loading") {
    statusTitle = "Verifying GitHub target";
    statusCopy = "Reading the exact head commit and target branch from GitHub.";
    buttonLabel = "Verifying target";
  } else if (targetPreview.status === "error") {
    statusTitle = "Target not verified";
    statusCopy = describeRialoError(targetPreview.error);
    buttonLabel = "Verify target first";
  } else if (targetPreview.status !== "success") {
    statusTitle = "Verify the source condition";
    statusCopy = "Confirm the pull request to lock its exact commit and target branch.";
    buttonLabel = "Verify target first";
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
    <form ref={formRef} className="bounty-form" aria-label="Create a MergePay bounty" onSubmit={handleSubmit}>
      <fieldset className="form-section">
        <legend className="sr-only">GitHub target</legend>
        <div className="form-section__heading">
          <span className="mono">01</span>
          <div><p className="form-section__eyebrow mono">SOURCE CONDITION</p><h2>GitHub target</h2><p>One public pull request per bounty.</p></div>
        </div>
        <div className="form-grid form-grid--three">
          <label className="form-field"><span>Owner <b aria-hidden="true">*</b></span><input name="githubOwner" autoComplete="off" maxLength={100} onChange={handleTargetChanged} pattern="[A-Za-z0-9._-]+" placeholder="Repository owner" required spellCheck={false} /></label>
          <label className="form-field"><span>Repository <b aria-hidden="true">*</b></span><input name="githubRepo" autoComplete="off" maxLength={100} onChange={handleTargetChanged} pattern="[A-Za-z0-9._-]+" placeholder="Repository name" required spellCheck={false} /></label>
          <label className="form-field"><span>Pull request <b aria-hidden="true">*</b></span><input name="pullNumber" inputMode="numeric" min="1" onChange={handleTargetChanged} placeholder="PR number" required type="number" /></label>
        </div>
        <div className="settlement-target" data-status={targetPreview.status}>
          <div className="settlement-target__lead">
            <span className="settlement-target__icon" aria-hidden="true">
              {targetPreview.status === "loading" ? <LoaderCircle className="ui-icon--spin" size={17} /> : targetPreview.status === "success" ? <Check size={17} /> : <GitPullRequest size={17} />}
            </span>
            <div>
              <strong>{targetPreview.status === "success" ? targetPreview.preview.title : "Lock the exact pull-request revision"}</strong>
              <p>{targetPreview.status === "success" ? `${targetPreview.preview.owner}/${targetPreview.preview.repo} · PR #${targetPreview.preview.number} · ${targetPreview.preview.state}` : targetPreview.status === "error" ? targetPreview.error.message : "MergePay will read GitHub before creating the onchain workflow."}</p>
            </div>
          </div>
          <button className="button settlement-target__verify" disabled={isBusy} onClick={handleVerifyTarget} type="button">
            {targetPreview.status === "loading" ? <LoaderCircle aria-hidden="true" className="ui-icon--spin" size={14} /> : <RefreshCw aria-hidden="true" size={14} />}
            {targetPreview.status === "success" ? "Verify again" : "Verify target"}
          </button>
          {targetPreview.status === "success" ? (
            <dl className="settlement-target__facts">
              <div><dt>HEAD COMMIT</dt><dd title={targetPreview.preview.headSha}><GitCommitHorizontal aria-hidden="true" size={13} /> <code>{targetPreview.preview.headSha}</code></dd></div>
              <div><dt>TARGET BRANCH</dt><dd><code>{targetPreview.preview.baseRef}</code></dd></div>
            </dl>
          ) : null}
        </div>
      </fieldset>

      <fieldset className="form-section">
        <legend className="sr-only">Settlement terms</legend>
        <div className="form-section__heading">
          <span className="mono">02</span>
          <div><p className="form-section__eyebrow mono">IMMUTABLE STATE</p><h2>Settlement terms</h2><p>These values are committed to the workflow account.</p></div>
        </div>
        <div className="form-grid form-grid--two">
          <div className="form-field form-grid__wide form-field--notice">
            <span>Contributor claim</span>
            <div className="form-field__notice">
              <strong>The payout address is selected after the PR author claims this bounty.</strong>
              <small>MergePay verifies the public GitHub pull request, then the sponsor approves the contributor wallet before funding. The beneficiary is locked once approved.</small>
            </div>
          </div>
          <div className="settlement-policy form-grid__wide">
            <div className="settlement-policy__heading">
              <span aria-hidden="true"><LockKeyhole size={18} /></span>
              <div>
                <strong>Locked payout policy</strong>
                <p>The exact commit and target branch are always required. Add CI or review rules when the bounty needs stronger assurance.</p>
              </div>
            </div>
            <div className="settlement-policy__options">
              <label className="settlement-policy__toggle">
                <input name="requireCiSuccess" type="checkbox" />
                <span><strong>Require successful CI</strong><small>At least one GitHub status or check run must exist; all latest signals must finish successfully.</small></span>
              </label>
              <label className="form-field">
                <span>Required approvals</span>
                <select defaultValue="0" name="minimumApprovals">
                  <option value="0">No approval requirement</option>
                  <option value="1">1 current-commit approval</option>
                  <option value="2">2 current-commit approvals</option>
                  <option value="3">3 current-commit approvals</option>
                </select>
                <small>Only the latest decision from repository writers on the locked commit counts.</small>
              </label>
            </div>
            <p className="settlement-policy__warning"><CircleAlert aria-hidden="true" size={14} /> A force-push or target-branch change makes the proof fail closed. The sponsor can recover escrow after the deadline.</p>
          </div>
          <label className="form-field"><span>Bounty amount <b aria-hidden="true">*</b></span><div className="input-affix"><input aria-describedby="amount-hint" name="amountRlo" inputMode="decimal" min="0.000000001" placeholder="0.001" required step="0.000000001" type="text" /><b>RLO</b></div><small id="amount-hint">The contributor receives this exact amount in RLO.</small></label>
          <label className="form-field"><span>Deadline <b aria-hidden="true">*</b></span><input aria-describedby="deadline-hint" name="deadlineUnixMs" required type="datetime-local" /><small id="deadline-hint">Uses your local time · {timeZoneLabel}.</small></label>
          <div className="form-field form-grid__wide">
            <div className="form-field__label-row">
              <label htmlFor="workflow-id">Workflow ID <b aria-hidden="true">*</b></label>
              <button
                aria-label="Generate a new workflow ID"
                className="workflow-id__generate"
                disabled={isSubmitting || transactionPhase === "confirmed"}
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
