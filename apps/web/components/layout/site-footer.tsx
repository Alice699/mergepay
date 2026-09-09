import Link from "next/link";
import { BookOpen, GitPullRequest, Scale } from "lucide-react";
import { BrandMark } from "@/components/ui/brand-mark";
import { devnetDeployment } from "@/lib/deployment";

export function SiteFooter() {
  const marketplaceProgramId = devnetDeployment.marketplaceArtifact.programId;

  return (
    <footer className="site-footer">
      <div className="site-footer__inner">
        <div className="site-footer__top">
          <div className="footer-brand">
            <Link
              className="brand brand--footer"
              href="/"
              aria-label="MergePay home"
            >
              <BrandMark />
            </Link>
            <p className="footer-brand__statement">
              Bounties for public code.
              <span>Settlement you can inspect.</span>
            </p>
            <p className="footer-brand__description">
              Fund pull requests and settle contributors through verifiable
              Rialo state.
            </p>
          </div>

          <div className="footer-directory">
            <nav className="footer-nav" aria-label="Product links">
              <p>Product</p>
              <Link href="/bounties">Bounties</Link>
              <Link href="/bounties/new">Create bounty</Link>
              <Link href="/activity">Verified activity</Link>
              <Link href="/settlements">Paid &amp; refunded</Link>
            </nav>

            <nav className="footer-nav" aria-label="Protocol links">
              <p>Protocol</p>
              <Link href="/guide">Using MergePay</Link>
              <Link href="/docs">How it works</Link>
              <a
                href="https://rialo.io/for-devs"
                rel="noreferrer"
                target="_blank"
              >
                Rialo developers
                <BookOpen
                  aria-hidden="true"
                  className="ui-icon"
                  size={13}
                />
                <span className="sr-only"> (opens in a new tab)</span>
              </a>
              <a
                href="https://docs.github.com/en/rest/pulls/pulls#check-if-a-pull-request-has-been-merged"
                rel="noreferrer"
                target="_blank"
              >
                GitHub merge signal
                <GitPullRequest
                  aria-hidden="true"
                  className="ui-icon"
                  size={13}
                />
                <span className="sr-only"> (opens in a new tab)</span>
              </a>
            </nav>
          </div>

          <div className="footer-deployment">
            <div className="footer-deployment__heading">
              <div>
                <p>Live deployment</p>
                <strong>Rialo DevNet</strong>
              </div>
              <span className="footer-status">
                <i /> Verified
              </span>
            </div>
            <div className="footer-deployment__program">
              <span>Marketplace program</span>
              <code className="mono">
                {marketplaceProgramId.slice(0, 12)}…
                {marketplaceProgramId.slice(-10)}
              </code>
              <p>Claim, payout, and refund paths verified end to end.</p>
            </div>
            <Link className="footer-deployment__link" href="/activity">
              Inspect verified activity
            </Link>
          </div>
        </div>

        <div className="site-footer__bottom">
          <span>© {new Date().getFullYear()} MergePay</span>
          <div className="footer-legal" aria-label="Environment limitations">
            <span>DevNet only</span>
            <span>Unaudited software</span>
            <span>No production funds</span>
          </div>
          <Link href="/docs#trust">
            Trust &amp; limitations
            <Scale aria-hidden="true" className="ui-icon" size={13} />
          </Link>
        </div>
      </div>
    </footer>
  );
}
