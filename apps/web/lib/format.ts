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
    "Asia/Ujung_Pandang": "WITA",
    "Asia/Jayapura": "WIT",
    "Asia/Pontianak": "WIB",
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

function validDate(value: Date | number): Date | null {
  const date = value instanceof Date ? value : new Date(value);
  return Number.isFinite(date.getTime()) ? date : null;
}

export function formatLocalDate(value: Date | number): string {
  const date = validDate(value);
  if (!date) return "Time unavailable";

  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(date);
}

export function formatLocalDateTime(
  value: Date | number,
  includeSeconds = false,
): string {
  const date = validDate(value);
  if (!date) return "Time unavailable";

  const formatted = new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    month: "short",
    ...(includeSeconds ? { second: "2-digit" } : {}),
    year: "numeric",
  }).format(date);
  return `${formatted} ${formatTimeZoneLabel(date)}`;
}

export function formatLocalTime(
  value: Date | number,
  includeSeconds = true,
): string {
  const date = validDate(value);
  if (!date) return "Time unavailable";

  const formatted = new Intl.DateTimeFormat("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    ...(includeSeconds ? { second: "2-digit" } : {}),
  }).format(date);
  return `${formatted} ${formatTimeZoneLabel(date)}`;
}

export function formatDeadline(deadlineUnixMs: bigint): string {
  const date = validDateFromUnixMs(deadlineUnixMs);
  if (!date) return "Unavailable";

  return formatLocalDateTime(date);
}

export function formatDeadlineDate(deadlineUnixMs: bigint): string {
  const date = validDateFromUnixMs(deadlineUnixMs);
  if (!date) return "Unavailable";

  return `${formatLocalDate(date)} ${formatTimeZoneLabel(date)}`;
}
