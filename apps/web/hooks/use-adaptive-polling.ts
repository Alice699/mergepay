"use client";

import { useEffect, useRef } from "react";

type PollResult = boolean | void;

export interface AdaptivePollingOptions {
  enabled: boolean;
  intervalMs: number;
  maxIntervalMs?: number;
  leading?: boolean;
  poll: () => PollResult | Promise<PollResult>;
  resumeMinGapMs?: number;
}

function pageCanPoll(): boolean {
  return (
    document.visibilityState === "visible" &&
    (typeof navigator === "undefined" || navigator.onLine !== false)
  );
}

/**
 * Runs one request at a time, sleeps completely while the page is hidden or
 * offline, and immediately reconciles when the user returns. Returning false
 * from `poll` applies exponential backoff until the next successful read.
 */
export function useAdaptivePolling({
  enabled,
  intervalMs,
  leading = false,
  maxIntervalMs = intervalMs * 8,
  poll,
  resumeMinGapMs = 750,
}: AdaptivePollingOptions): void {
  const pollRef = useRef(poll);

  useEffect(() => {
    pollRef.current = poll;
  }, [poll]);

  useEffect(() => {
    if (!enabled) return;

    let disposed = false;
    let running = false;
    let failureCount = 0;
    let lastStartedAt = 0;
    let timer: number | null = null;

    const clearTimer = () => {
      if (timer === null) return;
      window.clearTimeout(timer);
      timer = null;
    };

    const nextDelay = () =>
      Math.min(
        maxIntervalMs,
        intervalMs * Math.pow(2, Math.min(failureCount, 6)),
      );

    const schedule = (delayMs = nextDelay()) => {
      clearTimer();
      if (disposed || !pageCanPoll()) return;
      timer = window.setTimeout(() => {
        timer = null;
        void runPoll();
      }, Math.max(0, delayMs));
    };

    const runPoll = async () => {
      if (disposed || running || !pageCanPoll()) return;

      running = true;
      lastStartedAt = Date.now();
      let successful = false;
      try {
        successful = (await pollRef.current()) !== false;
      } catch {
        successful = false;
      } finally {
        running = false;
        if (disposed) return;
        failureCount = successful ? 0 : failureCount + 1;
        schedule();
      }
    };

    const reconcileOnResume = () => {
      if (!pageCanPoll()) {
        clearTimer();
        return;
      }
      if (running) return;

      failureCount = 0;
      const elapsed = Date.now() - lastStartedAt;
      clearTimer();
      if (elapsed >= resumeMinGapMs) {
        void runPoll();
      } else {
        schedule(resumeMinGapMs - elapsed);
      }
    };

    const handleVisibilityChange = () => reconcileOnResume();
    const handleFocus = () => reconcileOnResume();
    const handleOnline = () => reconcileOnResume();
    const handleOffline = () => clearTimer();

    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("focus", handleFocus);
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    if (leading) {
      void runPoll();
    } else {
      schedule(intervalMs);
    }

    return () => {
      disposed = true;
      clearTimer();
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("focus", handleFocus);
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, [enabled, intervalMs, leading, maxIntervalMs, resumeMinGapMs]);
}
