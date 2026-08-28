export function shortenAddress(value: string, edgeLength = 4): string {
  if (value.length <= edgeLength * 2 + 1) {
    return value;
  }

  return `${value.slice(0, edgeLength)}…${value.slice(-edgeLength)}`;
}
