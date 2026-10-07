"use client";

import {
  AlertCircle,
  ArrowDownToLine,
  Check,
  Copy,
  Download,
  History,
  LoaderCircle,
  LockKeyhole,
  Plus,
  Puzzle,
  RefreshCw,
  Settings2,
  Trash2,
  Unplug,
  X,
} from "lucide-react";
import Image from "next/image";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { WalletActivityView } from "@/components/wallet/wallet-activity-view";
import { useNetwork } from "@/hooks/use-network";
import { useWallet } from "@/hooks/use-wallet";
import {
  EMBEDDED_WALLET_BACKUP_MAX_BYTES,
  EMBEDDED_WALLET_PASSWORD_MIN_LENGTH,
} from "@/lib/embedded-wallet";
import { asError, describeRialoError } from "@/lib/errors";
import { shortenAddress } from "@/lib/format";
import { OPEN_WALLET_CONTROL_EVENT } from "@/lib/wallet-control-events";

type WalletView =
  | "overview"
  | "activity"
  | "create"
  | "unlock"
  | "restore"
  | "manage"
  | "remove";

export function WalletControl() {
  const wallet = useWallet();
  const network = useNetwork();
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<WalletView>("overview");
  const [actionError, setActionError] = useState<Error | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const controlRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let focusFrame: number | null = null;

    function closePopover() {
      setOpen(false);
      setView("overview");
      setActionError(null);
      setNotice(null);
    }

    function handlePointerDown(event: PointerEvent) {
      if (!controlRef.current?.contains(event.target as Node)) closePopover();
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape" && controlRef.current?.querySelector(".wallet-popover")) {
        closePopover();
        controlRef.current.querySelector<HTMLButtonElement>(".wallet-button")?.focus();
      }
    }

    function handleOpenRequest() {
      setView("overview");
      setActionError(null);
      setNotice(null);
      setOpen(true);
      focusFrame = window.requestAnimationFrame(() => {
        const primaryAction = controlRef.current?.querySelector<HTMLElement>(".wallet-popover .wallet-option--embedded:not(:disabled)");
        const firstAction = primaryAction ?? controlRef.current?.querySelector<HTMLElement>(".wallet-popover button:not(:disabled)");
        firstAction?.focus();
      });
    }

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    window.addEventListener(OPEN_WALLET_CONTROL_EVENT, handleOpenRequest);
    return () => {
      if (focusFrame !== null) window.cancelAnimationFrame(focusFrame);
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener(OPEN_WALLET_CONTROL_EVENT, handleOpenRequest);
    };
  }, []);

  const connectedAddress = wallet.status === "connected" ? wallet.address : null;
  const connected = connectedAddress !== null;
  const busy = wallet.status === "connecting" || wallet.status === "reconnecting";
  const buttonLabel = connected
    ? shortenAddress(connectedAddress)
    : wallet.status === "discovering"
      ? "Loading wallet"
      : wallet.status === "locked"
        ? "Unlock wallet"
        : busy
          ? "Opening wallet"
          : "Open wallet";

  function selectView(nextView: WalletView) {
    setView(nextView);
    setActionError(null);
    setNotice(null);
  }

  function closeWallet() {
    setOpen(false);
    setView("overview");
    setActionError(null);
    setNotice(null);
    controlRef.current?.querySelector<HTMLButtonElement>(".wallet-button")?.focus();
  }

  function returnFromActivity() {
    selectView("overview");
    window.requestAnimationFrame(() => {
      controlRef.current?.querySelector<HTMLButtonElement>("[data-wallet-activity]")?.focus();
    });
  }

  function togglePopover() {
    if (open) {
      setView("overview");
      setActionError(null);
      setNotice(null);
    }
    setOpen(!open);
  }

  async function handleConnect(walletName: string) {
    setActionError(null);
    setNotice(null);
    try {
      await wallet.connect(walletName);
    } catch (cause) {
      setActionError(asError(cause));
    }
  }

  async function handleDisconnect() {
    setActionError(null);
    setNotice(null);
    try {
      await wallet.disconnect();
      setView("overview");
    } catch (cause) {
      setActionError(asError(cause));
    }
  }

  async function handleCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    if (!form.reportValidity()) return;
    const data = new FormData(form);
    const password = String(data.get("password") ?? "");
    const confirmation = String(data.get("passwordConfirmation") ?? "");
    if (password !== confirmation) {
      setActionError(new Error("The wallet passwords do not match."));
      return;
    }

    setActionError(null);
    try {
      await wallet.embedded.create(password);
      form.reset();
      setView("overview");
      setNotice("Wallet created. Download an encrypted backup before using long-lived bounties.");
    } catch (cause) {
      setActionError(asError(cause));
    }
  }

  async function handleUnlock(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    if (!form.reportValidity()) return;
    const password = String(new FormData(form).get("password") ?? "");
    setActionError(null);
    try {
      await wallet.embedded.unlock(password);
      form.reset();
      setView("overview");
    } catch (cause) {
      setActionError(asError(cause));
    }
  }

  async function handleRestore(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    if (!form.reportValidity()) return;
    const data = new FormData(form);
    const file = data.get("backup");
    const password = String(data.get("password") ?? "");
    if (!(file instanceof File) || file.size === 0) {
      setActionError(new Error("Choose an encrypted MergePay wallet backup."));
      return;
    }
    if (file.size > EMBEDDED_WALLET_BACKUP_MAX_BYTES) {
      setActionError(new Error("The selected wallet backup is too large."));
      return;
    }

    setActionError(null);
    try {
      await wallet.embedded.restoreBackup(await file.text(), password);
      form.reset();
      setView("overview");
      setNotice("Encrypted wallet backup restored and unlocked.");
    } catch (cause) {
      setActionError(asError(cause));
    }
  }

  async function handleRemove(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    if (!form.reportValidity()) return;
    const confirmation = String(
      new FormData(form).get("confirmation") ?? "",
    );
    if (confirmation !== "DELETE") {
      setActionError(new Error("Type DELETE exactly to remove this wallet."));
      return;
    }

    setActionError(null);
    try {
      await wallet.embedded.remove();
      form.reset();
      setView("overview");
      setNotice("Local wallet data was removed from this browser.");
    } catch (cause) {
      setActionError(asError(cause));
    }
  }

  async function handleBackup() {
    setActionError(null);
    try {
      const backup = await wallet.embedded.exportBackup();
      const blob = new Blob([backup], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      const prefix = wallet.embedded.address?.slice(0, 8) ?? "wallet";
      anchor.href = url;
      anchor.download = `mergepay-devnet-${prefix}.wallet.json`;
      document.body.append(anchor);
      anchor.click();
      anchor.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 0);
      setNotice("Encrypted wallet backup downloaded.");
    } catch (cause) {
      setActionError(asError(cause));
    }
  }

  function handleLock() {
    setActionError(null);
    setNotice(null);
    wallet.embedded.lock();
    setView("overview");
  }

  async function handleRequestFunds() {
    setActionError(null);
    setNotice(null);
    try {
      await wallet.embedded.requestDevnetFunds();
      setNotice("The Rialo DevNet faucet confirmed 1 RLO for this wallet.");
    } catch (cause) {
      setActionError(asError(cause));
    }
  }

  async function handleCopyAddress() {
    if (!connectedAddress) return;
    setActionError(null);
    try {
      if (!navigator.clipboard) {
        throw new Error("Clipboard access is unavailable in this browser.");
      }
      await navigator.clipboard.writeText(connectedAddress);
      setNotice("Signer address copied.");
    } catch (cause) {
      setActionError(asError(cause));
    }
  }

  const visibleError =
    actionError ??
    (wallet.source === "extension"
      ? wallet.balance.error
      : wallet.embedded.funding.error ??
        wallet.balance.error ??
        wallet.embedded.error) ??
    wallet.connectError;

  return (
    <div className="wallet-control" ref={controlRef}>
      <button
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-label={connected ? `Active wallet ${buttonLabel}` : buttonLabel}
        className={`wallet-button wallet-button--${wallet.status}`}
        disabled={wallet.status === "discovering"}
        onClick={togglePopover}
        title={connected ? "Manage active wallet" : "Open a Rialo wallet"}
        type="button"
      >
        {busy ? (
          <LoaderCircle aria-hidden="true" className="ui-icon--spin" size={14} />
        ) : (
          <span aria-hidden="true" className="wallet-button__mark">
            <WalletRobotMark size={20} />
          </span>
        )}
        <span className="wallet-button__label">{buttonLabel}</span>
      </button>

      {open && (
        <div aria-label="Rialo wallet" className="wallet-popover" role="dialog">
          {connected && wallet.source === "embedded" && view === "remove" ? (
            <RemoveWalletView
              busy={wallet.embedded.status === "removing"}
              onCancel={() => selectView("overview")}
              onSubmit={handleRemove}
            />
          ) : connected && wallet.source === "embedded" && view === "manage" ? (
            <WalletSettingsView
              address={connectedAddress}
              onBackup={() => void handleBackup()}
              onDone={() => selectView("overview")}
              onLock={handleLock}
              onRemove={() => selectView("remove")}
            />
          ) : connected && view === "activity" ? (
            <WalletActivityView
              key={`${network.network}:${network.rpcUrl}:${network.client.programId}:${connectedAddress}`}
              accountName={wallet.source === "embedded" ? "Local account" : wallet.walletName ?? "Rialo wallet"}
              address={connectedAddress}
              networkSupported={wallet.networkSupported}
              onBack={returnFromActivity}
              onClose={closeWallet}
            />
          ) : connected ? (
            <ConnectedWalletView
              address={connectedAddress}
              funding={wallet.embedded.funding.phase}
              isEmbedded={wallet.source === "embedded"}
              networkLabel={network.label}
              networkSupported={wallet.networkSupported}
              onActivity={() => selectView("activity")}
              onClose={closeWallet}
              onCopyAddress={() => void handleCopyAddress()}
              onDisconnect={() => void handleDisconnect()}
              onManage={() => selectView("manage")}
              onRefresh={wallet.balance.refresh}
              onRequestFunds={() => void handleRequestFunds()}
              onRetryRpc={network.refreshRpcHealth}
              rpcStatus={network.rpcStatus}
              wallet={wallet}
            />
          ) : view === "create" ? (
            <CreateWalletView
              busy={wallet.embedded.status === "creating"}
              onCancel={() => selectView("overview")}
              onSubmit={handleCreate}
            />
          ) : view === "unlock" ? (
            <UnlockWalletView
              address={wallet.embedded.address}
              busy={wallet.embedded.status === "unlocking"}
              onCancel={() => selectView("overview")}
              onSubmit={handleUnlock}
            />
          ) : view === "restore" ? (
            <RestoreWalletView
              busy={wallet.embedded.status === "restoring"}
              onCancel={() => selectView("overview")}
              onSubmit={handleRestore}
            />
          ) : (
            <WalletOptionsView
              busy={busy}
              embeddedAvailable={wallet.embedded.available}
              embeddedAddress={wallet.embedded.address}
              embeddedStatus={wallet.embedded.status}
              expectedChainId={wallet.expectedChainId}
              networkLabel={network.label}
              onClose={closeWallet}
              onConnect={(name) => void handleConnect(name)}
              onCreate={() => selectView("create")}
              onRestore={() => selectView("restore")}
              onUnlock={() => selectView("unlock")}
              wallets={wallet.wallets}
            />
          )}

          {notice && <p className="wallet-popover__notice" role="status"><Check aria-hidden="true" size={14} /> {notice}</p>}
          {visibleError && <p className="wallet-popover__error" role="alert"><AlertCircle aria-hidden="true" size={14} /> {describeRialoError(visibleError)}</p>}
        </div>
      )}
    </div>
  );
}

