import type { Metadata } from "next";
import { ScrollReveal } from "@/components/motion/scroll-reveal";
import { CopyValue } from "@/components/ui/copy-value";
import { marketplaceDeployment } from "@/lib/deployment";

export const metadata: Metadata = {
  title: "Docs",
  description: "MergePay protocol flow, account roles, GitHub proof, and settlement guarantees.",
};

export default function DocsPage() {
  return (
    <main className="page-main page-width liquid-slate-page docs-page">
      <div className="page-hero docs-hero">
        <ScrollReveal className="docs-hero__copy" delay={20} variant="left">
          <div className="docs-eyebrow">
            <span><i aria-hidden="true" /> Rialo-native protocol</span>
            <b>DevNet / Live reference</b>
          </div>
          <h1><span>Small surface.</span><em>Clear trust.</em></h1>
          <p>Follow the exact path from a verified GitHub claim to native Rialo payout or deadline refund.</p>
        </ScrollReveal>
        <ScrollReveal className="docs-program-reveal" delay={100} variant="scale">
          <div aria-label="Active MergePay deployment" className="docs-program">
            <div className="docs-program__status">
              <span><i aria-hidden="true" /> Active DevNet program</span>
              <b>Live</b>
            </div>
            <div className="docs-program__identity">
              <small>Marketplace program</small>
              <CopyValue value={marketplaceDeployment.programId} />
            </div>
            <div className="docs-program__footer">
              <span>Autonomous payout and refund</span>
              <strong>Runtime-proven</strong>
            </div>
          </div>
        </ScrollReveal>
      </div>

      <div className="docs-layout">
        <aside aria-label="Documentation sections" className="docs-nav">
          <p>ON THIS PAGE</p>
          <a href="#flow"><span>01</span><b>Execution flow</b></a>
          <a href="#roles"><span>02</span><b>Account roles</b></a>
          <a href="#signal"><span>03</span><b>GitHub signal</b></a>
          <a href="#trust"><span>04</span><b>Settlement &amp; limits</b></a>
        </aside>

        <div className="docs-content">
          <section id="flow">
            <span className="docs-index">01 / Flow</span>
            <ScrollReveal className="docs-section-reveal" delay={40}>
              <div>
              <h2>Execution flow</h2>
              <p>A sponsor publishes an open workflow PDA. The contributor authenticates with GitHub, the server matches the numeric user ID to the exact public PR author, and the contributor signs a separate claim PDA. The sponsor approves that immutable claim before atomic preparation and funding lock the exact RLO escrow.</p>
              <p>Funding arms a native Rialo heartbeat. It rechecks the deadline, polls GitHub through REX, and completes payout or refund without another sponsor click. The workflow page keeps reading the decoded account while settlement is active and announces the confirmed terminal state without requiring a manual refresh.</p>
              <ol aria-label="MergePay execution phases" className="protocol-flow">
                <li>
                  <header>
                    <span>01</span>
                    <div><strong>Publish</strong><small>Sponsor</small></div>
                  </header>
                  <div className="protocol-flow__commands mono">
                    <code>create_bounty</code>
                  </div>
                  <p>Commit the public PR, exact RLO amount, deadline, and open beneficiary state.</p>
                </li>
                <li>
                  <header>
                    <span>02</span>
                    <div><strong>Authorize</strong><small>Contributor + sponsor</small></div>
                  </header>
                  <div className="protocol-flow__commands mono">
                    <code>verify_identity</code>
                    <i aria-hidden="true" />
                    <code>request_claim</code>
                    <i aria-hidden="true" />
                    <code>accept_claim</code>
                  </div>
                  <p>Match the GitHub author, record the payout wallet, and lock sponsor approval.</p>
                </li>
                <li>
                  <header>
                    <span>03</span>
                    <div><strong>Lock escrow</strong><small>Sponsor</small></div>
                  </header>
                  <div className="protocol-flow__commands mono">
                    <code>prepare_funding</code>
                    <i aria-hidden="true" />
                    <code>fund</code>
                  </div>
                  <p>Stabilize workflow storage, transfer the exact bounty, and arm settlement.</p>
                </li>
                <li className="protocol-flow__terminal">
                  <header>
                    <span>04</span>
                    <div><strong>Settle</strong><small>Rialo runtime</small></div>
                  </header>
                  <div className="protocol-flow__commands mono">
                    <code>native_heartbeat</code>
                  </div>
                  <div className="protocol-flow__outcomes">
                    <span data-outcome="paid"><b>PR MERGED</b><code>paid = true</code></span>
                    <span data-outcome="refunded"><b>DEADLINE</b><code>refunded = true</code></span>
                  </div>
                </li>
              </ol>
              </div>
            </ScrollReveal>
          </section>

          <section id="roles">
            <span className="docs-index">02 / Roles</span>
            <ScrollReveal className="docs-section-reveal" delay={40}>
              <div>
              <h2>Account roles</h2>
              <dl className="role-list">
                <div><dt>Sponsor</dt><dd>Publishes the terms, approves the exact contributor claim, funds escrow, and retains immediate check and refund fallbacks.</dd></div>
                <div><dt>Contributor claim PDA</dt><dd>Records the contributor wallet, canonical GitHub login, numeric user ID, and the sponsor-owned bounty it targets.</dd></div>
                <div><dt>Workflow PDA</dt><dd>Persists immutable bounty terms, approved beneficiary, escrow amount, timers, and terminal flags.</dd></div>
                <div><dt>Rialo runtime</dt><dd>Re-arms the native heartbeat, queries GitHub through REX, and delivers validator reports to the callback.</dd></div>
                <div><dt>Beneficiary</dt><dd>Receives only the committed escrow after a unanimous merged proof and exact account match.</dd></div>
              </dl>
              </div>
            </ScrollReveal>
          </section>

          <section id="signal">
            <span className="docs-index">03 / Signal</span>
            <ScrollReveal className="docs-section-reveal" delay={40}>
              <div>
              <h2>GitHub signal</h2>
              <p>MergePay constructs a fixed public URL from the committed owner, repository, and pull-request number. The compact merged-check endpoint avoids the REX response-size failure observed with the full pull-request representation.</p>
              <pre><code>GET https://api.github.com/repos/&#123;owner&#125;/&#123;repo&#125;/pulls/&#123;number&#125;/merge</code></pre>
              <div className="signal-grid signal-grid--three">
                <div><strong>204</strong><span>Every validator agrees the PR merged; payout is eligible.</span></div>
                <div><strong>404</strong><span>The PR is open, missing, or inaccessible; escrow stays locked.</span></div>
                <div><strong>ERROR</strong><span>Empty, mixed, or malformed reports fail closed and retry later.</span></div>
              </div>
              </div>
            </ScrollReveal>
          </section>

          <section id="trust">
            <span className="docs-index">04 / Trust</span>
            <ScrollReveal className="docs-section-reveal" delay={40}>
              <div>
              <h2>Settlement &amp; limits</h2>
              <p>The native heartbeat owns both terminal paths. A unanimous merged proof pays the contributor; reaching the immutable deadline first refunds the sponsor. Terminal flags and exact-amount accounting prevent a second release when a manual fallback races an automatic callback. Each terminal workflow exposes a shareable receipt containing the exact amount, destination, reserve, and decoded success flag.</p>

              <div className="docs-proof-grid">
                <div><span>MERGED PR</span><strong>Automatic payout</strong><small>Runtime-proven on DevNet</small></div>
                <div><span>DEADLINE</span><strong>Automatic refund</strong><small>Runtime-proven on DevNet</small></div>
                <div><span>FALLBACK RACE</span><strong>Idempotent</strong><small>No double escrow release</small></div>
              </div>

              <div className="docs-auth-note">
                <span>AUTH BOUNDARY</span>
                <p>GitHub OAuth verifies contributor identity. Public merge settlement uses fixed non-secret headers and requires no GitHub App installation token or private key.</p>
              </div>

              <p>MergePay remains an unaudited DevNet MVP. It trusts the tested Rialo runtime, REX validators, and GitHub’s public merge endpoint. Its current product boundary is intentionally narrow:</p>
              <ul className="limit-list">
                <li>DevNet and test RLO only</li>
                <li>Public GitHub repositories only</li>
                <li>One PR and beneficiary per workflow</li>
                <li>Native RLO escrow only</li>
                <li>Workflow rent remains after settlement</li>
                <li>Embedded wallet is reviewer-only</li>
              </ul>
              </div>
            </ScrollReveal>
          </section>
        </div>
      </div>
    </main>
  );
}
