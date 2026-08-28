import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";

const webRoot = new URL("../", import.meta.url);

const requiredPaths = [
  "app/layout.tsx",
  "app/page.tsx",
  "app/bounties/page.tsx",
  "app/bounties/new/page.tsx",
  "app/bounties/[slug]/page.tsx",
  "app/activity/page.tsx",
  "app/docs/page.tsx",
  "components/ui/brand-mark.tsx",
  "components/feedback/route-placeholder.tsx",
  "components/motion/route-transition.tsx",
  "components/motion/scroll-reveal.tsx",
  "features/create-bounty/components/create-bounty-form.tsx",
  "features/create-bounty/schema.ts",
  "features/create-bounty/use-create-bounty.ts",
  "features/fund-bounty/README.md",
  "features/check-merge/README.md",
  "features/refund-bounty/README.md",
  "features/workflow-status/README.md",
  "providers/index.tsx",
  "hooks/use-wallet.ts",
  "hooks/use-transaction.ts",
  "hooks/use-workflow.ts",
  "lib/config.ts",
  "lib/constants.ts",
  "lib/errors.ts",
  "lib/format.ts",
  "lib/validation.ts",
  "public/favicon.svg",
  ".openai/hosting.json",
  "vite.config.ts",
];

test("preserves the MergePay web architecture", async () => {
  await Promise.all(requiredPaths.map((path) => access(new URL(path, webRoot))));
  assert.equal(new Set(requiredPaths).size, requiredPaths.length);
});

test("ships product routes instead of route placeholders", async () => {
  const productRoutes = [
    "app/page.tsx",
    "app/activity/page.tsx",
    "app/bounties/page.tsx",
    "app/bounties/new/page.tsx",
    "app/bounties/[slug]/page.tsx",
    "app/docs/page.tsx",
  ];

  const sources = await Promise.all(
    productRoutes.map((path) => readFile(new URL(path, webRoot), "utf8")),
  );

  for (const source of sources) {
    assert.doesNotMatch(source, /RoutePlaceholder/);
    assert.match(source, /<main/);
  }
});

test("keeps the polished application shell and local typography", async () => {
  const layout = await readFile(new URL("app/layout.tsx", webRoot), "utf8");
  const header = await readFile(
    new URL("components/layout/site-header.tsx", webRoot),
    "utf8",
  );
  const footer = await readFile(
    new URL("components/layout/site-footer.tsx", webRoot),
    "utf8",
  );

  assert.match(layout, /@fontsource-variable\/sora/);
  assert.match(layout, /@fontsource-variable\/bricolage-grotesque/);
  assert.match(layout, /@fontsource\/ibm-plex-mono/);
  assert.match(layout, /RouteTransition/);
  assert.match(layout, /favicon\.svg/);
  assert.match(header, /BrandMark/);
  assert.match(footer, /BrandMark/);
  assert.match(header, /Mobile navigation/);
  assert.match(footer, /Deployment handoff/);

  const favicon = await readFile(
    new URL("public/favicon.svg", webRoot),
    "utf8",
  );
  assert.match(favicon, /MergePay/);
  assert.match(favicon, /data-mark="wordmark-fragment"/);
  assert.match(favicon, /#A9DDD3/i);
  assert.match(favicon, /#102A27/i);
  assert.doesNotMatch(favicon, /<(?:rect|circle|polygon)\b/i);
});

test("uses semantic symbols without directional arrow UI", async () => {
  const iconizedSources = [
    "app/page.tsx",
    "app/activity/page.tsx",
    "app/bounties/page.tsx",
    "app/docs/page.tsx",
    "components/bounty/workflow-lifecycle.tsx",
    "components/bounty/workflow-lookup.tsx",
    "components/layout/site-footer.tsx",
    "components/layout/site-header.tsx",
    "components/ui/copy-value.tsx",
    "components/wallet/wallet-control.tsx",
    "features/create-bounty/components/create-bounty-form.tsx",
  ];

  const sources = await Promise.all(
    iconizedSources.map((path) => readFile(new URL(path, webRoot), "utf8")),
  );

  for (const source of sources) {
    assert.doesNotMatch(
      source,
      /ActionIcon|ArrowRight|ArrowUpRight|ExternalLink|GitPullRequestArrow|ShieldCheck/,
    );
    assert.doesNotMatch(source, /[↗→➜➝➞➟➠➡⟶⟹⇢⭢⮕➤]/u);
  }

  const brandMark = await readFile(
    new URL("components/ui/brand-mark.tsx", webRoot),
    "utf8",
  );
  assert.match(brandMark, /brand-mark__terminal/);
  assert.doesNotMatch(brandMark, /lucide-react|<svg/u);

  const styles = await readFile(new URL("app/globals.css", webRoot), "utf8");
  assert.doesNotMatch(styles, /lifecycle__arrow|proof-stamp/);
  assert.doesNotMatch(styles, /button--compact/);
  assert.match(styles, /evidence-summary/);
  assert.match(styles, /lookup__submit-mark/);
  assert.match(styles, /prefers-reduced-motion/);
});

test("keeps brand color separate from semantic state colors", async () => {
  const styles = await readFile(new URL("app/globals.css", webRoot), "utf8");

  assert.match(styles, /--accent: #a9ddd3/);
  assert.match(styles, /--success: oklch\(0\.76 0\.13 155\)/);
  assert.match(styles, /--warning: oklch\(0\.80 0\.14 78\)/);
  assert.match(styles, /--danger: oklch\(0\.70 0\.19 22\)/);
  assert.doesNotMatch(
    styles,
    /--lime|#d7ff67|215, 255, 103|oklch\(0\.72 0\.155 42\)/i,
  );
});
