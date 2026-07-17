import { env } from "cloudflare:workers";
import seedProducts from "../../../data/products.json";

type RuntimeEnv = { DB?: D1Database; ADMIN_TOKEN?: string };

function runtime() {
  return env as unknown as RuntimeEnv;
}

async function ensureProducts(db: D1Database) {
  await db.prepare(`CREATE TABLE IF NOT EXISTS products (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    category TEXT NOT NULL DEFAULT 'Home Living',
    price_label TEXT NOT NULL DEFAULT '',
    sales_label TEXT NOT NULL DEFAULT '',
    store TEXT NOT NULL DEFAULT '',
    commission_rate TEXT NOT NULL DEFAULT '',
    commission_label TEXT NOT NULL DEFAULT '',
    product_url TEXT NOT NULL,
    affiliate_url TEXT NOT NULL,
    image_url TEXT NOT NULL DEFAULT '',
    gallery_urls TEXT NOT NULL DEFAULT '[]',
    video_url TEXT NOT NULL DEFAULT '',
    description TEXT NOT NULL DEFAULT '',
    featured INTEGER NOT NULL DEFAULT 0,
    active INTEGER NOT NULL DEFAULT 1,
    updated_at TEXT NOT NULL
  )`).run();
  const columns = await db.prepare("PRAGMA table_info(products)").all<{ name: string }>();
  const columnNames = new Set(columns.results.map((column) => column.name));
  if (!columnNames.has("gallery_urls")) await db.prepare("ALTER TABLE products ADD COLUMN gallery_urls TEXT NOT NULL DEFAULT '[]'").run();
  if (!columnNames.has("video_url")) await db.prepare("ALTER TABLE products ADD COLUMN video_url TEXT NOT NULL DEFAULT ''").run();
  if (!columnNames.has("description")) await db.prepare("ALTER TABLE products ADD COLUMN description TEXT NOT NULL DEFAULT ''").run();
  await db.prepare("CREATE INDEX IF NOT EXISTS products_category_idx ON products(category)").run();

  const count = await db.prepare("SELECT COUNT(*) AS total FROM products").first<{ total: number }>();
  if (!count?.total) {
    const now = new Date().toISOString();
    const inserts = seedProducts.map((product) => db.prepare(`INSERT OR IGNORE INTO products
      (id, name, category, price_label, sales_label, store, commission_rate, commission_label, product_url, affiliate_url, image_url, gallery_urls, video_url, description, featured, active, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, '[]', '', '', ?, 1, ?)`)
      .bind(product.id, product.name, product.category, product.priceLabel, product.salesLabel, product.store, product.commissionRate, product.commissionLabel, product.productUrl, product.affiliateUrl, product.imageUrl, product.featured ? 1 : 0, now));
    await db.batch(inserts);
  }
}

function mapProduct(row: Record<string, unknown>) {
  let galleryUrls: string[] = [];
  try { galleryUrls = JSON.parse(String(row.gallery_urls ?? "[]")); } catch { galleryUrls = []; }
  return {
    id: String(row.id), slug: String(row.id), name: String(row.name), category: String(row.category),
    priceLabel: String(row.price_label), salesLabel: String(row.sales_label), store: String(row.store),
    commissionRate: String(row.commission_rate), commissionLabel: String(row.commission_label),
    productUrl: String(row.product_url), affiliateUrl: String(row.affiliate_url), imageUrl: String(row.image_url),
    galleryUrls, videoUrl: String(row.video_url ?? ""), description: String(row.description ?? ""),
    featured: Boolean(row.featured), active: Boolean(row.active), updatedAt: String(row.updated_at),
  };
}

export async function GET(request: Request) {
  const requestedId = new URL(request.url).searchParams.get("id");
  const { DB } = runtime();
  if (!DB) {
    const fallback = seedProducts.map((product) => ({ ...product, galleryUrls: [], videoUrl: "", description: "" }));
    if (requestedId) return Response.json({ product: fallback.find((product) => product.id === requestedId) ?? null, source: "seed" });
    return Response.json({ products: fallback, source: "seed" });
  }
  await ensureProducts(DB);
  if (requestedId) {
    const row = await DB.prepare("SELECT * FROM products WHERE id = ? AND active = 1").bind(requestedId).first<Record<string, unknown>>();
    return Response.json({ product: row ? mapProduct(row) : null, source: "database" }, { status: row ? 200 : 404 });
  }
  const result = await DB.prepare("SELECT * FROM products WHERE active = 1 ORDER BY featured DESC, rowid ASC").all<Record<string, unknown>>();
  return Response.json({ products: result.results.map(mapProduct), source: "database" });
}

export async function PUT(request: Request) {
  const { DB, ADMIN_TOKEN } = runtime();
  if (!DB) return Response.json({ error: "Database belum aktif." }, { status: 503 });
  if (!ADMIN_TOKEN || request.headers.get("x-admin-token") !== ADMIN_TOKEN) {
    return Response.json({ error: "Kunci admin tidak valid." }, { status: 401 });
  }
  const payload = await request.json() as { id?: string; imageUrl?: string; galleryUrls?: string[]; videoUrl?: string; description?: string; category?: string };
  if (!payload.id) return Response.json({ error: "ID produk wajib diisi." }, { status: 400 });
  const imageUrl = payload.imageUrl?.trim() ?? "";
  if (imageUrl && !/^https:\/\//i.test(imageUrl)) return Response.json({ error: "URL gambar harus menggunakan HTTPS." }, { status: 400 });
  const galleryUrls = (payload.galleryUrls ?? []).map((url) => url.trim()).filter(Boolean);
  const invalidGalleryUrl = galleryUrls.find((url) => !/^https:\/\//i.test(url));
  if (invalidGalleryUrl) return Response.json({ error: "Semua URL galeri harus menggunakan HTTPS." }, { status: 400 });
  const videoUrl = payload.videoUrl?.trim() ?? "";
  if (videoUrl && !/^https:\/\//i.test(videoUrl)) return Response.json({ error: "URL video harus menggunakan HTTPS." }, { status: 400 });
  await ensureProducts(DB);
  const result = await DB.prepare("UPDATE products SET image_url = ?, gallery_urls = ?, video_url = ?, description = ?, category = COALESCE(NULLIF(?, ''), category), updated_at = ? WHERE id = ?")
    .bind(imageUrl, JSON.stringify(galleryUrls), videoUrl, payload.description?.trim() ?? "", payload.category?.trim() ?? "", new Date().toISOString(), payload.id).run();
  if (!result.meta.changes) return Response.json({ error: "Produk tidak ditemukan." }, { status: 404 });
  return Response.json({ ok: true });
}
