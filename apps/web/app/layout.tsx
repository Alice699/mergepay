import type { Metadata, Viewport } from "next";
import { headers } from "next/headers";
import type { ReactNode } from "react";
import "@fontsource-variable/bricolage-grotesque";
import "@fontsource-variable/sora";
import "@fontsource/ibm-plex-mono/latin-400.css";
import "@fontsource/ibm-plex-mono/latin-500.css";
import "@fontsource/ibm-plex-mono/latin-600.css";
import { SiteFooter } from "@/components/layout/site-footer";
import { SiteHeader } from "@/components/layout/site-header";
import { RouteTransition } from "@/components/motion/route-transition";
import { AppProviders } from "@/providers";
import "./globals.css";

const title = "MergePay — Code merged. Bounty settled.";
const description =
  "Trust-minimized GitHub pull-request bounties settled through Rialo REX.";

export async function generateMetadata(): Promise<Metadata> {
  const requestHeaders = await headers();
  const host =
    requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host");
  const protocol =
    requestHeaders.get("x-forwarded-proto") ??
    (host?.startsWith("localhost") ? "http" : "https");
  const imageUrl = host ? `${protocol}://${host}/og-mergepay-v2.png` : null;

  return {
    title: { default: title, template: "%s | MergePay" },
    description,
    icons: {
      icon: [
        {
          url: "/favicon.svg?v=robot-head-1",
          type: "image/svg+xml",
          sizes: "any",
        },
      ],
      shortcut: "/favicon.svg?v=robot-head-1",
    },
    openGraph: {
      title,
      description,
      siteName: "MergePay",
      type: "website",
      ...(imageUrl
        ? { images: [{ url: imageUrl, width: 1733, height: 907, alt: title }] }
        : {}),
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      ...(imageUrl ? { images: [imageUrl] } : {}),
    },
  };
}

export const viewport: Viewport = { colorScheme: "dark", themeColor: "#0B0B0B" };

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="en">
      <body>
        <AppProviders>
          <SiteHeader />
          <div id="main-content" tabIndex={-1}>
            <RouteTransition>{children}</RouteTransition>
          </div>
          <SiteFooter />
        </AppProviders>
      </body>
    </html>
  );
}