function ConnectedWalletView({
  address,
  funding,
  isEmbedded,
  networkLabel,
  networkSupported,
  onActivity,
  onClose,
  onCopyAddress,
  onDisconnect,
  onManage,
  onRefresh,
  onRequestFunds,
  onRetryRpc,
  rpcStatus,
  wallet,
}: {
  address: string;
  funding: "idle" | "requesting" | "confirmed" | "failed";
  isEmbedded: boolean;
  networkLabel: string;
  networkSupported: boolean | null;
  onActivity: () => void;
  onClose: () => void;
  onCopyAddress: () => void;
  onDisconnect: () => void;
  onManage: () => void;
  onRefresh: () => void;
  onRequestFunds: () => void;
  onRetryRpc: () => void;
  rpcStatus: "checking" | "available" | "unavailable";
  wallet: ReturnType<typeof useWallet>;
}) {
  const [receiveOpen, setReceiveOpen] = useState(false);
  const balance = wallet.balance.formatted;
  const balancePending = wallet.balance.status === "idle" || wallet.balance.status === "loading";
  const balanceUnavailable = wallet.balance.status === "error" || networkSupported === false;
  const connectionState =
    networkSupported === false ? "unavailable" : rpcStatus;
  const rpcTitle =
    networkSupported === false
      ? "Wrong network"
      : rpcStatus === "available"
        ? "RPC connected"
        : rpcStatus === "checking"
          ? "Checking RPC"
          : "RPC unavailable";
  const accountName = isEmbedded
    ? "Local account"
    : wallet.walletName ?? "Rialo wallet";
  const accountState =
    networkSupported === false
      ? "Network mismatch"
      : isEmbedded
        ? "Unlocked"
        : "Connected";
  const canRequestFunds =
    funding !== "requesting" &&
    rpcStatus === "available" &&
    networkSupported !== false;

  return (
    <section className="wallet-portfolio">
      <header className="wallet-portfolio__header">
        <div aria-label="MergePay wallet" className="wallet-portfolio__account">
          <span aria-hidden="true" className="wallet-portfolio__avatar">
            {isEmbedded ? <WalletRobotMark size={27} /> : <b>{accountName.slice(0, 1).toUpperCase()}</b>}
          </span>
          <div>
            <strong title={accountName}>{accountName}</strong>
            <button aria-label={`Copy wallet address ${address}`} onClick={onCopyAddress} title={address} type="button">
              <code>{shortenAddress(address, 6)}</code>
              <Copy aria-hidden="true" size={12} />
            </button>
          </div>
        </div>
        <div className="wallet-portfolio__header-actions">
          {isEmbedded && <button aria-label="Wallet settings" onClick={onManage} title="Wallet settings" type="button"><Settings2 aria-hidden="true" size={18} /></button>}
          <button aria-label="Close wallet" onClick={onClose} title="Close wallet" type="button"><X aria-hidden="true" size={18} /></button>
        </div>
      </header>

      <div className="wallet-portfolio__balance" aria-live="polite" aria-label="Wallet balance">
        <div className="wallet-portfolio__balance-heading">
          <span>Available balance</span>
          <button aria-label="Refresh wallet balance" disabled={balancePending || rpcStatus !== "available" || networkSupported === false} onClick={onRefresh} title="Refresh balance" type="button">
            <RefreshCw aria-hidden="true" className={balancePending ? "ui-icon--spin" : undefined} size={14} />
          </button>
        </div>
        <div className="wallet-portfolio__amount" data-compact={(balance?.length ?? 0) > 12} data-state={balanceUnavailable ? "unavailable" : balancePending ? "loading" : "ready"}>
          {balanceUnavailable ? <strong className="wallet-portfolio__balance-message">Unavailable</strong> : balancePending ? (
            <span className="wallet-portfolio__balance-message"><LoaderCircle aria-hidden="true" className="ui-icon--spin" size={18} /> Updating balance</span>
          ) : <><strong title={`${balance} RLO`}>{balance ?? "—"}</strong><span>RLO</span></>}
        </div>
        <div className="wallet-portfolio__network" data-state={connectionState}>
          <i aria-hidden="true" /><span>{networkLabel}</span><span className="wallet-portfolio__account-state">{accountState}</span>
        </div>
      </div>

      {(rpcStatus !== "available" || networkSupported === false) && (
        <div className="wallet-connection" data-state={connectionState}>
          <span aria-hidden="true" className="wallet-connection__signal"><i /></span>
          <span>
            <strong>{rpcTitle}</strong>
            <small>
              {networkSupported === false
                ? `Switch your wallet to ${networkLabel}.`
                : rpcStatus === "checking"
                  ? `Confirming access to ${networkLabel}.`
                  : `${networkLabel} cannot be reached right now.`}
            </small>
          </span>
          {networkSupported !== false && (
            <button
              disabled={rpcStatus === "checking"}
              onClick={onRetryRpc}
              type="button"
            >
              {rpcStatus === "checking" ? "Checking" : "Try again"}
            </button>
          )}
        </div>
      )}

      <div aria-label="Wallet actions" className="wallet-portfolio__actions" data-layout={isEmbedded ? "embedded" : "extension"} role="group">
        {isEmbedded && (
          <button aria-label={funding === "requesting" ? "Funding wallet" : "Add funds"} disabled={!canRequestFunds} onClick={onRequestFunds} title="Add 1 RLO from the Rialo DevNet faucet" type="button">
            {funding === "requesting" ? <LoaderCircle aria-hidden="true" className="ui-icon--spin" size={21} /> : <Plus aria-hidden="true" size={23} />}
            <span>{funding === "requesting" ? "Adding…" : "Add funds"}</span>
          </button>
        )}
        <button aria-controls="wallet-receive-address" aria-expanded={receiveOpen} onClick={() => setReceiveOpen(!receiveOpen)} type="button">
          <ArrowDownToLine aria-hidden="true" size={21} /><span>Receive</span>
        </button>
        <button data-wallet-activity onClick={onActivity} type="button"><History aria-hidden="true" size={21} /><span>Activity</span></button>
        {isEmbedded ? (
          <button aria-label="Wallet settings" onClick={onManage} type="button"><Settings2 aria-hidden="true" size={21} /><span>Settings</span></button>
        ) : (
          <button className="is-danger" onClick={onDisconnect} type="button"><Unplug aria-hidden="true" size={21} /><span>Disconnect</span></button>
        )}
      </div>
      {isEmbedded && <p className="wallet-portfolio__faucet-note">DevNet faucet adds 1 RLO per request</p>}

      {receiveOpen && (
        <section aria-label="Receive RLO" className="wallet-portfolio__receive" id="wallet-receive-address">
          <div><h2>Receive RLO</h2><button aria-label="Close receiving address" onClick={() => setReceiveOpen(false)} type="button"><X aria-hidden="true" size={16} /></button></div>
          <p>Only send RLO on {networkLabel} to this address.</p>
          <code>{address}</code>
          <button className="wallet-portfolio__copy" onClick={onCopyAddress} type="button"><Copy aria-hidden="true" size={15} /> Copy address</button>
        </section>
      )}

      <section aria-labelledby="wallet-token-heading" className="wallet-portfolio__tokens">
        <div className="wallet-portfolio__tokens-heading"><h2 id="wallet-token-heading">Tokens</h2><span>1 asset</span></div>
        <div className="wallet-token" aria-label="Rialo native token" aria-live="polite" data-compact={(balance?.length ?? 0) > 12}>
          {/* Official Rialo mark: https://rialo.io/images/webclip.png. */}
          <Image alt="Rialo logo" className="wallet-token__logo" height={44} src="/rialo-logo.png" unoptimized width={44} />
          <div className="wallet-token__identity"><strong>Rialo</strong><span>RLO <b>·</b> Native token</span></div>
          <div className="wallet-token__amount" title={!balanceUnavailable && !balancePending && balance !== null ? `${balance} RLO` : undefined}>
            <strong>{balanceUnavailable ? "Unavailable" : balancePending ? "Syncing…" : balance ?? "—"}</strong>
            <span>{balanceUnavailable ? "Balance not verified" : "RLO"}</span>
          </div>
        </div>
        <p>DevNet balance only. No market price displayed.</p>
      </section>

      <footer className="wallet-portfolio__footer">
        <span className="wallet-sheet__rpc" data-state={connectionState}>
          <i aria-hidden="true" />
          {rpcTitle}
        </span>
        <span className="wallet-portfolio__security">
          <LockKeyhole aria-hidden="true" size={13} strokeWidth={1.7} />
          <span>{isEmbedded ? "Encrypted locally" : "Wallet Standard"}</span>
        </span>
      </footer>
      <p className="wallet-portfolio__session-note">{isEmbedded ? "15 min auto-lock" : "External signer"} <span>·</span> MergePay wallet</p>
    </section>
  );
}

