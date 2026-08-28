import Link from "next/link";
import {
  CircleCheck,
  GitPullRequest,
  Plus,
  RadioTower,
  ReceiptText,
  Vault,
} from "lucide-react";
import { WorkflowLifecycle } from "@/components/bounty/workflow-lifecycle";
import { ScrollReveal } from "@/components/motion/scroll-reveal";
import { CopyValue } from "@/components/ui/copy-value";
import { devnetDeployment, hardenedDeploymentReady } from "@/lib/deployment";

export default function HomePage() {
  const deployedProgramId = devnetDeployment.hardenedArtifact.programId;

  return (
    <main>
      <section className="hero page-width">
        <div className="hero__ambient" aria-hidden="true"><span /><span /></div>
        <div className="hero__content">
          <p className="eyebrow"><span>Rialo-native escrow</span><i /><b>01 / SETTLEMENT</b></p>
          <h1>Code merged.<br /><em>Bounty settled.</em></h1>
          <p className="hero__lede">Lock RLO against one GitHub pull request. Rialo checks the merge through REX and releases escrow without a keeper, webhook server, or payout backend.</p>
          <div className="hero__actions">
            <Link className="button" href="/bounties/new">Create a bounty <Plus aria-hidden="true" className="ui-icon" size={16} strokeWidth={2} /></Link>
            <Link className="text-link" href="/activity">Inspect DevNet proof <ReceiptText aria-hidden="true" className="ui-icon" size={16} strokeWidth={1.9} /></Link>
          </div>
          <div className="hero__proof">
          <div><strong>4</strong><span>paths proven<br />on DevNet</span></div>
            <div><strong>0</strong><span>offchain payout<br />operators</span></div>
            <div><strong>204</strong><span>GitHub signal<br />required to pay</span></div>
          </div>
        </div>

        <aside className="execution-card" aria-label="MergePay execution model">
          <div className="execution-card__glow" aria-hidden="true" />
          <div className="execution-card__header"><span>EXECUTION MODEL</span><span className="status-dot">RIALO DEVNET</span></div>
          <div className="execution-card__body">
            <div className="trace-node"><span className="trace-node__icon"><GitPullRequest aria-hidden="true" size={17} /></span><div><small>EXTERNAL SIGNAL</small><strong>Pull request merged</strong></div><span className="trace-code">204</span></div>
            <div className="trace-connector"><span>validator-attested HTTP</span></div>
            <div className="trace-node trace-node--accent"><span className="trace-node__icon"><RadioTower aria-hidden="true" size={17} /></span><div><small>RIALO REX</small><strong>Unanimous report</strong></div><span className="trace-check"><CircleCheck aria-hidden="true" size={17} /></span></div>
            <div className="trace-connector"><span>reactive callback</span></div>
            <div className="trace-node"><span className="trace-node__icon"><Vault aria-hidden="true" size={17} /></span><div><small>WORKFLOW PDA</small><strong>Release escrow</strong></div><span className="trace-code">RLO</span></div>
          </div>
          <div className="execution-card__footer"><span>{deployedProgramId ? "Hardened deployment" : "Tested candidate"}</span><CopyValue value={deployedProgramId ?? devnetDeployment.reviewCandidate.programId} /></div>
        </aside>
      </section>

      <section className="status-band">
        <ScrollReveal className="page-width status-band__inner" delay={40}>
          <span className="status-band__label">BUILD STATUS</span>
          <div><i className="status-indicator status-indicator--good" /><span>Core workflow</span><strong>Proven</strong></div>
          <div><i className="status-indicator status-indicator--good" /><span>Hardened deployment</span><strong>{hardenedDeploymentReady ? "Proven" : "Pending"}</strong></div>
          <div><i className="status-indicator" /><span>Browser wallet</span><strong>Not connected</strong></div>
        </ScrollReveal>
      </section>

      <section className="section page-width split-section">
        <ScrollReveal variant="left">
          <div className="section-heading"><span className="section-number mono">02</span><p className="eyebrow">The workflow</p><h2>One condition.<br />One settlement path.</h2><p>Every state transition is explicit, inspectable, and fail-closed.</p></div>
        </ScrollReveal>
        <ScrollReveal delay={100} variant="right">
          <WorkflowLifecycle />
        </ScrollReveal>
      </section>

      <section className="section page-width rialo-section">
        <ScrollReveal className="rialo-section__intro">
          <div><span className="section-number mono">03</span><p className="eyebrow">Why Rialo</p></div><h2>The internet becomes part of execution.</h2>
        </ScrollReveal>
        <ScrollReveal delay={100} variant="scale">
          <div className="rialo-grid">
            <article><span>01 / EDGE</span><h3>Native GitHub check</h3><p>Validators call the compact merge endpoint directly. There is no trusted oracle service between GitHub and escrow.</p></article>
            <article><span>02 / REACTIVE</span><h3>Automatic callback</h3><p>The REX report triggers a subscribed handler that evaluates consensus and settles the workflow.</p></article>
            <article><span>03 / ONCHAIN</span><h3>Fail-closed funds</h3><p>A 404, malformed output, empty report, or validator disagreement cannot release the bounty.</p></article>
          </div>
        </ScrollReveal>
      </section>

      <ScrollReveal className="page-width" variant="scale">
        <section className="cta-section"><div><p className="eyebrow">Start with one PR</p><h2>Make contribution<br />payable by proof.</h2></div><Link className="button button--light" href="/bounties/new">Define a bounty <Plus aria-hidden="true" className="ui-icon" size={16} strokeWidth={2} /></Link></section>
      </ScrollReveal>
    </main>
  );
}
