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
          <p>MergePay is a Rialo-native marketplace for public GitHub pull-request bounties. Sponsors publish a clear brief, contributors prove they authored the target PR, and the sponsor approves the payout wallet before RLO is funded.</p>
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
                <p>Most GitHub bounties rely on a person or a private backend to coordinate the work, identify the contributor, and decide where payment goes. MergePay moves the terms into a Rialo workflow account: repository, pull request, amount, deadline, and an open claim state are committed before funding.</p>
                <p>The contributor verifies the public PR author and signs a claim with the receiving wallet. MergePay detects that onchain claim on the sponsor page, where the sponsor approves it before funding. Funding arms Rialo&apos;s native heartbeat: a merged pull request pays the approved wallet automatically, while reaching the deadline first refunds the sponsor automatically.</p>
              </div>
            </section>
          </ScrollReveal>

          <ScrollReveal className="guide-section-reveal" delay={70}>
            <section className="guide-section" id="use">
              <div className="guide-section__index">02 / Workflow</div>
              <div>
                <p className="eyebrow">Using MergePay</p>
                <h2>Five steps from brief to settlement.</h2>
                <div className="guide-steps">
                  <GuideStep number="01" icon={<WalletCards aria-hidden="true" size={18} strokeWidth={1.7} />} title="Connect a wallet" copy="Connect a Rialo extension or unlock the embedded DevNet wallet. The active address becomes the sponsor for workflows it creates, or the contributor wallet for a claim." />
                  <GuideStep number="02" icon={<Plus aria-hidden="true" size={18} strokeWidth={1.9} />} title="Post the bounty" copy="Enter a public GitHub owner, repository, pull request number, amount, deadline, and generated workflow ID. The beneficiary is intentionally left open for a contributor claim." />
                  <GuideStep number="03" icon={<GitPullRequest aria-hidden="true" size={18} strokeWidth={1.7} />} title="Claim the PR" copy="The PR author connects GitHub. MergePay compares the authenticated GitHub user ID with the exact public pull request, then the contributor signs a claim record with the wallet that should be paid." />
                  <GuideStep number="04" icon={<KeyRound aria-hidden="true" size={18} strokeWidth={1.7} />} title="Approve and fund" copy="The sponsor page detects the matching claim automatically. The sponsor reviews the contributor wallet, approves it, and funds escrow in a separate transaction. The beneficiary cannot change after approval." />
                  <GuideStep number="05" icon={<ReceiptText aria-hidden="true" size={18} strokeWidth={1.7} />} title="Watch and verify" copy="Rialo keeps checking after funding. A unanimous merged proof pays the contributor; reaching the deadline first refunds the sponsor. The live workflow updates without a page reload, and the separate Settlements page shows only confirmed paid or refunded outcomes." />
                </div>
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
                  <GuideReason title="REX can attest an external signal" copy="Rialo REX is the bridge between GitHub's public merged endpoint and an onchain callback. MergePay consumes the validator report inside the program instead of trusting a private payout server." />
                  <GuideReason title="Escrow is a program state" copy="The sponsor, approved contributor, amount, deadline, claim proof, and settlement flags live in Rialo workflow accounts. Anyone with the account address can inspect the same state." />
                  <GuideReason title="Failure stays visible" copy="A missing account, unavailable decoder, mixed report, or non-merged pull request does not become a payout. The program and UI keep uncertain funds locked." />
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
                  <GuideLimit title="Public GitHub only" copy="The current REX settlement path reads a public pull-request merge endpoint. Authenticated private-repository settlement is outside this MVP." />
                  <GuideLimit title="Settlement is asynchronous" copy="The native heartbeat and REX callback run automatically after funding, but DevNet and GitHub response time mean a terminal receipt may not appear instantly. Manual check and refund controls remain idempotent fallbacks." />
                  <GuideLimit title="GitHub identity scope" copy="Contributor claims require read-only GitHub OAuth and an exact author-ID match for a public PR. MergePay does not request repository write access or support private repositories yet." />
                  <GuideLimit title="Rialo and GitHub are dependencies" copy="A slow RPC, unavailable REX path, changed GitHub response, or missing account can delay or prevent a decision." />
                  <GuideLimit title="Rent remains in the account" copy="Settlement returns or pays the bounty amount, while the workflow account retains the reserve required by Rialo." />
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
                  <div><Check aria-hidden="true" size={16} strokeWidth={2} /><span>Fail-closed merge and refund branches</span></div>
                  <div><Check aria-hidden="true" size={16} strokeWidth={2} /><span>Autonomous payout and refund E2E proven</span></div>
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