function WalletSettingsView({
  address,
  onBackup,
  onDone,
  onLock,
  onRemove,
}: {
  address: string;
  onBackup: () => void;
  onDone: () => void;
  onLock: () => void;
  onRemove: () => void;
}) {
  return (
    <section className="wallet-settings">
      <header className="wallet-settings__header">
        <div>
          <p>Local account</p>
          <h2>Wallet settings</h2>
        </div>
        <button onClick={onDone} type="button">Done</button>
      </header>

      <div className="wallet-settings__account">
        <span aria-hidden="true" className="wallet-account__avatar wallet-account__avatar--small">
          <WalletRobotMark size={24} />
        </span>
        <span>
          <strong>{shortenAddress(address, 7)}</strong>
          <small>Encrypted in this browser</small>
        </span>
      </div>

      <div className="wallet-settings__list">
        <button onClick={onBackup} type="button">
          <span aria-hidden="true" className="wallet-settings__icon">
            <Download size={18} strokeWidth={1.75} />
          </span>
          <span>
            <strong>Download backup</strong>
            <small>Save an encrypted recovery file</small>
          </span>
        </button>
        <button onClick={onLock} type="button">
          <span aria-hidden="true" className="wallet-settings__icon">
            <LockKeyhole size={18} strokeWidth={1.75} />
          </span>
          <span>
            <strong>Lock wallet</strong>
            <small>Require your password next time</small>
          </span>
        </button>
        <button className="is-danger" onClick={onRemove} type="button">
          <span aria-hidden="true" className="wallet-settings__icon">
            <Trash2 size={18} strokeWidth={1.75} />
          </span>
          <span>
            <strong>Remove wallet</strong>
            <small>Delete the encrypted key from this browser</small>
          </span>
        </button>
      </div>

      <p className="wallet-settings__note">
        MergePay cannot recover your password or encrypted backup.
      </p>
    </section>
  );
}

