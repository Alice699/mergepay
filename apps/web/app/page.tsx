import Link from "next/link";
import {
  CircleCheck,
  GitPullRequest,
  LockKeyhole,
  Plus,
  RadioTower,
  ReceiptText,
  TimerReset,
  Vault,
} from "lucide-react";
import { WorkflowLifecycle } from "@/components/bounty/workflow-lifecycle";
import { MergeCoreScene } from "@/components/home/merge-core-scene";
import { ScrollReveal } from "@/components/motion/scroll-reveal";
import { CopyValue } from "@/components/ui/copy-value";
import {
  marketplaceDeployment,
  marketplaceDeploymentReady,
} from "@/lib/deployment";

export default function HomePage() {
  const deployedProgramId = marketplaceDeployment.programId;

  return (
    <main className="home-page">
      <section className="home-hero page-width">
        <div className="home-hero__content">
          <div className="home-eyebrow">
            <span>
              <i /> Rialo-native settlement
            </span>
            <b>DevNet / Live workflow</b>
          </div>
          <h1>
            <span>Onchain bounties</span>
            <em>for pull requests.</em>
          </h1>
          <p className="home-hero__lede">
            Fund a public GitHub pull request in RLO. MergePay verifies the
            contributor and releases escrow when the merge is confirmed on
            Rialo.
          </p>
          <div className="home-hero__actions">
            <Link
              className="home-button home-button--primary"
              href="/bounties/new"
            >
              Create a bounty
              <Plus
                aria-hidden="true"
                className="ui-icon"
                size={16}
                strokeWidth={1.9}
              />
            </Link>
            <Link className="home-button home-button--glass" href="/activity">
              <ReceiptText
                aria-hidden="true"
                className="ui-icon"
                size={15}
                strokeWidth={1.8}
              />
              Inspect onchain proof
            </Link>
          </div>
        </div>

        <div className="home-hero__scene">
          <MergeCoreScene />
        </div>
      </section>

      <section className="home-proof-rail">
        <ScrollReveal className="home-proof-rail__inner page-width" delay={40}>
          <p>
            <span>Systems, not promises.</span>
            <strong>Every payout ends in verifiable state.</strong>
          </p>
          <div>
            <GitPullRequest aria-hidden="true" size={17} strokeWidth={1.6} />
            <span>Public PR</span>
            <strong>Author-bound</strong>
          </div>
          <div>
            <RadioTower aria-hidden="true" size={17} strokeWidth={1.6} />
            <span>Rialo REX</span>
            <strong>Validator-attested</strong>
          </div>
          <div>
            <Vault aria-hidden="true" size={17} strokeWidth={1.6} />
            <span>Marketplace</span>
            <strong>
              {marketplaceDeploymentReady
                ? "Program deployed"
                : "Configuration pending"}
            </strong>
          </div>
        </ScrollReveal>
      </section>

      <section className="home-section home-flow page-width">
        <ScrollReveal className="home-section__intro" variant="left">
          <span className="home-section__index">02 / CONTROLLED FLOW</span>
          <p className="home-section__eyebrow">One source of truth</p>
          <h2>
            Every state is visible.
            <br />
            <em>Every exit is earned.</em>
          </h2>
          <p className="home-section__lede">
            The workflow does not infer success. It advances only when the
            expected wallet signs and Rialo can verify the exact account or
            GitHub condition.
          </p>
          <div className="home-deployment">
            <div>
              <span>Active marketplace</span>
              <strong>
                {marketplaceDeploymentReady
                  ? "Rialo DevNet"
                  : "Deployment required"}
              </strong>
            </div>
            <CopyValue value={deployedProgramId} />
          </div>
        </ScrollReveal>

        <ScrollReveal className="home-flow__glass" delay={100} variant="right">
          <div className="home-glass-heading">
            <span>SETTLEMENT SEQUENCE</span>
            <span>
              <i /> ONCHAIN LIFECYCLE
            </span>
          </div>
          <WorkflowLifecycle />
        </ScrollReveal>
      </section>

      <section className="home-section home-intelligence">
        <div className="page-width">
          <ScrollReveal className="home-section__headline">
            <div>
              <span className="home-section__index">03 / EXECUTION</span>
              <p className="home-section__eyebrow">Internet-native proof</p>
            </div>
            <h2 className="home-section__title-lockup">
              <span>The condition</span>
              <span>comes to the contract.</span>
            </h2>
          </ScrollReveal>

          <ScrollReveal className="home-bento" delay={100} variant="scale">
            <article className="home-bento__card home-bento__card--signal">
              <header>
                <span className="home-bento__icon">
                  <RadioTower aria-hidden="true" size={19} strokeWidth={1.55} />
                </span>
                <small>REX / EXTERNAL SIGNAL</small>
              </header>
              <h3>The merge proof enters execution.</h3>
              <p>
                Rialo validators request GitHub’s compact merge endpoint. Only
                the agreed response can advance settlement.
              </p>
              <div className="home-http-proof">
                <span>GET /pulls/42/merge</span>
                <strong>204</strong>
                <small>UNANIMOUS</small>
              </div>
            </article>

            <article className="home-bento__card home-bento__card--escrow">
              <header>
                <span className="home-bento__icon">
                  <LockKeyhole
                    aria-hidden="true"
                    size={19}
                    strokeWidth={1.55}
                  />
                </span>
                <small>PROGRAM ESCROW</small>
              </header>
              <h3>Value stays inside the workflow.</h3>
              <p>
                The sponsor cannot silently redirect the beneficiary after
                approving a verified claim.
              </p>
              <div className="home-escrow-meter">
                <span>
                  <i /> FUNDED
                </span>
                <strong>1.000 RLO</strong>
              </div>
            </article>

            <article className="home-bento__card home-bento__card--outcomes">
              <div>
                <header>
                  <span className="home-bento__icon">
                    <TimerReset
                      aria-hidden="true"
                      size={19}
                      strokeWidth={1.55}
                    />
                  </span>
                  <small>TERMINAL STATES</small>
                </header>
                <h3>One escrow. Two legitimate outcomes.</h3>
                <p>
                  A verified merge pays the contributor. An expired, unpaid
                  workflow returns the escrow to its sponsor.
                </p>
              </div>
              <div className="home-outcomes">
                <div>
                  <CircleCheck aria-hidden="true" size={18} strokeWidth={1.6} />
                  <span>Merge verified</span>
                  <strong>Paid</strong>
                </div>
                <div>
                  <TimerReset aria-hidden="true" size={18} strokeWidth={1.6} />
                  <span>Deadline elapsed</span>
                  <strong>Refunded</strong>
                </div>
              </div>
            </article>
          </ScrollReveal>
        </div>
      </section>

      <ScrollReveal className="home-final page-width" variant="scale">
        <section className="home-final__glass">
          <div>
            <span className="home-section__index">04 / CREATE</span>
            <p className="home-section__eyebrow">Start with one pull request</p>
            <h2>
              Attach value to work
              <br />
              that can prove itself.
            </h2>
          </div>
          <Link className="home-button home-button--light" href="/bounties/new">
            Define a bounty
            <Plus
              aria-hidden="true"
              className="ui-icon"
              size={16}
              strokeWidth={1.9}
            />
          </Link>
        </section>
      </ScrollReveal>
    </main>
  );
}
