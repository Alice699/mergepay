"use client";

import {
  Activity,
  AlertCircle,
  Check,
  Copy,
  Download,
  Ellipsis,
  LoaderCircle,
  LockKeyhole,
  Plus,
  Trash2,
  Unplug,
} from "lucide-react";
import Image from "next/image";
import { useEffect, useRef, useState, type FormEvent } from "react";
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
      if (event.key === "Escape") closePopover();
    }

    function handleOpenRequest() {
      setView("overview");
      setActionError(null);
      setNotice(null);
      setOpen(true);
      focusFrame = window.requestAnimationFrame(() => {
        controlRef.current
          ?.querySelector<HTMLElement>(".wallet-popover button:not(:disabled)")
          ?.focus();
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
            <b>m</b>
            <i />
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
          ) : connected ? (
            <ConnectedWalletView
              address={connectedAddress}
              funding={wallet.embedded.funding.phase}
              isEmbedded={wallet.source === "embedded"}
              networkLabel={network.label}
              networkSupported={wallet.networkSupported}
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
  onCopyAddress: () => void;
  onDisconnect: () => void;
  onManage: () => void;
  onRefresh: () => void;
  onRequestFunds: () => void;
  onRetryRpc: () => void;
  rpcStatus: "checking" | "available" | "unavailable";
  wallet: ReturnType<typeof useWallet>;
}) {
  const balance = wallet.balance.formatted ?? "0";
  const balancePending = wallet.balance.status === "loading";
  const balanceUnavailable = wallet.balance.status === "error";
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
    <section className="wallet-sheet">
      <header className="wallet-sheet__header">
        <div aria-label="MergePay wallet" className="wallet-sheet__brand">
          <span aria-hidden="true" className="wallet-sheet__brand-mark">
            <b>m</b>
            <i />
          </span>
          <span>MergePay</span>
        </div>
        <span className="wallet-sheet__network" data-state={connectionState}>
          <i aria-hidden="true" />
          {networkLabel}
        </span>
      </header>

      <div className="wallet-account">
        <span aria-hidden="true" className="wallet-account__avatar">
          <b>{isEmbedded ? "m" : accountName.slice(0, 1).toUpperCase()}</b>
          <i />
        </span>
        <div>
          <strong>{accountName}</strong>
          <button
            aria-label={`Copy wallet address ${address}`}
            onClick={onCopyAddress}
            title={address}
            type="button"
          >
            <code>{shortenAddress(address, 6)}</code>
            <Copy aria-hidden="true" size={12} strokeWidth={1.8} />
          </button>
        </div>
        <span className="wallet-account__state" data-active={networkSupported !== false}>
          <i aria-hidden="true" />
          {accountState}
        </span>
      </div>

      <div className="wallet-balance" aria-live="polite">
        <span>Available balance</span>
        <div data-state={balancePending ? "loading" : balanceUnavailable ? "unavailable" : "ready"}>
          {balancePending ? (
            <span className="wallet-balance__pending">
              <LoaderCircle aria-hidden="true" className="ui-icon--spin" size={17} />
              Updating balance
            </span>
          ) : balanceUnavailable ? (
            <strong className="is-unavailable">Unavailable</strong>
          ) : (
            <>
              <strong>{balance}</strong>
              <small>RLO</small>
            </>
          )}
        </div>
        <small>Native asset on {networkLabel}</small>
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

      <div aria-label="Wallet actions" className="wallet-quick-actions" role="group">
        {isEmbedded ? (
          <>
            <button
              disabled={!canRequestFunds}
              onClick={onRequestFunds}
              title="Add 1 RLO from the Rialo DevNet faucet"
              type="button"
            >
              <span aria-hidden="true">
                {funding === "requesting" ? (
                  <LoaderCircle className="ui-icon--spin" size={18} />
                ) : (
                  <Plus size={18} strokeWidth={1.8} />
                )}
              </span>
              <small>{funding === "requesting" ? "Funding" : "Add funds"}</small>
            </button>
            <button onClick={onCopyAddress} type="button">
              <span aria-hidden="true"><Copy size={17} strokeWidth={1.8} /></span>
              <small>Copy</small>
            </button>
            <button onClick={onManage} type="button">
              <span aria-hidden="true"><Ellipsis size={19} strokeWidth={1.8} /></span>
              <small>Manage</small>
            </button>
          </>
        ) : (
          <>
            <button
              disabled={wallet.balance.status === "loading"}
              onClick={onRefresh}
              type="button"
            >
              <span aria-hidden="true"><Activity size={18} strokeWidth={1.8} /></span>
              <small>{wallet.balance.status === "loading" ? "Updating" : "Refresh"}</small>
            </button>
            <button onClick={onCopyAddress} type="button">
              <span aria-hidden="true"><Copy size={17} strokeWidth={1.8} /></span>
              <small>Copy</small>
            </button>
            <button className="is-danger" onClick={onDisconnect} type="button">
              <span aria-hidden="true"><Unplug size={17} strokeWidth={1.8} /></span>
              <small>Disconnect</small>
            </button>
          </>
        )}
      </div>

      {isEmbedded && (
        <p className="wallet-sheet__faucet-note">
          DevNet faucet adds 1 RLO per request.
        </p>
      )}

      <footer className="wallet-sheet__footer">
        <span className="wallet-sheet__rpc" data-state={connectionState}>
          <i aria-hidden="true" />
          {rpcTitle}
        </span>
        <span>
          {isEmbedded
            ? "Encrypted locally · auto-locks after 15 min"
            : "Wallet Standard connection"}
        </span>
      </footer>
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
          <b>m</b>
          <i />
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
  onConnect: (name: string) => void;
  onCreate: () => void;
  onRestore: () => void;
  onUnlock: () => void;
  wallets: ReturnType<typeof useWallet>["wallets"];
}) {
  const hasVault = embeddedStatus === "locked";
  const vaultBusy = ["loading", "creating", "unlocking", "restoring", "removing"].includes(embeddedStatus);

  return (
    <div className="wallet-options-view">
      <div className="wallet-popover__heading">
        <div><p className="panel-label">SIGNING METHOD</p><h2>Open a Rialo wallet</h2></div>
        <span aria-hidden="true" className="wallet-popover__form-index">m.key</span>
      </div>
      <p className="wallet-popover__copy">Use the encrypted wallet built for this DevNet demo, or connect a compatible extension when one is available.</p>

      <button
        className="wallet-option wallet-option--embedded"
        disabled={!embeddedAvailable || vaultBusy}
        onClick={hasVault ? onUnlock : onCreate}
        type="button"
      >
        <span aria-hidden="true" className="wallet-option__icon wallet-option__monogram">m</span>
        <span>
          <strong>{hasVault ? "Unlock local wallet" : "Create local wallet"}</strong>
          <small>{hasVault && embeddedAddress ? shortenAddress(embeddedAddress, 6) : "Encrypted in this browser · DevNet only"}</small>
        </span>
        <span className="wallet-option__state">{!embeddedAvailable ? "DevNet only" : vaultBusy ? "Loading" : hasVault ? "Unlock" : "Create"}</span>
      </button>

      {!hasVault && embeddedAvailable && (
        <button className="wallet-restore-link" onClick={onRestore} type="button"><span>RESTORE</span> encrypted backup</button>
      )}

      <div className="wallet-popover__section-heading"><span>Wallet extensions</span><small>Frost · Wallet Standard</small></div>
      {wallets.length === 0 ? (
        <div className="wallet-popover__empty"><span aria-hidden="true" className="wallet-popover__empty-mark">EXT</span> No compatible extension detected. The local DevNet wallet works without one.</div>
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
  return <div className="wallet-popover__heading"><div><p className="panel-label">{label}</p><h2>{title}</h2></div><span aria-hidden="true" className="wallet-popover__form-index">m.key</span></div>;
}

function PasswordField({ autoComplete, label, name }: { autoComplete: string; label: string; name: string }) {
  return <label className="wallet-vault-form__field"><span>{label}</span><input autoComplete={autoComplete} minLength={EMBEDDED_WALLET_PASSWORD_MIN_LENGTH} name={name} required type="password" /><small>At least {EMBEDDED_WALLET_PASSWORD_MIN_LENGTH} characters</small></label>;
}

function WalletFormActions({ busy, busyLabel, danger = false, onCancel, submitLabel }: { busy: boolean; busyLabel: string; danger?: boolean; onCancel: () => void; submitLabel: string }) {
  return <div className="wallet-vault-form__actions"><button disabled={busy} onClick={onCancel} type="button">Cancel</button><button className={danger ? "is-danger" : "is-primary"} disabled={busy} type="submit">{busy && <LoaderCircle aria-hidden="true" className="ui-icon--spin" size={14} />}{busy ? busyLabel : submitLabel}</button></div>;
}
