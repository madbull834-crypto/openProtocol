export function shortAddress(value?: string) {
  return value ? `${value.slice(0, 6)}…${value.slice(-4)}` : "—";
}

export function formatToken(value?: bigint, decimals = 6) {
  if (value === undefined) return "—";
  const base = 10n ** BigInt(decimals);
  const whole = value / base;
  const fraction = (value % base).toString().padStart(decimals, "0").slice(0, 2);
  return `${whole.toLocaleString()}${fraction === "00" ? "" : `.${fraction}`}`;
}
