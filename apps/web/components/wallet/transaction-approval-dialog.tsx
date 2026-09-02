"use client";

import { Check, Fingerprint, LockKeyhole, X } from "lucide-react";
import { useEffect, useRef } from "react";
import { useNetwork } from "@/hooks/use-network";
import { useWallet } from "@/hooks/use-wallet";
import { shortenAddress } from "@/lib/format";

export function TransactionApprovalDialog() {
  const wallet = useWallet();
  const network = useNetwork();
  const approveButtonRef = useRef<HTMLButtonElement>(null);
  const approval = wallet.approval;

  useEffect(() => {
    if (!approval) return;
    approveButtonRef.current?.focus();

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") wallet.rejectTransaction();
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [approval, wallet]);

  if (!approval) return null;

  return (
    <div className="wallet-approval-backdrop">
      <section
        aria-describedby="wallet-approval-summary"
        aria-labelledby="wallet-approval-title"
        aria-modal="true"
        className="wallet-approval"
        role="dialog"
      >
        <header className="wallet-approval__header">
          <div className="wallet-approval__mark" aria-hidden="true">
            <Fingerprint size={20} />
          </div>
          <div>
            <p className="panel-label">LOCAL SIGNATURE</p>
            <h2 id="wallet-approval-title">{approval.action}</h2>
          </div>
          <button
            aria-label="Reject transaction"
            className="wallet-approval__close"
            onClick={wallet.rejectTransaction}
            type="button"
          >
            <X aria-hidden="true" size={17} />
          </button>
        </header>

        <p className="wallet-approval__summary" id="wallet-approval-summary">
          {approval.summary}
        </p>

        <dl className="wallet-approval__details">
          <div>
            <dt>Network</dt>
            <dd>{network.label}</dd>
          </div>
          <div>
            <dt>Signer</dt>
            <dd title={approval.payer}>{shortenAddress(approval.payer, 7)}</dd>
          </div>
          <div>
            <dt>Program</dt>
            <dd title={approval.programs[0]}>
              {approval.programs[0]
                ? shortenAddress(approval.programs[0], 7)
                : "Unavailable"}
            </dd>
          </div>
          <div>
            <dt>Instructions</dt>
            <dd>{approval.instructionCount}</dd>
          </div>
          {approval.amountKelvin && (
            <div>
              <dt>Committed amount</dt>
              <dd>{approval.amountKelvin} kelvin</dd>
            </div>
          )}
          {approval.workflowAddress && (
            <div>
              <dt>Workflow account</dt>
              <dd title={approval.workflowAddress}>
                {shortenAddress(approval.workflowAddress, 7)}
              </dd>
            </div>
          )}
        </dl>

        <div className="wallet-approval__boundary">
          <LockKeyhole aria-hidden="true" size={15} />
          <p>
            Your encrypted key stays in this browser. The signer rejects any
            instruction outside the active MergePay program.
          </p>
        </div>

        <div className="wallet-approval__actions">
          <button
            className="wallet-approval__reject"
            onClick={wallet.rejectTransaction}
            type="button"
          >
            Reject
          </button>
          <button
            className="wallet-approval__approve"
            onClick={wallet.approveTransaction}
            ref={approveButtonRef}
            type="button"
          >
            <Check aria-hidden="true" size={15} />
            Sign transaction
          </button>
        </div>
      </section>
    </div>
  );
}