function WalletOptionsView({
  busy,
  embeddedAvailable,
  embeddedAddress,
  embeddedStatus,
  expectedChainId,
  networkLabel,
  onClose,
  onConnect,
  onCreate,
  onRestore,
  onUnlock,
  wallets,
}: {
  busy: boolean;
  embeddedAvailable: boolean;
  embeddedAddress: string | null;
  embeddedStatus: ReturnType<typeof useWallet>["embedded"]["status"];
  expectedChainId: ReturnType<typeof useWallet>["expectedChainId"];
  networkLabel: string;
  onClose: () => void;
  onConnect: (name: string) => void;
  onCreate: () => void;
  onRestore: () => void;
  onUnlock: () => void;
  wallets: ReturnType<typeof useWallet>["wallets"];
}) {
  const hasVault = embeddedStatus === "locked";
  const vaultBusy = ["loading", "creating", "unlocking", "restoring", "removing"].includes(embeddedStatus);

  return (
    <div className="wallet-options-view wallet-access">
      <header className="wallet-access__header">
        <div className="wallet-access__brand"><WalletRobotMark size={22} /><span>MergePay wallet</span></div>
        <div><span className="wallet-access__network">{networkLabel.replace("Rialo ", "")}</span><button aria-label="Close wallet" onClick={onClose} title="Close wallet" type="button"><X aria-hidden="true" size={17} /></button></div>
      </header>
      <h2>Open a Rialo wallet</h2>
      <p className="wallet-access__intro">{hasVault ? "Unlock your saved account, or connect a compatible wallet extension." : "Create a local DevNet account, or connect a compatible wallet extension."}</p>

      <button
        aria-label={hasVault ? "Unlock local wallet" : "Create local wallet"}
        className="wallet-option wallet-option--embedded"
        disabled={!embeddedAvailable || vaultBusy}
        onClick={hasVault ? onUnlock : onCreate}
        title={hasVault && embeddedAddress ? embeddedAddress : "Create a password-protected DevNet wallet"}
        type="button"
      >
        <span aria-hidden="true" className="wallet-option__icon wallet-option__monogram">
          <WalletRobotMark size={30} />
        </span>
        <span className="wallet-access__local-copy">
          <span className="wallet-access__local-label">{hasVault ? "Saved in this browser" : "Local account"}</span>
          <strong>{hasVault ? "Unlock local wallet" : "Create local wallet"}</strong>
          <small>{hasVault && embeddedAddress ? <code>{shortenAddress(embeddedAddress, 6)}</code> : "Password-protected · DevNet only"}</small>
        </span>
        <span aria-hidden="true" className="wallet-option__state">{vaultBusy ? <LoaderCircle className="ui-icon--spin" size={13} /> : hasVault ? <LockKeyhole size={13} /> : <Plus size={13} />}{!embeddedAvailable ? "DevNet only" : vaultBusy ? "Loading" : hasVault ? "Unlock" : "Create"}</span>
      </button>

      {!hasVault && embeddedAvailable && (
        <button aria-label="Restore encrypted backup" className="wallet-restore-link" onClick={onRestore} type="button"><Download aria-hidden="true" size={14} /> Restore from encrypted backup</button>
      )}

      <div className="wallet-access__extensions-heading"><h3>Wallet extensions</h3><span>{wallets.length === 0 ? "Optional" : `${wallets.length} detected`}</span></div>
      {wallets.length === 0 ? (
        <div className="wallet-access__empty" role="status">
          <span aria-hidden="true"><Puzzle size={20} /></span>
          <div><strong>No compatible extension detected</strong><p>{embeddedAvailable ? "You can use the local wallet without one." : "Connect a compatible extension to use this network."}</p></div>
        </div>
      ) : (
        <div className="wallet-options">
          {wallets.map((item) => {
            const supportsNetwork = item.chains.length === 0 || item.chains.includes(expectedChainId);
            return (
              <button className="wallet-option" disabled={!supportsNetwork || busy} key={item.name} onClick={() => onConnect(item.name)} type="button">
                <span className="wallet-option__icon">{item.icon ? <Image alt="" height={32} src={item.icon} unoptimized width={32} /> : <span aria-hidden="true" className="wallet-option__extension-mark">EX</span>}</span>
                <span><strong>{item.name}</strong><small>{supportsNetwork ? `Available on ${networkLabel}` : "Different network"}</small></span>
                <span className="wallet-option__state">{supportsNetwork ? "Connect" : "Unavailable"}</span>
              </button>
            );
          })}
        </div>
      )}
      <p className="wallet-access__security"><LockKeyhole aria-hidden="true" size={12} /><span>Local keys are encrypted in browser storage.</span></p>
    </div>
  );
}

