export type AppNotificationTone = "success" | "error" | "info";

export interface AppNotificationInput {
  title: string;
  message: string;
  tone: AppNotificationTone;
  signature?: string | null;
  durationMs?: number;
}

export interface AppNotification extends AppNotificationInput {
  id: string;
}

export const APP_NOTIFICATION_EVENT = "mergepay:notification";

export function publishAppNotification(input: AppNotificationInput): void {
  if (typeof window === "undefined") return;

  const notification: AppNotification = {
    ...input,
    id: globalThis.crypto.randomUUID(),
  };
  window.dispatchEvent(
    new CustomEvent<AppNotification>(APP_NOTIFICATION_EVENT, {
      detail: notification,
    }),
  );
}
