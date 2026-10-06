import type { Metadata } from "next";
import Link from "next/link";
import {
  BookOpen,
  Check,
  CircleAlert,
  Activity,
  GitPullRequest,
  Network,
  Plus,
  KeyRound,
  ReceiptText,
  WalletCards,
} from "lucide-react";
import { ScrollReveal } from "@/components/motion/scroll-reveal";
import { CopyValue } from "@/components/ui/copy-value";
import { marketplaceDeployment } from "@/lib/deployment";
import type { ReactNode } from "react";

export const metadata: Metadata = { title: "Guide" };

export default function GuidePage() {
  return (
    <main className="page-main page-width liquid-slate-page guide-page">
      <div className="page-hero guide-hero">
        <ScrollReveal className="guide-hero__copy" delay={20} variant="left">
          <div className="guide-eyebrow">
            <span>
              <i aria-hidden="true" /> Product walkthrough
            </span>
            <b>DevNet / Five steps</b>
          </div>
          <h1>
            <span>Code merged.</span>
            <em>Value settled.</em>
          </h1>
          <p>MergePay is a Rialo-native marketplace for public GitHub pull-request bounties. Sponsors lock a PR revision, reward, deadline, and optional CI or review requirements. The PR author verifies their GitHub identity, requests a payout wallet, and gets sponsor approval before funding.</p>
        </ScrollReveal>
        <ScrollReveal className="guide-hero__signal-reveal" delay={100} variant="scale">
          <div className="guide-hero__signal" aria-label="MergePay product summary">
            <div className="guide-hero__signal-mark"><Network aria-hidden="true" size={21} strokeWidth={1.6} /></div>
            <p className="panel-label">THE SHORT VERSION</p>
            <strong>A programmable escrow<br />for shipped code.</strong>
            <span>Autonomous settlement · onchain receipts</span>
          </div>
        </ScrollReveal>
      </div>

      <div className="guide-layout">
        <aside className="guide-nav" aria-label="Guide sections">
          <p>ON THIS PAGE</p>
          <a href="#what"><span>01</span><b>What MergePay is</b></a>
          <a href="#use"><span>02</span><b>How to use it</b></a>
          <a href="#rialo"><span>03</span><b>Why Rialo</b></a>
          <a href="#limits"><span>04</span><b>Known limits</b></a>
          <a href="#review"><span>05</span><b>For reviewers</b></a>
        </aside>

        <div className="guide-content">
          <ScrollReveal className="guide-section-reveal">
            <section className="guide-section guide-intro" id="what">
              <div className="guide-section__index">01 / Product</div>
              <div>
                <p className="eyebrow">The product</p>
                <h2>A bounty that can prove why it paid.</h2>
                <p>MergePay records the bounty terms in a Rialo workflow account: repository, pull request, exact head commit, target branch, reward, deadline, and selected CI or review policy. The payout wallet remains open until the sponsor approves a contributor claim.</p>
                <p>The PR author connects GitHub, verifies the target PR, and signs a claim with a separate receiving wallet. The sponsor reviews that onchain claim, approves the beneficiary, and funds escrow. Funding arms Rialo&apos;s native heartbeat. Payout requires a valid REX proof that satisfies every locked condition and is processed before the deadline. If a funded workflow reaches its deadline without payout, the native workflow refunds the sponsor.</p>
              </div>
            </section>
          </ScrollReveal>

          <ScrollReveal className="guide-section-reveal" delay={70}>
            <section className="guide-section" id="use">
              <div className="guide-section__index">02 / Workflow</div>
              <div>
                <p className="eyebrow">Using MergePay</p>
                <h2>Five steps from PR to settlement.</h2>
                <div className="guide-steps">
                  <GuideStep number="01" icon={<WalletCards aria-hidden="true" size={18} strokeWidth={1.7} />} title="Connect a wallet" copy="Connect a Rialo extension or unlock the embedded DevNet wallet. Use different sponsor and contributor wallets, with enough test RLO for transactions. The sponsor also covers the reward and workflow storage." />
                  <GuideStep number="02" icon={<Plus aria-hidden="true" size={18} strokeWidth={1.9} />} title="Verify and create the bounty" copy="Enter the public GitHub owner, repository, and PR number, then select Verify target to lock the head SHA and target branch. Choose the reward, future deadline, Require successful CI, and Required approvals as needed. The workflow ID is generated automatically; the beneficiary stays open." />
                  <GuideStep number="03" icon={<GitPullRequest aria-hidden="true" size={18} strokeWidth={1.7} />} title="Claim the PR" copy="The PR author connects GitHub and the receiving wallet, then selects Verify PR. The app matches the authenticated numeric GitHub user ID to the PR author and issues a short-lived, one-time authorization. Sign the claim before the bounty deadline; a session, wallet, or target change requires fresh verification." />
                  <GuideStep number="04" icon={<KeyRound aria-hidden="true" size={18} strokeWidth={1.7} />} title="Review, approve, and fund" copy="The sponsor page discovers confirmed claims and shows the identity, wallet, exact terms, claim PDA, and source transaction. It rechecks the public PR author before approval. Choose explicitly if several claims match. Approval locks the beneficiary; funding is a separate transaction. Both must finish before the deadline." />
                  <GuideStep number="05" icon={<ReceiptText aria-hidden="true" size={18} strokeWidth={1.7} />} title="Watch and verify" copy="Rialo checks after funding. Payout needs matching head SHA and branch, a merged PR, any selected CI and approval requirements, and a valid proof processed before the deadline. Otherwise, an unpaid funded workflow is refunded after expiry. The visible detail page refreshes decoded state; the separate Settlements page shows only confirmed paid or refunded outcomes." />
                </div>
                <p><strong>Plan around the deadline.</strong> It is an absolute time selected when creating the bounty; funding does not restart it. The form uses your browser&apos;s local time zone, and the workflow stores a Unix timestamp. Allow time for claim, approval, funding, CI, and REX processing. Merging before the deadline alone does not guarantee payout if the proof callback arrives after it.</p>
                <div className="guide-cta-row">
                  <Link className="button" href="/bounties/new">Create a bounty <Plus aria-hidden="true" className="ui-icon" size={15} strokeWidth={2} /></Link>
                  <Link className="text-link" href="/settlements">View settlements <ReceiptText aria-hidden="true" className="ui-icon" size={15} strokeWidth={1.8} /></Link>
                  <Link className="text-link" href="/docs">Read the protocol reference <BookOpen aria-hidden="true" className="ui-icon" size={15} strokeWidth={1.8} /></Link>
                </div>
              </div>
            </section>
          </ScrollReveal>

          <ScrollReveal className="guide-section-reveal" delay={100}>
            <section className="guide-section" id="rialo">
              <div className="guide-section__index">03 / Rialo</div>
              <div>
                <p className="eyebrow">Why Rialo</p>
                <h2>The chain is part of the verification loop.</h2>
                <div className="guide-reasons">
                  <GuideReason title="REX checks external conditions" copy="The custom REX verifier reads public GitHub PR, CI, and review evidence. The program requires all outputs in the received REX report to be usable and identical, then validates the compact proof against the locked policy. A private payout server cannot authorize settlement." />
                  <GuideReason title="Escrow is program state" copy="Bounty terms, the approved beneficiary, claim records, observed proof, and settlement flags live in Rialo accounts. Native timers keep the funded workflow running without an open browser. Anyone with the account address can inspect its state." />
                  <GuideReason title="Uncertainty is not a payout" copy="An invalid or inconsistent REX result cannot authorize payment. RPC or decoder failures are surfaced in the UI; they do not themselves lock funds or stop native execution. An unpaid funded workflow remains eligible for deadline refund." />
                </div>
              </div>
            </section>
          </ScrollReveal>

          <ScrollReveal className="guide-section-reveal" delay={120}>
            <section className="guide-section" id="limits">
              <div className="guide-section__index">04 / Limits</div>
              <div>
                <p className="eyebrow">Be precise about the MVP</p>
                <h2>Useful today, intentionally bounded.</h2>
                <p>MergePay is a working DevNet builder submission, not production financial infrastructure. These constraints are part of the design and should remain visible to every user and reviewer.</p>
                <div className="guide-limits">
                  <GuideLimit title="DevNet only" copy="The active deployment is unaudited and uses test RLO. Do not send production funds." />
                  <GuideLimit title="Public GitHub only" copy="The current REX settlement path reads public PR, CI, and review endpoints. Authenticated private-repository settlement is outside this MVP." />
                  <GuideLimit title="Locked revision and policy" copy="A different head commit or target branch does not satisfy the original bounty. Create a new workflow for new terms. CI and approvals are payment conditions, not a guarantee of code quality or security." />
                  <GuideLimit title="Settlement is asynchronous" copy="Native checks and REX callbacks run after funding, but there is no guaranteed time from merge to payout. Run check now requests a check only while the workflow is active and before expiry. Refund is available after the deadline. Neither control bypasses the program's rules." />
                  <GuideLimit title="GitHub identity scope" copy="GitHub OAuth and the app verify the public PR author before claim and sponsor approval. These are application checks, not an onchain identity attestation. The program enforces sponsor authority, matching terms, and the beneficiary lock. No repository write access is requested." />
                  <GuideLimit title="Rialo and GitHub are dependencies" copy="GitHub or REX failures can prevent a valid payout proof. RPC or decoder failures can delay what the UI displays. Neither a page error nor an old displayed proof establishes the current onchain outcome." />
                  <GuideLimit title="Storage balance remains" copy="Settlement pays or returns the bounty principal. It does not close the workflow account or return its remaining storage balance; transaction and storage costs are separate from the reward." />
                  <GuideLimit title="Embedded wallet is browser-local" copy="The local signer is encrypted in this browser and limited to DevNet. Back up the wallet before moving devices." />
                </div>
              </div>
            </section>
          </ScrollReveal>

          <ScrollReveal className="guide-section-reveal" delay={140}>
            <section className="guide-section guide-review" id="review">
              <div className="guide-section__index">05 / Review</div>
              <div>
                <p className="eyebrow">For Rialo reviewers</p>
                <h2>Everything important is inspectable.</h2>
                <p>Use the app as a live walkthrough, then inspect the same facts from the chain. The current program, real transaction activity, workflow decoder, and terminal states are all exposed without a simulated success layer.</p>
                <div className="guide-review__grid">
                  <div><Check aria-hidden="true" size={16} strokeWidth={2} /><span>Live wallet-scoped activity</span></div>
                  <div><Check aria-hidden="true" size={16} strokeWidth={2} /><span>Wallet-scoped paid/refunded history</span></div>
                  <div><Check aria-hidden="true" size={16} strokeWidth={2} /><span>Policy-checked payout and deadline refund</span></div>
                  <div><Check aria-hidden="true" size={16} strokeWidth={2} /><span>Inspectable payout and refund outcomes</span></div>
                </div>
                <div className="guide-program">
                  <span className="panel-label">ACTIVE MARKETPLACE PROGRAM</span>
                  <CopyValue value={marketplaceDeployment.programId} />
                </div>
                <div className="guide-cta-row">
                  <Link className="button" href="/settlements">Open settlements <ReceiptText aria-hidden="true" className="ui-icon" size={15} strokeWidth={1.8} /></Link>
                  <Link className="button" href="/activity">Inspect wallet activity <ActivityIcon /></Link>
                  <Link className="text-link" href="/docs#trust">Read trust limits <CircleAlert aria-hidden="true" className="ui-icon" size={15} strokeWidth={1.8} /></Link>
                </div>
              </div>
            </section>
          </ScrollReveal>
        </div>
      </div>
    </main>
  );
}

function GuideStep({ copy, icon, number, title }: Readonly<{ copy: string; icon: ReactNode; number: string; title: string }>) {
  return (
    <article className="guide-step">
      <span className="guide-step__number mono">{number}</span>
      <span className="guide-step__icon">{icon}</span>
      <div><h3>{title}</h3><p>{copy}</p></div>
    </article>
  );
}

function GuideReason({ copy, title }: Readonly<{ copy: string; title: string }>) {
  return <article className="guide-reason"><span className="guide-reason__rule" aria-hidden="true" /><div><h3>{title}</h3><p>{copy}</p></div></article>;
}

function GuideLimit({ copy, title }: Readonly<{ copy: string; title: string }>) {
  return <article className="guide-limit"><CircleAlert aria-hidden="true" size={17} strokeWidth={1.7} /><div><h3>{title}</h3><p>{copy}</p></div></article>;
}

function ActivityIcon() {
  return <Activity aria-hidden="true" className="ui-icon" size={15} strokeWidth={1.8} />;
}
