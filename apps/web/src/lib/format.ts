export function formatAmount(value: string | bigint): string {
  const raw = typeof value === "bigint" ? value.toString(10) : value;
  const negative = raw.startsWith("-");
  const digits = negative ? raw.slice(1) : raw;
  const grouped = digits.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return negative ? `-${grouped}` : grouped;
}

export function shortAddress(address: string): string {
  if (address.length <= 12) {
    return address;
  }
  return `${address.slice(0, 4)}...${address.slice(-4)}`;
}

export function formatTimestamp(value: string | bigint): string {
  const seconds = Number(value);
  if (!Number.isFinite(seconds) || seconds <= 0) {
    return "—";
  }
  return new Date(seconds * 1000).toLocaleString();
}

export function statusLabel(status: number): string {
  switch (status) {
    case 0:
      return "Active";
    case 1:
      return "Cancelled";
    case 2:
      return "Completed";
    case 3:
      return "Expired";
    case 4:
      return "Clawed back";
    default:
      return `Status ${status}`;
  }
}

export function nowSeconds(): bigint {
  return BigInt(Math.floor(Date.now() / 1000));
}

export function parseWholeNumber(value: string, label: string): bigint {
  const trimmed = value.trim();
  if (!/^\d+$/.test(trimmed)) {
    throw new Error(`${label} must be a non-negative whole number`);
  }
  return BigInt(trimmed);
}