function CreateWalletView({ busy, onCancel, onSubmit }: WalletFormProps) {
  return (
    <form className="wallet-vault-form" onSubmit={onSubmit}>
      <VaultHeading label="NEW LOCAL WALLET" title="Protect this DevNet key" />
      <p className="wallet-popover__copy">The password encrypts your Rialo key before it reaches browser storage. MergePay cannot recover it.</p>
      <PasswordField autoComplete="new-password" label="Wallet password" name="password" />
      <PasswordField autoComplete="new-password" label="Confirm password" name="passwordConfirmation" />
      <label className="wallet-vault-form__consent"><input required type="checkbox" /> <span>I understand this experimental wallet is DevNet-only and requires my password or encrypted backup.</span></label>
      <WalletFormActions busy={busy} busyLabel="Creating wallet" onCancel={onCancel} submitLabel="Create wallet" />
    </form>
  );
}

function UnlockWalletView({ address, busy, onCancel, onSubmit }: WalletFormProps & { address: string | null }) {
  return (
    <form className="wallet-vault-form" onSubmit={onSubmit}>
      <VaultHeading label="ENCRYPTED VAULT" title="Unlock local wallet" />
      {address && <code className="wallet-popover__address" title={address}>{address}</code>}
      <PasswordField autoComplete="current-password" label="Wallet password" name="password" />
      <WalletFormActions busy={busy} busyLabel="Unlocking wallet" onCancel={onCancel} submitLabel="Unlock wallet" />
    </form>
  );
}

