import type { Metadata } from "next";
import { ScrollReveal } from "@/components/motion/scroll-reveal";
import { CopyValue } from "@/components/ui/copy-value";
import { marketplaceDeployment } from "@/lib/deployment";

export const metadata: Metadata = {
  title: "Docs",
  description: "MergePay execution flow, account roles, GitHub proof, deadline rules, and trust boundaries.",
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
          <p>Follow GitHub identity verification, sponsor-approved escrow funding, policy-checked payout, and deadline refund.</p>
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
              <strong>Proof-backed</strong>
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
              <p>The sponsor selects Verify target before creating a workflow PDA, locking the public PR head SHA, target branch, reward, deadline, and optional CI or approval requirements. The contributor authenticates with GitHub; Verify PR matches the numeric user ID to the public PR author before the contributor signs a separate claim PDA. The sponsor page discovers confirmed claims and shows the identity, wallet, exact terms, claim account, and source transaction. Multiple matches require an explicit choice. The app re-fetches the author ID before sponsor approval locks the beneficiary.</p>
              <p>Approval and funding are separate transactions. Funding submits prepare_funding and fund together in one atomic transaction: storage is prepared before the exact reward is transferred. Funding then arms the native Rialo heartbeat. Claim, approval, preparation, and funding must all occur before the immutable deadline.</p>
              <p>The native workflow rechecks the deadline and requests GitHub proof through REX without another sponsor click. Payout requires the locked policy to pass and the proof callback to execute before the deadline. Otherwise, an unpaid funded workflow follows the deadline refund branch. The detail page polls decoded state while visible and reconciles on return; browser visibility affects display updates, not native execution.</p>
              <ol aria-label="MergePay execution phases" className="protocol-flow">
                <li>
                  <header>
                    <span>01</span>
                    <div><strong>Publish</strong><small>Sponsor</small></div>
                  </header>
                  <div className="protocol-flow__commands mono">
                    <code>create_bounty</code>
                  </div>
                  <p>Commit the public PR, head SHA, target branch, CI and review policy, exact reward, deadline, and open beneficiary state.</p>
                </li>
                <li>
                  <header>
                    <span>02</span>
                    <div><strong>Authorize</strong><small>Contributor + sponsor</small></div>
                  </header>
                  <div className="protocol-flow__commands mono">
                    <code>request_claim</code>
                    <i aria-hidden="true" />
                    <code>accept_claim</code>
                  </div>
                  <p>GitHub OAuth and Verify PR are offchain application steps. request_claim records the proposal; accept_claim locks the beneficiary after the sponsor app rechecks the PR author.</p>
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
                  <p>Prepare storage and transfer the exact bounty in one atomic funding transaction, then arm native settlement.</p>
                </li>
                <li className="protocol-flow__terminal">
                  <header>
                    <span>04</span>
                    <div><strong>Settle</strong><small>Rialo runtime</small></div>
                  </header>
                  <div className="protocol-flow__commands mono">
                    <code>run_merge_check</code>
                    <i aria-hidden="true" />
                    <code>handle_merge_response</code>
                  </div>
                  <p>Native timers run the deadline check and request proof. The REX callback validates the report, policy, and accounts before any payout.</p>
                  <div className="protocol-flow__outcomes">
                    <span data-outcome="paid"><b>VALID PROOF · BEFORE DEADLINE</b><code>paid = true</code></span>
                    <span data-outcome="refunded"><b>DEADLINE · NO PAYOUT</b><code>refunded = true</code></span>
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
                <div><dt>Sponsor</dt><dd>Publishes the locked terms, reviews and approves a contributor claim, and funds escrow. May request a check while active before expiry, or request refund after the deadline.</dd></div>
                <div><dt>Contributor claim PDA</dt><dd>Records the claimant wallet, declared GitHub login and numeric user ID, and the bounty it targets. The web app verifies the author ID before the sponsor approves the proposal.</dd></div>
                <div><dt>Workflow PDA</dt><dd>Persists immutable PR revision and policy, reward, deadline, approved beneficiary, timers, observed proof, and terminal flags.</dd></div>
                <div><dt>Rialo runtime</dt><dd>Re-arms the native heartbeat, queries GitHub through REX, and delivers validator reports to the callback.</dd></div>
                <div><dt>Beneficiary</dt><dd>Receives the exact committed reward only after a policy-passing proof, matching accounts, and a valid callback before the deadline.</dd></div>
              </dl>
              </div>
            </ScrollReveal>
          </section>

          <section id="signal">
            <span className="docs-index">03 / Signal</span>
            <ScrollReveal className="docs-section-reveal" delay={40}>
              <div>
              <h2>GitHub signal</h2>
              <p>The custom REX WASM verifier first reads the public PR and compares its head SHA and target branch with the locked terms. It reads CI or review endpoints only after the PR is merged and only when the corresponding policy is enabled. The callback requires all outputs in the received REX report to be usable and identical; this is a check of that report, not a claim that the app independently queried every validator in the network.</p>
              <pre><code>GET /repos/&#123;owner&#125;/&#123;repo&#125;/pulls/&#123;number&#125;<br />GET /repos/&#123;owner&#125;/&#123;repo&#125;/commits/&#123;headSha&#125;/status<br />GET /repos/&#123;owner&#125;/&#123;repo&#125;/commits/&#123;headSha&#125;/check-runs?filter=latest&amp;per_page=100<br />GET /repos/&#123;owner&#125;/&#123;repo&#125;/pulls/&#123;number&#125;/reviews?per_page=100</code></pre>
              <p><strong>CI policy.</strong> At least one status or check run must exist. Existing commit statuses must report success; latest check runs must be completed with a success, neutral, or skipped conclusion. Pending or failed signals do not pass. A response requiring check-run pagination is inconclusive.</p>
              <p><strong>Review policy.</strong> The verifier uses the latest decisive review per numeric reviewer ID. An approval counts only when its state is APPROVED, its commit matches the locked SHA, and GitHub reports OWNER, MEMBER, or COLLABORATOR association. COMMENTED and PENDING reviews do not count. This association check is not a separate live repository-permission lookup. Review responses requiring another page are inconclusive.</p>
              <p>The compact MP1 proof carries the status code, observed head SHA, merge commit, CI result, approval count, and target branch. The callback rejects oversized proofs and rechecks the fields against the workflow before moving funds.</p>
              <div className="signal-grid signal-grid--three">
                <div><strong>MP1 / 6</strong><span>The received report agrees on a policy-passing proof. Payout still requires valid accounts and a callback before the deadline.</span></div>
                <div><strong>MP1 / 1–5</strong><span>Unmerged PR (1), head mismatch (2), branch mismatch (3), unmet CI (4), or too few approvals (5). No payout is authorized.</span></div>
                <div><strong>INCONCLUSIVE</strong><span>Empty, inconsistent, oversized, malformed, or pagination-limited results cannot authorize payout. Native checks continue until the deadline.</span></div>
              </div>
              </div>
            </ScrollReveal>
          </section>

          <section id="trust">
            <span className="docs-index">04 / Trust</span>
            <ScrollReveal className="docs-section-reveal" delay={40}>
              <div>
              <h2>Settlement &amp; limits</h2>
              <p>The native heartbeat owns both terminal paths. Payout requires matching head SHA and branch, a valid merge commit, any selected CI and approval requirements, and a usable, consistent REX report processed before the deadline. Once a funded workflow reaches its deadline without payout, run_merge_check executes the sponsor refund branch. Paid and refunded are mutually exclusive outcomes; terminal guards prevent a second escrow release.</p>

              <div className="docs-auth-note">
                <span>DEADLINE RULE</span>
                <p>The deadline is an absolute time fixed by create_bounty; funding does not restart the deadline. The form interprets the date in the browser&apos;s local time zone and stores Unix milliseconds onchain. A proof callback at or after the deadline cannot pay, even if GitHub recorded the merge earlier. Leave time for claim, approval, funding, CI, and REX processing, not just the merge itself.</p>
              </div>

              <p><strong>Timing and display.</strong> The current native heartbeat re-arms after about two seconds and requests proof on a five-second schedule, with a five-second REX collection window. These are scheduling settings, not a guaranteed merge-to-payout time. The UI reads state independently; a slow RPC or decoder error does not stop native settlement.</p>
              <p><strong>Manual fallbacks.</strong> check_merge schedules a fresh proof check only for an active funded workflow before expiry. It is rejected after the deadline or a terminal outcome. Sponsor refund is available after expiry; repeating it on an already-refunded workflow returns without another transfer. These controls do not bypass policy. Each terminal workflow exposes a shareable receipt with the reward, destination, remaining account balance, and decoded outcome.</p>

              <div className="docs-proof-grid">
                <div><span>POLICY PASSES</span><strong>Automatic payout</strong><small>Valid callback before deadline</small></div>
                <div><span>DEADLINE · UNPAID</span><strong>Automatic refund</strong><small>Funded escrow returns to sponsor</small></div>
                <div><span>TERMINAL GUARDS</span><strong>No double release</strong><small>Already-refunded retries do not transfer again</small></div>
              </div>

              <div className="docs-auth-note">
                <span>AUTH BOUNDARY</span>
                <p>GitHub OAuth verifies contributor identity when the claim is created. MergePay then issues a five-minute, one-time authorization bound to the OAuth session, numeric GitHub ID, receiving wallet, exact PR, and derived claim account. A session, wallet, or target change requires fresh verification. Sponsor review re-fetches the public PR and compares the stable numeric author ID again, failing closed if GitHub is unavailable or disagrees. These OAuth checks are application gates; the onchain program independently enforces sponsor authority, account ownership, exact terms, and the beneficiary lock. Public merge settlement uses fixed non-secret headers and requires no GitHub App installation token or private key.</p>
              </div>

              <p>MergePay remains an unaudited DevNet MVP. It trusts the tested Rialo runtime, REX validators, and GitHub&apos;s public REST responses. Its current product boundary is intentionally narrow:</p>
              <ul className="limit-list">
                <li>DevNet and test RLO only</li>
                <li>Public GitHub repositories only</li>
                <li>One PR and beneficiary per workflow</li>
                <li>Native RLO escrow only</li>
                <li>Settlement does not close the workflow or return its remaining storage balance</li>
                <li>Transaction and storage costs are separate from the bounty principal</li>
                <li>Embedded wallet is browser-local and limited to DevNet</li>
                <li>GitHub polling and REX execution are asynchronous; no instant-settlement guarantee</li>
                <li>CI and reviews are payment conditions, not a guarantee of code quality or security</li>
                <li>Live sponsor-side author review is enforced by the web app, not a new REX assertion in the approval instruction</li>
              </ul>
              </div>
            </ScrollReveal>
          </section>
        </div>
      </div>
    </main>
  );
}
