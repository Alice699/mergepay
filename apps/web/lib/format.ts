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
    .replace(/0+$/, "")
    .slice(0, 6);
  return `${negative ? "-" : ""}${whole}${fraction ? `.${fraction}` : ""}`;
}
