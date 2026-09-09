import type { Metadata } from "next";
import { CopyValue } from "@/components/ui/copy-value";
import { marketplaceDeployment } from "@/lib/deployment";

export const metadata: Metadata = {
  title: "Docs",
  description: "MergePay protocol flow, account roles, GitHub proof, and settlement guarantees.",
};

export default function DocsPage() {
  return (
    <main className="page-main page-width docs-page">
      <div className="page-hero">
        <div>
          <p className="eyebrow">Protocol guide</p>
          <h1>Small surface.<br />Clear trust.</h1>
          <p>Follow the exact path from a verified GitHub claim to native Rialo payout or deadline refund.</p>
        </div>
        <div className="docs-program">
          <span>ACTIVE DEVNET PROGRAM</span>
          <CopyValue value={marketplaceDeployment.programId} />
          <small>Autonomous payout and refund · runtime-proven</small>
        </div>
      </div>

      <div className="docs-layout">
        <aside aria-label="Documentation sections" className="docs-nav">
          <p>ON THIS PAGE</p>
          <a href="#flow">Execution flow</a>
          <a href="#roles">Account roles</a>
          <a href="#signal">GitHub signal</a>
          <a href="#trust">Settlement &amp; limits</a>
        </aside>

        <div className="docs-content">
          <section id="flow">
            <span className="docs-index">01</span>
            <div>
              <h2>Execution flow</h2>
              <p>A sponsor publishes an open workflow PDA. The contributor authenticates with GitHub, the server matches the numeric user ID to the exact public PR author, and the contributor signs a separate claim PDA. The sponsor approves that immutable claim before atomic preparation and funding lock the exact RLO escrow.</p>
              <p>Funding arms a native Rialo heartbeat. It rechecks the deadline, polls GitHub through REX, and completes payout or refund without another sponsor click. The workflow page keeps reading the decoded account while settlement is active and announces the confirmed terminal state without requiring a manual refresh.</p>
              <div aria-label="MergePay instruction sequence" className="code-flow mono">
                <span>create_bounty</span>
                <i aria-hidden="true" className="code-flow__connector" />
                <span>verify_identity</span>
                <i aria-hidden="true" className="code-flow__connector" />
                <span>request_claim</span>
                <i aria-hidden="true" className="code-flow__connector" />
                <span>accept_claim</span>
                <i aria-hidden="true" className="code-flow__connector" />
                <span>prepare + fund</span>
                <i aria-hidden="true" className="code-flow__connector" />
                <span>native heartbeat</span>
                <i aria-hidden="true" className="code-flow__connector" />
                <span>settlement callback</span>
              </div>
            </div>
          </section>

          <section id="roles">
            <span className="docs-index">02</span>
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
          </section>

          <section id="signal">
            <span className="docs-index">03</span>
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
          </section>

          <section id="trust">
            <span className="docs-index">04</span>
            <div>
              <h2>Settlement &amp; limits</h2>
              <p>The native heartbeat owns both terminal paths. A unanimous merged proof pays the contributor; reaching the immutable deadline first refunds the sponsor. Terminal flags and exact-amount accounting prevent a second release when a manual fallback races an automatic callback.</p>

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
          </section>
        </div>
      </div>
    </main>
  );
}
