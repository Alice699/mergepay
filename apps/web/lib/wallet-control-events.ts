export const OPEN_WALLET_CONTROL_EVENT = "mergepay:open-wallet-control";

export function requestWalletControlOpen(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(OPEN_WALLET_CONTROL_EVENT));
}
