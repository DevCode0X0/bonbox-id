export function formatRupiahLabel(label: string) {
  const normalized = label.trim().toUpperCase().replace(/^RP\s*/, "");
  if (!normalized) return "Cek harga";

  const compact = normalized.match(/^([\d.,]+)\s*(RB|JT)$/);
  if (compact) {
    const value = Number.parseFloat(compact[1].replace(/\./g, "").replace(",", "."));
    const multiplier = compact[2] === "JT" ? 1_000_000 : 1_000;
    if (Number.isFinite(value)) {
      return `Rp ${Math.round(value * multiplier).toLocaleString("id-ID")}`;
    }
  }

  const digits = normalized.replace(/[^\d]/g, "");
  if (digits) return `Rp ${Number.parseInt(digits, 10).toLocaleString("id-ID")}`;
  return label;
}
