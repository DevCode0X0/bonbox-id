export function parseRupiahValue(label: string) {
  const normalized = label.trim().toUpperCase().replace(/^RP\s*/, "");
  if (!normalized) return null;

  const compact = normalized.match(/^([\d.,]+)\s*(RB|JT)$/);
  if (compact) {
    const value = Number.parseFloat(compact[1].replace(/\./g, "").replace(",", "."));
    const multiplier = compact[2] === "JT" ? 1_000_000 : 1_000;
    if (Number.isFinite(value)) return Math.round(value * multiplier);
  }

  const digits = normalized.replace(/[^\d]/g, "");
  if (digits) return Number.parseInt(digits, 10);
  return null;
}

export function formatRupiahLabel(label: string) {
  const value = parseRupiahValue(label);
  if (value !== null) return `Rp ${value.toLocaleString("id-ID")}`;
  if (!label.trim()) return "Cek harga";
  return label;
}
