"use client";

import { useEffect, useState } from "react";

const MAX_DEADLINE_RECHECK_MS = 60_000;

export function useDeadlinePassed(deadlineUnixMs: bigint): boolean {
  const [passed, setPassed] = useState(false);

  useEffect(() => {
    let timer: number | null = null;

    const readDeadline = () => {
      const remaining = deadlineUnixMs - BigInt(Date.now());
      if (remaining < 0n) {
        setPassed(true);
        return;
      }

      setPassed(false);
      timer = window.setTimeout(
        readDeadline,
        Math.min(Number(remaining) + 100, MAX_DEADLINE_RECHECK_MS),
      );
    };

    timer = window.setTimeout(readDeadline, 0);
    return () => {
      if (timer !== null) window.clearTimeout(timer);
    };
  }, [deadlineUnixMs]);

  return passed;
}
