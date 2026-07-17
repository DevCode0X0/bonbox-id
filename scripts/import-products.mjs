import fs from "node:fs";
import path from "node:path";

const input = process.argv[2];
const output = process.argv[3] ?? "data/products.json";

if (!input) {
  throw new Error("Usage: node scripts/import-products.mjs <input.csv> [output.json]");
}

function parseCsv(text) {
  const rows = [];
  let row = [];
  let value = "";
  let quoted = false;

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    const next = text[i + 1];
    if (char === '"' && quoted && next === '"') {
      value += '"';
      i += 1;
    } else if (char === '"') {
      quoted = !quoted;
    } else if (char === "," && !quoted) {
      row.push(value);
      value = "";
    } else if ((char === "\n" || char === "\r") && !quoted) {
      if (char === "\r" && next === "\n") i += 1;
      row.push(value);
      if (row.some((cell) => cell !== "")) rows.push(row);
      row = [];
      value = "";
    } else {
      value += char;
    }
  }
  if (value || row.length) {
    row.push(value);
    rows.push(row);
  }
  return rows;
}

function inferCategory(name) {
  const text = name.toLowerCase();
  if (/pel|sapu|sikat|kemoceng|pembersih|vacuum|sampah/.test(text)) return "Kebersihan";
  if (/rak|gantungan|organizer|storage|box|lemari/.test(text)) return "Penyimpanan";
  if (/tumbler|botol|minum|termos|gelas/.test(text)) return "Botol & Tumbler";
  if (/dapur|wajan|panci|pisau|kitchen|makan|sendok/.test(text)) return "Dapur";
  if (/kasur|bantal|bedcover|seprai|handuk/.test(text)) return "Kamar & Tekstil";
  if (/lampu|elektrik|charger|kipas|speaker/.test(text)) return "Elektronik";
  return "Home Living";
}

const text = fs.readFileSync(input, "utf8").replace(/^\uFEFF/, "");
const [headers, ...records] = parseCsv(text);
const products = records.map((record, index) => {
  const source = Object.fromEntries(headers.map((header, column) => [header.trim(), record[column]?.trim() ?? ""]));
  return {
    id: source["ID Produk"],
    slug: `${source["ID Produk"]}-${index + 1}`,
    name: source["Nama Produk"],
    priceLabel: source.Harga,
    salesLabel: source.Penjualan,
    store: source["Nama Toko"],
    commissionRate: source["Komisi hingga"],
    commissionLabel: source.Komisi,
    productUrl: source["Link Produk"],
    affiliateUrl: source["Link Komisi Ekstra"],
    imageUrl: "",
    category: inferCategory(source["Nama Produk"]),
    featured: index < 12,
  };
});

fs.mkdirSync(path.dirname(output), { recursive: true });
fs.writeFileSync(output, `${JSON.stringify(products, null, 2)}\n`);
console.log(`Imported ${products.length} products to ${output}`);
