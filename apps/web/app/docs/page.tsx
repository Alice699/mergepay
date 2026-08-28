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
          <section id="flow"><span className="docs-index">01</span><div><h2>Execution flow</h2><p>A sponsor creates a workflow PDA, funds it with the exact bounty, then requests a one-shot merge check. Rialo REX calls GitHub and delivers its report to the subscribed callback.</p><div className="code-flow mono"><span>create_bounty</span><i aria-hidden="true" className="code-flow__connector" /><span>fund</span><i aria-hidden="true" className="code-flow__connector" /><span>check_merge</span><i aria-hidden="true" className="code-flow__connector" /><span>callback</span></div></div></section>
          <section id="roles"><span className="docs-index">02</span><div><h2>Account roles</h2><dl className="role-list"><div><dt>Sponsor</dt><dd>Creates, funds, starts checks, and refunds after expiry.</dd></div><div><dt>Workflow PDA</dt><dd>Persists immutable terms and holds rent plus escrow.</dd></div><div><dt>Beneficiary</dt><dd>Receives payout without signing the callback.</dd></div><div><dt>Rialo REX</dt><dd>Produces the validator report consumed by the handler.</dd></div></dl></div></section>
          <section id="signal"><span className="docs-index">03</span><div><h2>GitHub signal</h2><p>MergePay uses GitHub’s compact merged-check endpoint because the full pull-request representation exceeded the observed REX response-size limit.</p><pre><code>GET /repos/&#123;owner&#125;/&#123;repo&#125;/pulls/&#123;number&#125;/merge</code></pre><div className="signal-grid"><div><strong>204</strong><span>Merged · eligible to pay</span></div><div><strong>404</strong><span>Not merged · funds stay locked</span></div></div></div></section>
          <section id="trust"><span className="docs-index">04</span><div><h2>Trust & limits</h2><p>MergePay is a DevNet MVP, not audited production software. It trusts Rialo DevNet, the tested REX runtime, and GitHub’s public merge endpoint. Any empty, mixed, malformed, or failed report leaves escrow locked.</p><ul className="limit-list"><li>Native RLO escrow only</li><li>Public GitHub repositories only</li><li>Manual merge-check initiation</li><li>Workflow rent remains after settlement</li></ul></div></section>
        </div>
      </div>
    </main>
  );
}