function RestoreWalletView({ busy, onCancel, onSubmit }: WalletFormProps) {
  return (
    <form className="wallet-vault-form" onSubmit={onSubmit}>
      <VaultHeading label="RECOVERY" title="Restore encrypted backup" />
      <p className="wallet-popover__copy">Only MergePay wallet backup JSON files are accepted. The password is verified locally before anything is stored.</p>
      <label className="wallet-vault-form__field"><span>Backup file</span><input accept="application/json,.json" name="backup" required type="file" /></label>
      <PasswordField autoComplete="current-password" label="Backup password" name="password" />
      <WalletFormActions busy={busy} busyLabel="Restoring wallet" onCancel={onCancel} submitLabel="Restore wallet" />
    </form>
  );
}

function RemoveWalletView({ busy, onCancel, onSubmit }: WalletFormProps) {
  return (
    <form className="wallet-vault-form" onSubmit={onSubmit}>
      <VaultHeading label="LOCAL DATA" title="Remove this wallet" />
      <div className="wallet-vault-form__warning"><Trash2 aria-hidden="true" size={16} /><p>This permanently deletes the encrypted key from this browser. Download a backup first if this address owns an active bounty.</p></div>
      <label className="wallet-vault-form__field"><span>Type DELETE to confirm</span><input autoComplete="off" name="confirmation" pattern="DELETE" required spellCheck={false} /></label>
      <WalletFormActions busy={busy} busyLabel="Removing wallet" danger onCancel={onCancel} submitLabel="Remove wallet" />
    </form>
  );
}

