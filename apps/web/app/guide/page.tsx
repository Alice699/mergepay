import type { Metadata } from "next";
import Link from "next/link";
import {
  BookOpen,
  Check,
  CircleAlert,
  Activity,
  GitPullRequest,
  LockKeyhole,
  Network,
  Plus,
  RefreshCw,
  WalletCards,
} from "lucide-react";
import { ScrollReveal } from "@/components/motion/scroll-reveal";
import { CopyValue } from "@/components/ui/copy-value";
import { devnetDeployment } from "@/lib/deployment";
import type { ReactNode } from "react";

export const metadata: Metadata = { title: "Guide" };

export default function GuidePage() {
  return (
    <main className="page-main page-width guide-page">
      <div className="page-hero guide-hero">
        <div>
          <p className="eyebrow">Product guide</p>
          <h1>Code merged.<br />Value settled.</h1>
          <p>MergePay is a Rialo-native bounty escrow for public GitHub pull requests. It holds RLO in a workflow account, asks Rialo REX to verify the merge, and releases the bounty only when the onchain program receives a unanimous result.</p>
        </div>
        <div className="guide-hero__signal" aria-label="MergePay product summary">
          <div className="guide-hero__signal-mark"><Network aria-hidden="true" size={21} strokeWidth={1.6} /></div>
          <p className="panel-label">THE SHORT VERSION</p>
          <strong>A programmable escrow<br />for shipped code.</strong>
          <span>Rialo DevNet MVP</span>
        </div>
      </div>

      <div className="guide-layout">
        <aside className="guide-nav" aria-label="Guide sections">
          <p>ON THIS PAGE</p>
          <a href="#what">What MergePay is</a>
          <a href="#use">How to use it</a>
          <a href="#rialo">Why Rialo</a>
          <a href="#limits">Known limits</a>
          <a href="#review">For reviewers</a>
        </aside>

        <div className="guide-content">
          <ScrollReveal>
            <section className="guide-section guide-intro" id="what">
              <div className="guide-section__index">01</div>
              <div>
                <p className="eyebrow">The product</p>
                <h2>A bounty that can prove why it paid.</h2>
                <p>Most GitHub bounties depend on a person or a backend to decide whether work is complete. MergePay moves the settlement terms into a Rialo workflow account. The sponsor commits the repository, pull request, beneficiary, amount, and deadline before any funding is accepted.</p>
                <p>After that, the program owns the decision boundary: a merged pull request can release the committed RLO, while an unmerged pull request keeps the escrow locked until the deadline allows a sponsor refund.</p>
              </div>
            </section>
          </ScrollReveal>

          <ScrollReveal delay={70}>
            <section className="guide-section" id="use">
              <div className="guide-section__index">02</div>
              <div>
                <p className="eyebrow">Using MergePay</p>
                <h2>Five steps from brief to settlement.</h2>
                <div className="guide-steps">
                  <GuideStep number="01" icon={<WalletCards aria-hidden="true" size={18} strokeWidth={1.7} />} title="Connect a wallet" copy="Connect a Rialo extension or unlock the embedded DevNet wallet. The active address becomes the sponsor for workflows it creates." />
                  <GuideStep number="02" icon={<Plus aria-hidden="true" size={18} strokeWidth={1.9} />} title="Create the bounty" copy="Enter a public GitHub owner, repository, pull request number, beneficiary, amount, deadline, and generated workflow ID. Review the immutable terms before signing." />
                  <GuideStep number="03" icon={<LockKeyhole aria-hidden="true" size={18} strokeWidth={1.7} />} title="Fund the escrow" copy="Fund the workflow in a separate transaction. The exact committed amount moves into the workflow account; it is not an app database balance." />
                  <GuideStep number="04" icon={<GitPullRequest aria-hidden="true" size={18} strokeWidth={1.7} />} title="Merge the pull request" copy="The beneficiary completes the public GitHub work. The sponsor then starts one merge check after the pull request has been merged." />
                  <GuideStep number="05" icon={<RefreshCw aria-hidden="true" size={18} strokeWidth={1.7} />} title="Verify or recover" copy="Rialo REX reports the GitHub result to the program. A unanimous merge pays the beneficiary; an expired, unmerged workflow lets the sponsor recover the escrow." />
                </div>
                <div className="guide-cta-row">
                  <Link className="button" href="/bounties/new">Create a bounty <Plus aria-hidden="true" className="ui-icon" size={15} strokeWidth={2} /></Link>
                  <Link className="text-link" href="/docs">Read the protocol reference <BookOpen aria-hidden="true" className="ui-icon" size={15} strokeWidth={1.8} /></Link>
                </div>
              </div>
            </section>
          </ScrollReveal>

          <ScrollReveal delay={100}>
            <section className="guide-section" id="rialo">
              <div className="guide-section__index">03</div>
              <div>
                <p className="eyebrow">Why Rialo</p>
                <h2>The chain is part of the verification loop.</h2>
                <div className="guide-reasons">
                  <GuideReason title="REX can attest an external signal" copy="Rialo REX is the bridge between a public GitHub merge response and an onchain callback. MergePay consumes that report inside the program instead of trusting a private server." />
                  <GuideReason title="Escrow is a program state" copy="The sponsor, beneficiary, amount, deadline, and settlement flags live in a Rialo workflow account. Anyone with the account address can inspect the same state." />
                  <GuideReason title="Failure stays visible" copy="A missing account, unavailable decoder, mixed report, or non-merged pull request does not become a payout. The program and UI keep uncertain funds locked." />
                </div>
              </div>
            </section>
          </ScrollReveal>

          <ScrollReveal delay={120}>
            <section className="guide-section" id="limits">
              <div className="guide-section__index">04</div>
              <div>
                <p className="eyebrow">Be precise about the MVP</p>
                <h2>Useful today, intentionally bounded.</h2>
                <p>MergePay is a working DevNet builder submission, not production financial infrastructure. These constraints are part of the design and should remain visible to every user and reviewer.</p>
                <div className="guide-limits">
                  <GuideLimit title="DevNet only" copy="The active deployment is unaudited and uses test RLO. Do not send production funds." />
                  <GuideLimit title="Public GitHub only" copy="The current REX path reads a public pull-request merge endpoint. Private repositories and authenticated GitHub access are outside this MVP." />
                  <GuideLimit title="Sponsor starts the check" copy="Merge verification is manual and one-shot. There is no webhook, scheduler, or automatic retry in the product surface." />
                  <GuideLimit title="Rialo and GitHub are dependencies" copy="A slow RPC, unavailable REX path, changed GitHub response, or missing account can delay or prevent a decision." />
                  <GuideLimit title="Rent remains in the account" copy="Settlement returns or pays the bounty amount, while the workflow account retains the reserve required by Rialo." />
                  <GuideLimit title="Embedded wallet is browser-local" copy="The local signer is encrypted in this browser and limited to DevNet. Back up the wallet before moving devices." />
                </div>
              </div>
            </section>
          </ScrollReveal>

          <ScrollReveal delay={140}>
            <section className="guide-section guide-review" id="review">
              <div className="guide-section__index">05</div>
              <div>
                <p className="eyebrow">For Rialo reviewers</p>
                <h2>Everything important is inspectable.</h2>
                <p>Use the app as a live walkthrough, then inspect the same facts from the chain. The current program, real transaction activity, workflow decoder, and terminal states are all exposed without a simulated success layer.</p>
                <div className="guide-review__grid">
                  <div><Check aria-hidden="true" size={16} strokeWidth={2} /><span>Live wallet-scoped activity</span></div>
                  <div><Check aria-hidden="true" size={16} strokeWidth={2} /><span>Created, funded, paid, and refunded states</span></div>
                  <div><Check aria-hidden="true" size={16} strokeWidth={2} /><span>Fail-closed merge and refund branches</span></div>
                  <div><Check aria-hidden="true" size={16} strokeWidth={2} /><span>Runtime-proven DevNet program</span></div>
                </div>
                <div className="guide-program">
                  <span className="panel-label">ACTIVE REVIEW PROGRAM</span>
                  <CopyValue value={devnetDeployment.reviewCandidate.programId} />
                </div>
                <div className="guide-cta-row">
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
