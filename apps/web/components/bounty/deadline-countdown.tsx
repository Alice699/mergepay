"use client";

import { useEffect, useState } from "react";
import { formatTimeRemaining } from "@/lib/bounty-presentation";

export function DeadlineCountdown({ deadlineUnixMs }: Readonly<{ deadlineUnixMs: bigint }>) {
  const [now, setNow] = useState<number | null>(null);

  useEffect(() => {
    // Display only: transaction guards continue to use the protocol deadline.
    const update = () => {
      const current = Date.now();
      setNow(current);
      if (BigInt(current) >= deadlineUnixMs) window.clearInterval(interval);
    };
    const initial = window.setTimeout(update, 0);
    const interval = window.setInterval(update, 1_000);
    return () => {
      window.clearTimeout(initial);
      window.clearInterval(interval);
    };
  }, [deadlineUnixMs]);

  return <span className="bounty-countdown" data-urgent={now !== null && deadlineUnixMs - BigInt(now) <= 300_000n}>{now === null ? "Reading time…" : formatTimeRemaining(deadlineUnixMs, now)}</span>;
}
