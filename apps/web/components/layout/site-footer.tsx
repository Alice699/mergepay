import Link from "next/link";
import { BookOpen, GitPullRequest, Scale } from "lucide-react";
import { BrandMark } from "@/components/ui/brand-mark";
import { devnetDeployment } from "@/lib/deployment";

export function SiteFooter() {
  const testedProgramId = devnetDeployment.reviewCandidate.programId;
  const hardenedProgramId = devnetDeployment.hardenedArtifact.programId;

  return (
    <footer className="site-footer">
      <div className="site-footer__inner">
        <div className="site-footer__top">
          <div className="footer-brand">
            <Link className="brand brand--footer" href="/" aria-label="MergePay home">
              <BrandMark />
            </Link>
            <p>When the code lands,<br />the value moves.</p>
            <span className="footer-status"><i /> Built for Rialo DevNet</span>
          </div>

          <nav className="footer-nav" aria-label="Product links">
            <p>Product</p>
            <Link href="/bounties">Bounties</Link>
            <Link href="/bounties/new">Create bounty</Link>
            <Link href="/activity">Verified activity</Link>
          </nav>

          <nav className="footer-nav" aria-label="Protocol links">
            <p>Protocol</p>
            <Link href="/docs">How it works</Link>
            <a href="https://rialo.io/for-devs" rel="noreferrer" target="_blank">Rialo developers <BookOpen aria-hidden="true" className="ui-icon" size={13} /><span className="sr-only"> (opens in a new tab)</span></a>
            <a href="https://docs.github.com/en/rest/pulls/pulls#check-if-a-pull-request-has-been-merged" rel="noreferrer" target="_blank">GitHub signal <GitPullRequest aria-hidden="true" className="ui-icon" size={13} /><span className="sr-only"> (opens in a new tab)</span></a>
          </nav>

          <div className="footer-deployment">
            <p>Deployment handoff</p>
            <div className="footer-deployment__status"><span>{hardenedProgramId ? "Hardened deployed · runtime-proven" : "Pre-hardening candidate"}</span><strong>Proven</strong></div>
            <div className="footer-deployment__program">
              <span className="mono">{(hardenedProgramId ?? testedProgramId).slice(0, 12)}…{(hardenedProgramId ?? testedProgramId).slice(-10)}</span>
              <span>{hardenedProgramId ? "Fresh runtime proof is recorded on Activity; this is the current review candidate." : "Full address is available on the Activity page."}</span>
            </div>
          </div>
        </div>

        <div className="site-footer__bottom">
          <span>© {new Date().getFullYear()} MergePay</span>
          <span>DevNet only · Unaudited software · No production funds</span>
          <Link href="/docs#trust">Trust & limitations <Scale aria-hidden="true" className="ui-icon" size={13} /></Link>
        </div>
      </div>
    </footer>
  );
}
