import type { Metadata } from "next";
import Link from "next/link";
import { BookOpen } from "lucide-react";
import { CopyValue } from "@/components/ui/copy-value";
import { devnetDeployment } from "@/lib/deployment";
import { verifiedEvidence } from "@/lib/evidence";

export const metadata: Metadata = { title: "Activity" };

export default function ActivityPage() {
  const recordedPathCount = verifiedEvidence.length;

  return (
    <main className="page-main page-width">
      <div className="page-hero">
        <div><p className="eyebrow">Verified activity</p><h1>Proof, not<br />promises.</h1><p>These are real callback and refund signatures recorded from the fully tested pre-hardening DevNet candidate.</p></div>
        <div className="evidence-summary" aria-label={`${recordedPathCount} terminal paths recorded on Rialo DevNet`}>
          <div className="evidence-summary__meta"><span>EVIDENCE SET</span><i /><b>DEVNET</b></div>
          <div className="evidence-summary__metric">
            <strong>{String(recordedPathCount).padStart(2, "0")}</strong>
            <p><span>Terminal paths</span><small>Recorded</small></p>
          </div>
        </div>
      </div>
      <section className="evidence-list">
        <div className="evidence-list__header"><span>OUTCOME</span><span>RESULT</span><span>TRANSACTION</span></div>
        {verifiedEvidence.map((item, index) => (
          <article className="evidence-row" key={item.signature}>
            <div><span className={`evidence-index evidence-index--${item.tone}`}>{String(index + 1).padStart(2, "0")}</span><h2>{item.label}</h2></div>
            <p>{item.detail}</p>
            <CopyValue value={item.signature} />
          </article>
        ))}
      </section>
      <section className="evidence-footnote"><div><p className="panel-label">EVIDENCE SCOPE</p><p>The signatures above belong to program <span className="mono">{devnetDeployment.reviewCandidate.programId}</span>. The hardened artifact is deployed and metadata-verified, but must pass fresh runtime proof before it replaces this candidate.</p></div><Link className="text-link" href="/docs">Read verification model <BookOpen aria-hidden="true" className="ui-icon" size={16} strokeWidth={1.9} /></Link></section>
    </main>
  );
}
