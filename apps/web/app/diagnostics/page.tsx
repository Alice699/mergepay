import type { Metadata } from "next";
import { Activity, ShieldCheck } from "lucide-react";
import { WorkflowDiagnosticsDashboard } from "@/components/diagnostics/workflow-diagnostics-dashboard";

export const metadata: Metadata = {
  title: "Diagnostics",
  description:
    "Inspect live MergePay workflow health, stale settlement signals, and onchain lineage on Rialo DevNet.",
};

export default function DiagnosticsPage() {
  return (
    <main className="page-main page-width liquid-slate-page ledger-page diagnostics-page">
      <div className="page-hero ledger-hero diagnostics-hero">
        <div className="ledger-hero__copy">
          <div className="ledger-eyebrow">
            <span>
              <i aria-hidden="true" /> Workflow operations
            </span>
            <b>DevNet / Read only</b>
          </div>
          <h1>
            <span>See what needs</span>
            <em>attention.</em>
          </h1>
          <p>
            Reconcile every discovered bounty against its live Rialo account,
            latest transaction, immutable deadline, and terminal state. Missing
            or inconsistent records stay visible for investigation.
          </p>
        </div>

        <aside className="diagnostics-scope ledger-scope" aria-label="Diagnostics safety boundary">
          <div className="ledger-scope__head">
            <div className="ledger-scope__icon" aria-hidden="true">
              <Activity size={20} strokeWidth={1.6} />
            </div>
            <span><i aria-hidden="true" /> Live reconciliation</span>
          </div>
          <div className="ledger-scope__body">
            <span>SAFETY BOUNDARY</span>
            <strong>Read-only inspection</strong>
            <small>No wallet signature · no state mutation</small>
          </div>
        </aside>
      </div>

      <WorkflowDiagnosticsDashboard />

      <section className="ledger-footnote diagnostics-footnote">
        <div className="ledger-footnote__intro">
          <span className="ledger-footnote__icon" aria-hidden="true">
            <ShieldCheck size={17} strokeWidth={1.7} />
          </span>
          <div className="ledger-footnote__content">
            <p className="panel-label">WHAT RECONCILE DOES</p>
            <p>
              Reconcile repeats bounded RPC reads for the active program. It
              cannot approve a claim, move escrow, replace a beneficiary, or
              change a paid or refunded result.
            </p>
          </div>
        </div>
        <div className="ledger-footnote__proof">
          <span className="state state--good">Read-only by design</span>
          <div className="ledger-footnote__flags" aria-label="Reconciliation guarantees">
            <code>0 transactions</code>
            <span>·</span>
            <code>live account reads</code>
          </div>
        </div>
      </section>
    </main>
  );
}
