"use client";

import { LockKeyhole } from "lucide-react";
import { useWallet } from "@/hooks/use-wallet";

export function CreateBountyForm() {
  const wallet = useWallet();

  return (
    <form className="bounty-form" aria-label="Create a MergePay bounty">
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
          <label className="form-field form-grid__wide"><span>Workflow ID <b aria-hidden="true">*</b></span><input aria-describedby="workflow-id-hint" name="workflowSlug" autoComplete="off" minLength={64} maxLength={64} pattern="[0-9a-fA-F]{64}" placeholder="64 hexadecimal characters" required spellCheck={false} /><small id="workflow-id-hint">A unique hexadecimal slug used in the sponsor-derived workflow PDA.</small></label>
        </div>
      </fieldset>

      <div className="form-submit">
        <div className="form-submit__status">
          <i aria-hidden="true" />
          <div><p>Transaction unavailable</p><span>{wallet.status === "connected" ? "Rialo transaction client is not connected." : "A supported Rialo wallet and transaction client are required."}</span></div>
        </div>
        <button className="button" disabled type="submit">Creation unavailable <LockKeyhole aria-hidden="true" size={15} /></button>
      </div>
    </form>
  );
}
