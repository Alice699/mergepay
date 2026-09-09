import type { Metadata } from "next";
import { CopyValue } from "@/components/ui/copy-value";
import { devnetDeployment } from "@/lib/deployment";

export const metadata: Metadata = { title: "Docs" };

export default function DocsPage() {
  return (
    <main className="page-main page-width docs-page">
      <div className="page-hero"><div><p className="eyebrow">Protocol guide</p><h1>Small surface.<br />Clear trust.</h1><p>MergePay combines a program-owned escrow account with validator-attested GitHub HTTP results.</p></div><div className="docs-program"><span>TESTED PROGRAM</span><CopyValue value={devnetDeployment.reviewCandidate.programId} /></div></div>
      <div className="docs-layout">
        <aside className="docs-nav"><p>ON THIS PAGE</p><a href="#flow">Execution flow</a><a href="#roles">Account roles</a><a href="#signal">GitHub signal</a><a href="#trust">Trust & limits</a></aside>
        <div className="docs-content">
          <section id="flow"><span className="docs-index">01</span><div><h2>Execution flow</h2><p>A sponsor creates an open workflow PDA. The contributor connects GitHub, the server matches the authenticated user ID to the exact public PR author, and the contributor signs a separate claim PDA. The sponsor approves the exact claim before funding. Funding arms a native Rialo settlement heartbeat: it polls GitHub automatically and checks the immutable deadline on every pass, so payout or refund can complete without another sponsor click.</p><div className="code-flow mono"><span>create_bounty</span><i aria-hidden="true" className="code-flow__connector" /><span>oauth_claim</span><i aria-hidden="true" className="code-flow__connector" /><span>request_claim</span><i aria-hidden="true" className="code-flow__connector" /><span>accept_claim</span><i aria-hidden="true" className="code-flow__connector" /><span>fund</span><i aria-hidden="true" className="code-flow__connector" /><span>native_watch</span><i aria-hidden="true" className="code-flow__connector" /><span>callback</span></div></div></section>
          <section id="roles"><span className="docs-index">02</span><div><h2>Account roles</h2><dl className="role-list"><div><dt>Sponsor</dt><dd>Publishes, approves, funds, and can request an immediate fallback check or refund.</dd></div><div><dt>Contributor claim PDA</dt><dd>Records the contributor wallet, canonical GitHub login, and numeric GitHub user ID.</dd></div><div><dt>Workflow PDA</dt><dd>Persists bounty terms, approved beneficiary, and escrow.</dd></div><div><dt>Rialo REX</dt><dd>Produces the validator report consumed by the native settlement handler.</dd></div></dl></div></section>
          <section id="signal"><span className="docs-index">03</span><div><h2>GitHub signal</h2><p>MergePay uses GitHub’s compact merged-check endpoint because the full pull-request representation exceeded the observed REX response-size limit.</p><pre><code>GET /repos/&#123;owner&#125;/&#123;repo&#125;/pulls/&#123;number&#125;/merge</code></pre><div className="signal-grid"><div><strong>204</strong><span>Merged · eligible to pay</span></div><div><strong>404</strong><span>Not merged · funds stay locked</span></div></div></div></section>
          <section id="trust"><span className="docs-index">04</span><div><h2>Trust & limits</h2><p>MergePay is a DevNet MVP, not audited production software. It trusts Rialo DevNet, the tested REX runtime, and GitHub’s public merge endpoint. Any empty, mixed, malformed, or failed report leaves escrow locked.</p><ul className="limit-list"><li>Native RLO escrow only</li><li>Public GitHub repositories only</li><li>Native watch with sponsor fallback</li><li>Workflow rent remains after settlement</li></ul></div></section>
        </div>
      </div>
    </main>
  );
}
