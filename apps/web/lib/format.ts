export function shortenAddress(value: string, edgeLength = 4): string {
  if (value.length <= edgeLength * 2 + 1) {
    return value;
  }

  return `${value.slice(0, edgeLength)}…${value.slice(-edgeLength)}`;
}

export function formatRlo(kelvin: bigint): string {
  const negative = kelvin < 0n;
  const absolute = negative ? -kelvin : kelvin;
  const whole = absolute / 1_000_000_000n;
  const fraction = (absolute % 1_000_000_000n)
    .toString()
    .padStart(9, "0")
    .replace(/0+$/, "");
  return `${negative ? "-" : ""}${whole}${fraction ? `.${fraction}` : ""}`;
}

const KELVIN_PER_RLO = 1_000_000_000n;

/** Convert the human-facing RLO amount into the protocol's base unit. */
export function parseRloToKelvin(value: string): string {
  const normalized = value.trim().replace(",", ".");
  if (!/^(?:\d+)(?:\.\d{1,9})?$/.test(normalized)) {
    throw new Error("Enter a valid RLO amount, for example 0.001.");
  }

  const [wholePart = "0", fractionPart = ""] = normalized.split(".");
  const fraction = fractionPart.padEnd(9, "0");
  const kelvin =
    BigInt(wholePart) * KELVIN_PER_RLO + BigInt(fraction || "0");
  if (kelvin <= 0n) {
    throw new Error("Enter an amount greater than 0 RLO.");
  }

  return kelvin.toString();
}

function validDateFromUnixMs(value: bigint): Date | null {
  const date = new Date(Number(value));
  return Number.isFinite(date.getTime()) ? date : null;
}

export function formatTimeZoneLabel(date = new Date()): string {
  const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const namedZones: Record<string, string> = {
    "Asia/Jakarta": "WIB",
    "Asia/Makassar": "WITA",
    "Asia/Jayapura": "WIT",
    "Etc/UTC": "UTC",
    UTC: "UTC",
  };
  if (namedZones[timeZone]) return namedZones[timeZone];

  return (
    new Intl.DateTimeFormat("en-US", {
      timeZoneName: "short",
    })
      .formatToParts(date)
      .find((part) => part.type === "timeZoneName")?.value ?? timeZone
  );
}

export function formatDeadline(deadlineUnixMs: bigint): string {
  const date = validDateFromUnixMs(deadlineUnixMs);
  if (!date) return "Unavailable";

  const formatted = new Intl.DateTimeFormat("en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
  return `${formatted} ${formatTimeZoneLabel(date)}`;
}

export function formatDeadlineDate(deadlineUnixMs: bigint): string {
  const date = validDateFromUnixMs(deadlineUnixMs);
  if (!date) return "Unavailable";

  return `${new Intl.DateTimeFormat("en-GB", {
    dateStyle: "medium",
  }).format(date)} ${formatTimeZoneLabel(date)}`;
}
