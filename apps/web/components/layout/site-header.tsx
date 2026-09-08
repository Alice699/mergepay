"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { Menu, Plus, X } from "lucide-react";
import { BrandMark } from "@/components/ui/brand-mark";
import { WalletControl } from "@/components/wallet/wallet-control";
import { useNetwork } from "@/hooks/use-network";
import { routes } from "@/lib/constants";

const navigation = [
  { href: routes.bounties, label: "Bounties" },
  { href: routes.activity, label: "Activity" },
  { href: routes.guide, label: "Guide" },
  { href: routes.docs, label: "Docs" },
];

export function SiteHeader() {
  const pathname = usePathname();
  const network = useNetwork();
  const [menuOpen, setMenuOpen] = useState(false);

  function isCurrent(href: string) {
    return href === routes.bounties
      ? pathname === href || pathname.startsWith(`${href}/`)
      : pathname === href;
  }

  return (
    <>
      <a className="skip-link" href="#main-content">Skip to content</a>
      <header className={pathname === routes.home ? "site-header site-header--home" : "site-header"}>
        <div className="site-header__inner">
          <Link className="brand" href={routes.home} aria-label="MergePay home">
            <BrandMark />
            <span className="brand__network">DEVNET</span>
          </Link>
          <nav className="site-nav" aria-label="Primary navigation">
            {navigation.map((item) => (
              <Link
                aria-current={isCurrent(item.href) ? "page" : undefined}
                className={isCurrent(item.href) ? "is-current" : undefined}
                href={item.href}
                key={item.href}
              >
                {item.label}
              </Link>
            ))}
          </nav>
          <div className="site-header__actions">
            <span
              aria-label={`${network.label} RPC ${network.rpcStatus === "available" ? "ready" : network.rpcStatus}`}
              aria-live="polite"
              className="network-pill"
              data-state={network.rpcStatus}
              title={network.rpcError?.message ?? network.rpcUrl}
            >
              <i aria-hidden="true" />
              <span>{network.label.replace("Rialo ", "")}</span>
              <b>{network.rpcStatus === "available" ? "ready" : network.rpcStatus === "unavailable" ? "issue" : "checking"}</b>
            </span>
            <WalletControl />
            <Link className="nav-cta" href={routes.createBounty}>
              <span>New bounty</span>
              <Plus aria-hidden="true" className="ui-icon" size={15} strokeWidth={2} />
            </Link>
            <button
              aria-controls="mobile-navigation"
              aria-expanded={menuOpen}
              aria-label={menuOpen ? "Close navigation" : "Open navigation"}
              className="menu-toggle"
              onClick={() => setMenuOpen((open) => !open)}
              type="button"
            >
              {menuOpen ? <X aria-hidden="true" size={18} /> : <Menu aria-hidden="true" size={18} />}
            </button>
          </div>
        </div>
        <nav
          aria-label="Mobile navigation"
          className="mobile-nav"
          data-open={menuOpen}
          id="mobile-navigation"
        >
          <div>
            {navigation.map((item, index) => (
              <Link
                aria-current={isCurrent(item.href) ? "page" : undefined}
                href={item.href}
                key={item.href}
                onClick={() => setMenuOpen(false)}
              >
                <span className="mono">0{index + 1}</span>
                {item.label}
              </Link>
            ))}
            <Link className="mobile-nav__cta" href={routes.createBounty} onClick={() => setMenuOpen(false)}>
              Create a bounty <Plus aria-hidden="true" className="ui-icon" size={16} strokeWidth={2} />
            </Link>
          </div>
        </nav>
      </header>
    </>
  );
}