interface WalletFormProps {
  busy: boolean;
  onCancel: () => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}

function VaultHeading({ label, title }: { label: string; title: string }) {
  return <div className="wallet-popover__heading"><div><p className="panel-label">{label}</p><h2>{title}</h2></div><span aria-hidden="true" className="wallet-popover__form-index">DEVNET</span></div>;
}

function WalletRobotMark({ size }: Readonly<{ size: number }>) {
  return (
    <Image
      alt=""
      className="wallet-robot-mark"
      height={size}
      src="/favicon.svg?v=robot-head-1"
      unoptimized
      width={size}
    />
  );
}

function PasswordField({ autoComplete, label, name }: { autoComplete: string; label: string; name: string }) {
  return <label className="wallet-vault-form__field"><span>{label}</span><input autoComplete={autoComplete} minLength={EMBEDDED_WALLET_PASSWORD_MIN_LENGTH} name={name} required type="password" /><small>At least {EMBEDDED_WALLET_PASSWORD_MIN_LENGTH} characters</small></label>;
}

function WalletFormActions({ busy, busyLabel, danger = false, onCancel, submitLabel }: { busy: boolean; busyLabel: string; danger?: boolean; onCancel: () => void; submitLabel: string }) {
  return <div className="wallet-vault-form__actions"><button disabled={busy} onClick={onCancel} type="button">Cancel</button><button className={danger ? "is-danger" : "is-primary"} disabled={busy} type="submit">{busy && <LoaderCircle aria-hidden="true" className="ui-icon--spin" size={14} />}{busy ? busyLabel : submitLabel}</button></div>;
}
