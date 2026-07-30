function decodeHtml(value) {
  return String(value || "")
    .replaceAll("&amp;", "&")
    .replaceAll("&quot;", "\"")
    .replaceAll("&#39;", "'")
    .replaceAll("\\u002F", "/")
    .replaceAll("\\/", "/");
}

export function cleanShopeeDescription(value) {
  const source = decodeHtml(value)
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/\r\n?/g, "\n");
  const excludedLine = [
    /\bunboxing\b/i,
    /\bkomplain\b/i,
    /\bcomplain\b/i,
    /\bgaransi\b/i,
    /\bwajib\b/i,
    /\bcheckout\b/i,
    /\bcheck\s*out\b/i,
    /\brefund\b/i,
    /\bretur\b/i,
    /\bpengembalian\b/i,
    /\bpenukaran\b/i,
    /\bklaim\b/i,
    /\bclaim\b/i,
    /\bbukti\s+video\b/i,
    /\brekam(?:an)?\s+video\b/i,
    /\bvideo\s+(?:bukti|pembukaan|paket)\b/i,
    /\bsalah\s+kirim\b/i,
    /\bbarang\s+(?:rusak|kurang)\b/i,
    /\bpesanan\s+(?:rusak|kurang)\b/i,
    /\bchat\s+(?:admin|toko|seller)\b/i,
    /\bsyarat\s+dan\s+ketentuan\b/i,
  ];
  const policyHeading = /^(?:n\.?\s*b\.?|note|catatan|perhatian|penting|ketentuan|syarat\s+komplain)\s*:?\s*$/i;
  const output = [];
  let skippingPolicyBlock = false;

  for (const rawLine of source.split("\n")) {
    const line = rawLine.replace(/\s+/g, " ").trim();
    if (!line) {
      skippingPolicyBlock = false;
      if (output.length && output.at(-1) !== "") output.push("");
      continue;
    }
    if (policyHeading.test(line)) {
      skippingPolicyBlock = true;
      continue;
    }
    if (skippingPolicyBlock || excludedLine.some((pattern) => pattern.test(line))) continue;
    output.push(line);
  }

  return output.join("\n").replace(/\n{3,}/g, "\n\n").trim().slice(0, 20000);
}
