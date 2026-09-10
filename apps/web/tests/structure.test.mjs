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
  "app/bounties/[slug]/receipt/page.tsx",
  "app/activity/page.tsx",
  "app/settlements/page.tsx",
  "app/guide/page.tsx",
  "app/docs/page.tsx",
  "app/api/rialo/route.ts",
  "app/api/github/pull/route.ts",
  "app/api/github/auth/start/route.ts",
  "app/api/github/auth/callback/route.ts",
  "app/api/github/auth/session/route.ts",
  "app/api/github/auth/logout/route.ts",
  "components/ui/brand-mark.tsx",
  "components/home/merge-core-scene.tsx",
  "components/feedback/route-placeholder.tsx",
  "components/feedback/transaction-notifications.tsx",
  "components/activity/wallet-activity-feed.tsx",
  "components/settlement/settlement-activity-feed.tsx",
  "components/motion/route-transition.tsx",
  "components/motion/scroll-reveal.tsx",
  "components/wallet/transaction-approval-dialog.tsx",
  "components/bounty/workflow-detail.tsx",
  "components/bounty/settlement-receipt.tsx",
  "components/bounty/open-bounty-feed.tsx",
  "features/create-bounty/components/create-bounty-form.tsx",
  "features/create-bounty/schema.ts",
  "features/create-bounty/use-create-bounty.ts",
  "features/claim-bounty/components/request-claim-action.tsx",
  "features/claim-bounty/components/accept-claim-action.tsx",
  "features/claim-bounty/use-request-claim.ts",
  "features/claim-bounty/use-accept-claim.ts",
  "features/claim-bounty/README.md",
  "features/fund-bounty/components/fund-bounty-action.tsx",
  "features/fund-bounty/use-fund-bounty.ts",
  "features/fund-bounty/README.md",
  "features/check-merge/components/check-merge-action.tsx",
  "features/check-merge/use-check-merge.ts",
  "features/check-merge/README.md",
  "features/refund-bounty/components/refund-bounty-action.tsx",
  "features/refund-bounty/use-refund-bounty.ts",
  "features/refund-bounty/README.md",
  "features/workflow-status/README.md",
  "providers/index.tsx",
  "providers/network-provider.tsx",
  "providers/network-context.ts",
  "providers/wallet-provider.tsx",
  "providers/wallet-context.ts",
  "hooks/use-wallet.ts",
  "hooks/use-network.ts",
  "hooks/use-embedded-wallet.ts",
  "hooks/use-deadline-passed.ts",
  "hooks/use-transaction.ts",
  "hooks/use-workflow.ts",
  "hooks/use-github-identity.ts",
  "lib/config.ts",
  "lib/rialo.ts",
  "lib/embedded-wallet.ts",
  "lib/constants.ts",
  "lib/errors.ts",
  "lib/app-notifications.ts",
  "lib/wallet-control-events.ts",
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
    "app/settlements/page.tsx",
    "app/guide/page.tsx",
    "app/bounties/page.tsx",
    "app/bounties/new/page.tsx",
    "app/bounties/[slug]/page.tsx",
    "app/bounties/[slug]/receipt/page.tsx",
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
  assert.match(header, /routes\.settlements/);
  assert.match(header, /network-pill/);
  assert.match(footer, /Live deployment/);
  assert.match(footer, /Inspect verified activity/);

  const favicon = await readFile(
    new URL("public/favicon.svg", webRoot),
    "utf8",
  );
  assert.match(favicon, /MergePay/);
  assert.match(favicon, /data-mark="robot-head"/);
  assert.match(favicon, /data-part="visor"/);
  assert.match(favicon, /data-part="eyes"/);
  assert.match(favicon, /#E4E4E4/i);
  assert.match(favicon, /#2B4559/i);
  assert.match(favicon, /#0B0B0B/i);
  assert.doesNotMatch(favicon, /wordmark-fragment/);
});

test("keeps the settlement robot scene purposeful, bounded, and accessible", async () => {
  const home = await readFile(new URL("app/page.tsx", webRoot), "utf8");
  const scene = await readFile(
    new URL("components/home/merge-core-scene.tsx", webRoot),
    "utf8",
  );
  const styles = await readFile(new URL("app/globals.css", webRoot), "utf8");

  assert.match(home, /MergeCoreScene/);
  assert.match(home, /home-page/);
  assert.match(home, /Onchain bounties/);
  assert.match(home, /for pull requests\./);
  assert.match(scene, /const createRobot/);
  assert.match(scene, /createRialoMarkGeometry/);
  assert.match(scene, /rialoMark\.position\.z = 0\.074/);
  assert.match(scene, /chestAssembly\.add\(rialoMark\)/);
  assert.match(scene, /robotRoot\.scale\.setScalar\(0\.9\)/);
  assert.match(scene, /const setBlink/);
  assert.match(scene, /THREE\.PCFSoftShadowMap/);
  assert.match(scene, /prefers-reduced-motion/);
  assert.match(scene, /IntersectionObserver/);
  assert.match(scene, /visibilitychange/);
  assert.match(scene, /renderer\.dispose\(\)/);
  assert.doesNotMatch(scene, /Math\.random|new THREE\.Points\(/);
  assert.match(styles, /--home-void: #0b0b0b/);
  assert.match(styles, /--home-slate: #2b4559/);
  assert.match(styles, /--home-mist: #e4e4e4/);
});

test("uses semantic symbols without directional arrow UI", async () => {
  const iconizedSources = [
    "app/page.tsx",
    "app/activity/page.tsx",
    "app/guide/page.tsx",
    "app/bounties/page.tsx",
    "app/docs/page.tsx",
    "components/bounty/workflow-lifecycle.tsx",
    "components/bounty/workflow-detail.tsx",
    "components/bounty/settlement-receipt.tsx",
    "components/bounty/workflow-lookup.tsx",
    "features/fund-bounty/components/fund-bounty-action.tsx",
    "features/check-merge/components/check-merge-action.tsx",
    "features/refund-bounty/components/refund-bounty-action.tsx",
    "components/layout/site-footer.tsx",
    "components/layout/site-header.tsx",
    "components/ui/copy-value.tsx",
    "components/wallet/wallet-control.tsx",
    "features/create-bounty/components/create-bounty-form.tsx",
    "features/claim-bounty/components/request-claim-action.tsx",
    "features/claim-bounty/components/accept-claim-action.tsx",
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
  assert.doesNotMatch(styles, /wallet-ledger|wallet-faucet/);
  assert.match(styles, /evidence-summary/);
  assert.match(styles, /lookup__submit-mark/);
  assert.match(styles, /wallet-quick-actions/);
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

test("uses the real Rialo wallet and transaction boundary", async () => {
  const packageJson = JSON.parse(
    await readFile(new URL("package.json", webRoot), "utf8"),
  );
  assert.equal(packageJson.dependencies["@rialo/frost"], "0.18.1");

  const providers = await readFile(
    new URL("providers/index.tsx", webRoot),
    "utf8",
  );
  const walletProvider = await readFile(
    new URL("providers/wallet-provider.tsx", webRoot),
    "utf8",
  );
  const networkProvider = await readFile(
    new URL("providers/network-provider.tsx", webRoot),
    "utf8",
  );
  const networkContext = await readFile(
    new URL("providers/network-context.ts", webRoot),
    "utf8",
  );
  const walletContext = await readFile(
    new URL("providers/wallet-context.ts", webRoot),
    "utf8",
  );
  const networkHook = await readFile(
    new URL("hooks/use-network.ts", webRoot),
    "utf8",
  );
  const walletHook = await readFile(
    new URL("hooks/use-wallet.ts", webRoot),
    "utf8",
  );
  const form = await readFile(
    new URL("features/create-bounty/components/create-bounty-form.tsx", webRoot),
    "utf8",
  );
  const workflowDetail = await readFile(
    new URL("components/bounty/workflow-detail.tsx", webRoot),
    "utf8",
  );
  const createHook = await readFile(
    new URL("features/create-bounty/use-create-bounty.ts", webRoot),
    "utf8",
  );
  const requestClaimHook = await readFile(
    new URL("features/claim-bounty/use-request-claim.ts", webRoot),
    "utf8",
  );
  const requestClaimAction = await readFile(
    new URL("features/claim-bounty/components/request-claim-action.tsx", webRoot),
    "utf8",
  );
  const acceptClaimHook = await readFile(
    new URL("features/claim-bounty/use-accept-claim.ts", webRoot),
    "utf8",
  );
  const acceptClaimAction = await readFile(
    new URL("features/claim-bounty/components/accept-claim-action.tsx", webRoot),
    "utf8",
  );
  assert.match(acceptClaimHook, /CLAIM_RECORD_OWNER_MISMATCH/);
  assert.match(acceptClaimHook, /not the payout wallet/);
  assert.match(acceptClaimAction, /confirmed claim-record address/);
  assert.match(acceptClaimAction, /different from the payout wallet/);
  const githubProofRoute = await readFile(
    new URL("app/api/github/pull/route.ts", webRoot),
    "utf8",
  );
  const githubAuthRoutes = await Promise.all(
    [
      "app/api/github/auth/start/route.ts",
      "app/api/github/auth/callback/route.ts",
      "app/api/github/auth/session/route.ts",
      "app/api/github/auth/logout/route.ts",
    ].map((path) => readFile(new URL(path, webRoot), "utf8")),
  );
  const githubIdentityHook = await readFile(
    new URL("hooks/use-github-identity.ts", webRoot),
    "utf8",
  );
  const fundHook = await readFile(
    new URL("features/fund-bounty/use-fund-bounty.ts", webRoot),
    "utf8",
  );
  const fundAction = await readFile(
    new URL("features/fund-bounty/components/fund-bounty-action.tsx", webRoot),
    "utf8",
  );
  const checkMergeHook = await readFile(
    new URL("features/check-merge/use-check-merge.ts", webRoot),
    "utf8",
  );
  const checkMergeAction = await readFile(
    new URL("features/check-merge/components/check-merge-action.tsx", webRoot),
    "utf8",
  );
  const refundHook = await readFile(
    new URL("features/refund-bounty/use-refund-bounty.ts", webRoot),
    "utf8",
  );
  const refundAction = await readFile(
    new URL("features/refund-bounty/components/refund-bounty-action.tsx", webRoot),
    "utf8",
  );
  const wallet = await readFile(
    new URL("components/wallet/wallet-control.tsx", webRoot),
    "utf8",
  );
  const embeddedWallet = await readFile(
    new URL("lib/embedded-wallet.ts", webRoot),
    "utf8",
  );
  const embeddedHook = await readFile(
    new URL("hooks/use-embedded-wallet.ts", webRoot),
    "utf8",
  );
  const approvalDialog = await readFile(
    new URL("components/wallet/transaction-approval-dialog.tsx", webRoot),
    "utf8",
  );
  const rpcRelay = await readFile(
    new URL("app/api/rialo/route.ts", webRoot),
    "utf8",
  );
  const config = await readFile(new URL("lib/config.ts", webRoot), "utf8");
  const bountyFeed = await readFile(
    new URL("components/bounty/open-bounty-feed.tsx", webRoot),
    "utf8",
  );
  const marketplacePage = await readFile(
    new URL("app/bounties/page.tsx", webRoot),
    "utf8",
  );
  const styles = await readFile(new URL("app/globals.css", webRoot), "utf8");
  const format = await readFile(new URL("lib/format.ts", webRoot), "utf8");

  assert.match(providers, /FrostProvider/);
  assert.doesNotMatch(providers, /from "\.\/network-provider"/);
  assert.doesNotMatch(providers, /from "\.\/wallet-provider"/);
  assert.match(networkContext, /createContext<NetworkSnapshot \| null>/);
  assert.match(walletContext, /createContext<WalletSnapshot \| null>/);
  assert.match(networkProvider, /from "@\/providers\/network-context"/);
  assert.match(walletProvider, /from "@\/providers\/wallet-context"/);
  assert.match(networkHook, /from "@\/providers\/network-context"/);
  assert.match(walletHook, /from "@\/providers\/wallet-context"/);
  assert.doesNotMatch(networkProvider, /createContext/);
  assert.doesNotMatch(walletProvider, /createContext/);
  assert.match(walletProvider, /useConnectWallet/);
  assert.match(walletProvider, /useFrostSelector/);
  assert.match(walletProvider, /useSignTransaction/);
  assert.match(walletProvider, /sendTransaction/);
  assert.match(walletProvider, /confirm\(/);
  assert.match(networkProvider, /getHealth/);
  assert.match(form, /onSubmit={handleSubmit}/);
  assert.match(form, /detailQuery/);
  assert.match(workflowDetail, /getWorkflow/);
  assert.match(workflowDetail, /Transaction confirmed/);
  assert.match(workflowDetail, /Retry account read/);
  assert.match(createHook, /buildCreateBounty/);
  assert.match(createHook, /buildTransaction/);
  assert.match(requestClaimHook, /buildRequestClaim/);
  assert.match(requestClaimHook, /submitTransaction/);
  assert.match(requestClaimHook, /getAccountInfo/);
  assert.match(requestClaimHook, /WORKFLOW_PROGRAM_MISMATCH/);
  assert.match(requestClaimAction, /Connect GitHub/);
  assert.match(requestClaimAction, /Verify PR/);
  assert.doesNotMatch(requestClaimAction, /your-github-handle|Enter the GitHub username/);
  assert.match(requestClaimAction, /Request claim/);
  assert.match(requestClaimHook, /claimantGithubId/);
  assert.match(acceptClaimHook, /buildAcceptClaim/);
  assert.match(acceptClaimHook, /submitTransaction/);
  assert.match(acceptClaimAction, /Approve claim/);
  assert.match(githubProofRoute, /api.github.com/);
  assert.match(githubProofRoute, /merged_at/);
  assert.match(githubProofRoute, /getGitHubIdentity/);
  assert.match(githubProofRoute, /authorId !== identity.id/);
  assert.match(githubIdentityHook, /api\/github\/auth\/session/);
  assert.match(githubIdentityHook, /window.location.assign/);
  assert.match(githubAuthRoutes[0], /login\/oauth\/authorize/);
  assert.match(githubAuthRoutes[1], /login\/oauth\/access_token/);
  assert.match(githubAuthRoutes[1], /api\.github\.com\/user/);
  assert.match(githubAuthRoutes[1], /createSessionCookie/);
  assert.match(githubAuthRoutes[2], /getGitHubIdentity/);
  assert.match(githubAuthRoutes[3], /clearGitHubCookies/);
  assert.match(fundHook, /getWorkflow/);
  assert.match(fundHook, /buildFund/);
  assert.match(fundHook, /submitTransaction/);
  assert.match(fundAction, /Fund escrow/);
  assert.match(fundAction, /WORKFLOW STATE|Fund bounty/);
  assert.match(checkMergeHook, /getWorkflow/);
  assert.match(checkMergeHook, /buildCheckMerge/);
  assert.match(checkMergeHook, /getWorkflowLineage/);
  assert.match(checkMergeHook, /submitTransaction/);
  assert.match(checkMergeAction, /Autonomous settlement/);
  assert.match(checkMergeAction, /Watching for merge/);
  assert.match(walletProvider, /MERGEPAY_CALLBACK_DISCRIMINANT/);
  assert.match(walletProvider, /run_merge_check timer-handler ABI/);
  assert.match(refundHook, /getWorkflow/);
  assert.match(refundHook, /buildRefund/);
  assert.match(refundHook, /submitTransaction/);
  assert.match(refundAction, /Recover escrow/);
  assert.match(refundAction, /Refund escrow/);
  assert.match(walletProvider, /useWallets/);
  assert.match(walletProvider, /requestAirdropAndConfirm/);
  assert.match(walletProvider, /TRANSACTION_PROGRAM_REJECTED/);
  assert.match(embeddedWallet, /PBKDF2_ITERATIONS = 600_000/);
  assert.match(embeddedWallet, /AES-GCM/);
  assert.match(embeddedWallet, /globalThis\.indexedDB/);
  assert.match(embeddedHook, /Keypair\.generate\(\)/);
  assert.match(embeddedHook, /transaction\.sign\(keypair\)/);
  assert.match(embeddedHook, /keypair\.dispose\(\)/);
  assert.match(approvalDialog, /Sign transaction/);
  assert.match(wallet, /Create local wallet/);
  assert.match(wallet, /Add funds/);
  assert.match(wallet, /DevNet faucet adds 1 RLO per request/);
  assert.match(wallet, /wallet-quick-actions__amount/);
  assert.match(wallet, /Wallet settings/);
  assert.match(wallet, /WalletRobotMark/);
  assert.match(wallet, /Refresh wallet balance/);
  assert.match(wallet, /Encrypted locally/);
  assert.match(wallet, /15 min auto-lock/);
  assert.match(config, /configuredRpcUrl \|\| "\/api\/rialo"/);
  assert.match(rpcRelay, /allowedMethods/);
  assert.match(rpcRelay, /getWorkflowLineage/);
  assert.match(rpcRelay, /getSignaturesForAddress/);
  assert.match(rpcRelay, /MAX_DEVNET_AIRDROP_KELVIN = 1_000_000_000/);
  assert.match(bountyFeed, /getPublicBountiesPage/);
  assert.match(bountyFeed, /no sponsor URL is required/);
  assert.match(bountyFeed, /Load older listings/);
  assert.match(bountyFeed, /Shared DevNet test bounty/);
  assert.match(bountyFeed, /legacy/);
  assert.match(bountyFeed, /visibilitychange/);
  assert.match(bountyFeed, /variant="empty"/);
  assert.match(marketplacePage, /readiness-panel--marketplace/);
  assert.match(styles, /\.content-grid--marketplace/);
  assert.match(styles, /\.readiness-panel--marketplace/);
  assert.match(format, /fractionPart\.padEnd\(9, "0"\)/);
  assert.doesNotMatch(rpcRelay, /Access-Control-Allow-Origin/i);
  assert.doesNotMatch(embeddedWallet, /localStorage/);
  assert.doesNotMatch(embeddedHook, /createMockWallet/);
  assert.doesNotMatch(form, /Transaction unavailable|Creation unavailable/);
  assert.doesNotMatch(wallet, /integration is not connected yet|not available yet/);
  assert.doesNotMatch(wallet, /wallet-ledger|LOCAL SIGNER|Fund this key/);
});

test("keeps transaction feedback and terminal workflow state live", async () => {
  const providers = await readFile(
    new URL("providers/index.tsx", webRoot),
    "utf8",
  );
  const notifications = await readFile(
    new URL("components/feedback/transaction-notifications.tsx", webRoot),
    "utf8",
  );
  const workflowDetail = await readFile(
    new URL("components/bounty/workflow-detail.tsx", webRoot),
    "utf8",
  );
  const workflowHook = await readFile(
    new URL("hooks/use-workflow.ts", webRoot),
    "utf8",
  );
  const settlementReceipt = await readFile(
    new URL("components/bounty/settlement-receipt.tsx", webRoot),
    "utf8",
  );
  const receiptPage = await readFile(
    new URL("app/bounties/[slug]/receipt/page.tsx", webRoot),
    "utf8",
  );
  const routes = await readFile(new URL("lib/constants.ts", webRoot), "utf8");
  const styles = await readFile(new URL("app/globals.css", webRoot), "utf8");

  assert.match(providers, /TransactionNotifications/);
  assert.match(notifications, /transaction\.phase/);
  assert.match(notifications, /embedded\.funding/);
  assert.match(notifications, /describeRialoError/);
  assert.match(notifications, /role=\{tone === "error" \? "alert" : "status"\}/);
  assert.match(workflowDetail, /LIVE_WORKFLOW_POLL_INTERVAL_MS/);
  assert.match(workflowDetail, /visibilitychange/);
  assert.match(workflowDetail, /publishAppNotification/);
  assert.match(workflowDetail, /Claim record address/);
  assert.match(workflowDetail, /settlementReceiptHref/);
  assert.match(workflowDetail, /View receipt/);
  assert.match(workflowHook, /state\.workflow/);
  assert.match(receiptPage, /SettlementReceipt/);
  assert.match(settlementReceipt, /getWorkflowByAddress/);
  assert.match(settlementReceipt, /deriveWorkflowPda/);
  assert.match(settlementReceipt, /state\.paid/);
  assert.match(settlementReceipt, /state\.refunded/);
  assert.match(settlementReceipt, /state\.amountKelvin/);
  assert.match(settlementReceipt, /state\.beneficiary/);
  assert.match(settlementReceipt, /state\.sponsor/);
  assert.match(settlementReceipt, /account\.kelvin/);
  assert.match(settlementReceipt, /No success is claimed until/);
  assert.match(settlementReceipt, /PROOF MISMATCH/);
  assert.match(routes, /settlementReceipt/);
  assert.match(styles, /width: min\(22rem, calc\(100vw - 2rem\)\)/);
  assert.match(styles, /\.workflow-claim__record/);
  assert.match(styles, /\.workflow-settlement/);
  assert.match(styles, /\.settlement-receipt__terminal-proof/);
  assert.match(styles, /\.copy-value > span:first-child/);
});

test("keeps paid and refunded history wallet-scoped and terminal-only", async () => {
  const settlementsPage = await readFile(
    new URL("app/settlements/page.tsx", webRoot),
    "utf8",
  );
  const settlementFeed = await readFile(
    new URL("components/settlement/settlement-activity-feed.tsx", webRoot),
    "utf8",
  );
  const client = await readFile(
    new URL("../../packages/rialo-client/src/client.ts", webRoot),
    "utf8",
  );
  const styles = await readFile(new URL("app/globals.css", webRoot), "utf8");

  assert.match(settlementsPage, /SettlementActivityFeed/);
  assert.match(settlementsPage, /paid = true/);
  assert.match(settlementsPage, /refunded = true/);
  assert.match(settlementFeed, /getWalletSettlementPage/);
  assert.match(settlementFeed, /Paid and refunded bounties/);
  assert.match(settlementFeed, /SETTLEMENT_PAGE_SIZE = 6/);
  assert.match(settlementFeed, /SETTLEMENT_REFRESH_INTERVAL_MS = 10_000/);
  assert.match(settlementFeed, /Verify receipt/);
  assert.match(settlementFeed, /No page\s+reload is required/);
  assert.match(client, /getWalletSettlementPage/);
  assert.match(client, /workflow\.state\.paid/);
  assert.match(client, /workflow\.state\.refunded/);
  assert.match(client, /relatedWorkflowAddress/);
  assert.match(client, /address === workflow\.state\.beneficiary/);
  assert.match(styles, /\.settlement-activity__row/);
  assert.match(styles, /\.settlement-activity__pagination/);
  assert.match(styles, /\.settlement-activity__empty/);
});

test("keeps wallet activity paginated and protocol docs on the active deployment", async () => {
  const activityFeed = await readFile(
    new URL("components/activity/wallet-activity-feed.tsx", webRoot),
    "utf8",
  );
  const walletControl = await readFile(
    new URL("components/wallet/wallet-control.tsx", webRoot),
    "utf8",
  );
  const docsPage = await readFile(
    new URL("app/docs/page.tsx", webRoot),
    "utf8",
  );
  const guidePage = await readFile(
    new URL("app/guide/page.tsx", webRoot),
    "utf8",
  );
  const styles = await readFile(new URL("app/globals.css", webRoot), "utf8");

  assert.match(activityFeed, /ACTIVITY_PAGE_SIZE = 8/);
  assert.match(activityFeed, /getWalletActivityPage/);
  assert.match(activityFeed, /showPreviousPage/);
  assert.match(activityFeed, /showNextPage/);
  assert.match(activityFeed, /requestWalletControlOpen/);
  assert.match(activityFeed, /THIS FEED SHOWS/);
  assert.match(walletControl, /OPEN_WALLET_CONTROL_EVENT/);
  assert.match(styles, /\.wallet-activity__pagination/);
  assert.match(styles, /\.wallet-activity__empty-visual/);
  assert.match(docsPage, /marketplaceDeployment\.programId/);
  assert.match(docsPage, /Autonomous payout and refund/);
  assert.match(docsPage, /liquid-slate-page/);
  assert.match(docsPage, /ScrollReveal/);
  assert.match(docsPage, /docs-section-reveal/);
  assert.match(docsPage, /docs-eyebrow/);
  assert.match(docsPage, /docs-program__status/);
  assert.match(docsPage, /requires no GitHub App installation token/);
  assert.match(docsPage, /protocol-flow/);
  assert.match(docsPage, /paid = true/);
  assert.match(docsPage, /refunded = true/);
  assert.doesNotMatch(docsPage, /reviewCandidate\.programId/);
  assert.match(guidePage, /native heartbeat/);
  assert.match(guidePage, /separate Settlements page/);
  assert.match(guidePage, /Settlement is asynchronous/);
  assert.match(guidePage, /liquid-slate-page/);
  assert.match(guidePage, /guide-eyebrow/);
  assert.match(guidePage, /guide-section-reveal/);
  assert.doesNotMatch(guidePage, /id="receipt"|guide-receipt-preview|Settlement receipt/);
  assert.doesNotMatch(guidePage, /Sponsor starts the check|manual and one-shot/);
  assert.match(styles, /\.protocol-flow/);
  assert.match(styles, /Documentation \/ Liquid Slate/);
  assert.match(styles, /Guide \/ Liquid Slate/);
  assert.match(styles, /body:has\(\.liquid-slate-page\)/);
  assert.doesNotMatch(styles, /\.code-flow/);
});
