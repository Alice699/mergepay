"use client";

import { useState } from "react";
import { Check, CircleAlert, Copy } from "lucide-react";
import { shortenAddress } from "@/lib/format";

export function CopyValue({ value }: Readonly<{ value: string }>) {
  const [status, setStatus] = useState<"idle" | "copied" | "error">("idle");
  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setStatus("copied");
    } catch {
      setStatus("error");
    }
    window.setTimeout(() => setStatus("idle"), 1600);
  }
  return (
    <button
      aria-label={`Copy ${value}`}
      className="copy-value mono"
      data-status={status}
      onClick={copy}
      type="button"
      title={value}
    >
      <span>{shortenAddress(value, 7)}</span>
      <span aria-live="polite" className="copy-value__action">
        {status === "copied" ? (
          <Check aria-hidden="true" size={13} />
        ) : status === "error" ? (
          <CircleAlert aria-hidden="true" size={13} />
        ) : (
          <Copy aria-hidden="true" size={13} />
        )}
        {status === "copied" ? "Copied" : status === "error" ? "Unavailable" : "Copy"}
      </span>
    </button>
  );
}
