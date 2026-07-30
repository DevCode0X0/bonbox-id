import { env } from "cloudflare:workers";
import seedProducts from "../../../data/products.json";

type RuntimeEnv = { DB?: D1Database; ADMIN_TOKEN?: string };

type CsvProductUpdate = {
  id: string;
  name: string;
  priceLabel: string;
  salesLabel: string;
  store: string;
  commissionRate: string;
  commissionLabel: string;
  productUrl: string;
  affiliateUrl: string;
};

type AddShopeeProductPayload = {
  url?: string;
  category?: string;
};

const BROWSER_USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/150 Safari/537.36";
const SOCIAL_USER_AGENT = "facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)";

function runtime() {
  return env as unknown as RuntimeEnv;
}

function decodeHtml(value: string) {
  return value
    .replaceAll("&amp;", "&")
    .replaceAll("&quot;", "\"")
    .replaceAll("&#39;", "'")
    .replaceAll("\\u002F", "/")
    .replaceAll("\\/", "/");
}

function validShopeeHost(hostname: string) {
  return hostname === "shopee.co.id" || hostname.endsWith(".shopee.co.id");
}

function productIds(value: string) {
  try {
    const url = new URL(value);
    if (!validShopeeHost(url.hostname)) return null;
    const match = url.pathname.match(/\/(?:product|opaanlp)\/(\d+)\/(\d+)/i)
      || url.pathname.match(/-i\.(\d+)\.(\d+)/i);
    return match ? { shopId: match[1], itemId: match[2] } : null;
  } catch {
    return null;
  }
}

async function resolveShopeeUrl(value: string) {
  let current = value;
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const ids = productIds(current);
    if (ids) return { ...ids, resolvedUrl: current };

    const url = new URL(current);
    if (url.protocol !== "https:" || !validShopeeHost(url.hostname)) {
      throw new Error("Link harus berasal dari Shopee Indonesia.");
    }

    const response = await fetch(current, {
      headers: { "user-agent": BROWSER_USER_AGENT, accept: "text/html,*/*" },
      redirect: "manual",
    });
    const location = response.headers.get("location");
    if (!location) throw new Error("Tujuan link Shopee tidak dapat ditemukan.");
    current = new URL(location, current).toString();
  }
  throw new Error("Link Shopee memiliki terlalu banyak pengalihan.");
}

function canonicalImageUrl(value: string) {
  const normalized = decodeHtml(value).trim().replace(/^http:\/\//i, "https://");
  try {
    const url = new URL(normalized);
    if (url.protocol !== "https:" || !url.hostname.endsWith(".susercontent.com")) return "";
    const match = normalized.match(/^(https:\/\/[^/]+\/file\/[^@?]+)/i);
    return match ? `${match[1].replace(/\.webp$/i, "")}.webp` : normalized;
  } catch {
    return "";
  }
}

function metaContent(html: string, key: string) {
  const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return decodeHtml(
    html.match(new RegExp(`<meta[^>]+(?:property|name)=["']${escaped}["'][^>]+content=["']([^"']*)`, "i"))?.[1]
      || html.match(new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]+(?:property|name)=["']${escaped}["']`, "i"))?.[1]
      || "",
  );
}

async function readShopeeProduct(shopId: string, itemId: string) {
  const productUrl = `https://shopee.co.id/product/${shopId}/${itemId}`;
  const [response, shopResponse] = await Promise.all([
    fetch(productUrl, {
      headers: {
        "user-agent": SOCIAL_USER_AGENT,
        accept: "text/html,application/xhtml+xml",
        "accept-language": "id-ID,id;q=0.9,en;q=0.7",
      },
      redirect: "follow",
    }),
    fetch(`https://shopee.co.id/api/v4/shop/get_shop_detail?shopid=${shopId}`, {
      headers: {
        "user-agent": SOCIAL_USER_AGENT,
        accept: "application/json",
        referer: productUrl,
      },
    }),
  ]);
  if (!response.ok) throw new Error(`Shopee merespons ${response.status}. Silakan coba lagi.`);

  const html = await response.text();
  let store = "Shopee";
  if (shopResponse.ok) {
    try {
      const shop = await shopResponse.json() as { data?: { name?: string } };
      const shopName = String(shop.data?.name ?? "").trim();
      if (shopName) {
        store = shopName === shopName.toUpperCase()
          ? shopName.toLowerCase().replace(/\b\p{L}/gu, (letter) => letter.toUpperCase())
          : shopName;
      }
    } catch {
      store = "Shopee";
    }
  }
  const title = metaContent(html, "og:title")
    .replace(/^Jual\s+/i, "")
    .replace(/\s+\|\s+Shopee Indonesia\s*$/i, "")
    .trim();
  const ogImage = canonicalImageUrl(metaContent(html, "og:image"));
  const rawImages = [...html.matchAll(/https?:\/\/[^"'<> ]+\/file\/(?:id|sg)-111342(?:01|07)-[a-zA-Z0-9_-]+(?:@[^"'<> ]+)?/gi)]
    .map((match) => canonicalImageUrl(match[0]))
    .filter(Boolean);
  const images = [...new Set([ogImage, ...rawImages].filter(Boolean))].slice(0, 10);

  return {
    itemId,
    name: title || `Produk Shopee ${itemId}`,
    store,
    productUrl,
    images,
  };
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
  const seedImage = seedProducts.find((product) => String(product.id) === String(row.id))?.imageUrl ?? "";
  return {
    id: String(row.id), slug: String(row.id), name: String(row.name), category: String(row.category),
    priceLabel: String(row.price_label), salesLabel: String(row.sales_label), store: String(row.store),
    commissionRate: String(row.commission_rate), commissionLabel: String(row.commission_label),
    productUrl: String(row.product_url), affiliateUrl: String(row.affiliate_url), imageUrl: String(row.image_url) || seedImage,
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

export async function POST(request: Request) {
  const { DB, ADMIN_TOKEN } = runtime();
  if (!DB) return Response.json({ error: "Database belum aktif." }, { status: 503 });
  if (!ADMIN_TOKEN || request.headers.get("x-admin-token") !== ADMIN_TOKEN) {
    return Response.json({ error: "Kunci admin tidak valid." }, { status: 401 });
  }

  let payload: AddShopeeProductPayload;
  try {
    payload = await request.json() as AddShopeeProductPayload;
  } catch {
    return Response.json({ error: "Data link tidak valid." }, { status: 400 });
  }

  const submittedUrl = String(payload.url ?? "").trim().slice(0, 2000);
  if (!submittedUrl) return Response.json({ error: "Link Shopee wajib diisi." }, { status: 400 });
  try {
    const parsed = new URL(submittedUrl);
    if (parsed.protocol !== "https:" || !validShopeeHost(parsed.hostname)) {
      return Response.json({ error: "Gunakan link HTTPS dari Shopee Indonesia." }, { status: 400 });
    }
  } catch {
    return Response.json({ error: "Format link Shopee tidak valid." }, { status: 400 });
  }

  try {
    const resolved = await resolveShopeeUrl(submittedUrl);
    const shopee = await readShopeeProduct(resolved.shopId, resolved.itemId);
    await ensureProducts(DB);

    const existing = await DB.prepare("SELECT id FROM products WHERE id = ?").bind(shopee.itemId).first<{ id: string }>();
    if (existing) {
      return Response.json({ error: `Produk ${shopee.itemId} sudah ada di katalog.`, id: shopee.itemId }, { status: 409 });
    }

    const category = String(payload.category ?? "").trim().slice(0, 120) || "Home Living";
    const now = new Date().toISOString();
    await DB.prepare(`INSERT INTO products
      (id, name, category, price_label, sales_label, store, commission_rate, commission_label, product_url, affiliate_url, image_url, gallery_urls, video_url, description, featured, active, updated_at)
      VALUES (?, ?, ?, '', '', ?, '', '', ?, ?, '', '[]', '', '', 0, 1, ?)`)
      .bind(shopee.itemId, shopee.name, category, shopee.store, shopee.productUrl, submittedUrl, now)
      .run();

    let mediaSynced = false;
    let mediaWarning = "";
    if (shopee.images.length) {
      try {
        const mediaResponse = await fetch(new URL("/api/automation/media-sync", request.url), {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "x-automation-token": ADMIN_TOKEN,
          },
          body: JSON.stringify({ id: shopee.itemId, imageUrls: shopee.images, videoUrls: [], store: shopee.store }),
        });
        mediaSynced = mediaResponse.ok;
        if (!mediaResponse.ok) mediaWarning = "Produk tersimpan, tetapi media akan dilengkapi oleh n8n.";
      } catch {
        mediaWarning = "Produk tersimpan, tetapi media akan dilengkapi oleh n8n.";
      }
    }

    const row = await DB.prepare("SELECT * FROM products WHERE id = ?").bind(shopee.itemId).first<Record<string, unknown>>();
    return Response.json({
      ok: true,
      product: row ? mapProduct(row) : null,
      mediaSynced,
      warning: mediaWarning,
    }, { status: 201 });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Produk Shopee gagal dibaca." }, { status: 422 });
  }
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

export async function PATCH(request: Request) {
  const { DB, ADMIN_TOKEN } = runtime();
  if (!DB) return Response.json({ error: "Database belum aktif." }, { status: 503 });
  if (!ADMIN_TOKEN || request.headers.get("x-admin-token") !== ADMIN_TOKEN) {
    return Response.json({ error: "Kunci admin tidak valid." }, { status: 401 });
  }

  let payload: { products?: CsvProductUpdate[] };
  try {
    payload = await request.json() as { products?: CsvProductUpdate[] };
  } catch {
    return Response.json({ error: "Data CSV tidak valid." }, { status: 400 });
  }

  if (!Array.isArray(payload.products) || !payload.products.length) {
    return Response.json({ error: "Tidak ada pembaruan produk untuk diterapkan." }, { status: 400 });
  }
  if (payload.products.length > 500) {
    return Response.json({ error: "Maksimal 500 produk dalam sekali pembaruan." }, { status: 400 });
  }

  const uniqueProducts = new Map<string, CsvProductUpdate>();
  for (const product of payload.products) {
    const normalized = {
      id: String(product.id ?? "").trim().slice(0, 80),
      name: String(product.name ?? "").trim().slice(0, 1000),
      priceLabel: String(product.priceLabel ?? "").trim().slice(0, 80),
      salesLabel: String(product.salesLabel ?? "").trim().slice(0, 80),
      store: String(product.store ?? "").trim().slice(0, 300),
      commissionRate: String(product.commissionRate ?? "").trim().slice(0, 80),
      commissionLabel: String(product.commissionLabel ?? "").trim().slice(0, 80),
      productUrl: String(product.productUrl ?? "").trim().slice(0, 2000),
      affiliateUrl: String(product.affiliateUrl ?? "").trim().slice(0, 2000),
    };
    if (!normalized.id || !normalized.name) {
      return Response.json({ error: "Setiap baris CSV harus memiliki ID dan nama produk." }, { status: 400 });
    }
    if (!/^https:\/\//i.test(normalized.productUrl) || !/^https:\/\//i.test(normalized.affiliateUrl)) {
      return Response.json({ error: `Link produk ${normalized.id} harus menggunakan HTTPS.` }, { status: 400 });
    }
    uniqueProducts.set(normalized.id, normalized);
  }

  await ensureProducts(DB);
  const products = [...uniqueProducts.values()];
  const now = new Date().toISOString();
  let updated = 0;

  for (let offset = 0; offset < products.length; offset += 50) {
    const chunk = products.slice(offset, offset + 50);
    const results = await DB.batch(chunk.map((product) => DB.prepare(`UPDATE products SET
      name = ?, price_label = ?, sales_label = ?, store = ?, commission_rate = ?, commission_label = ?, product_url = ?, affiliate_url = ?, updated_at = ?
      WHERE id = ?`)
      .bind(product.name, product.priceLabel, product.salesLabel, product.store, product.commissionRate, product.commissionLabel, product.productUrl, product.affiliateUrl, now, product.id)));
    updated += results.reduce((total, result) => total + Number(result.meta.changes ?? 0), 0);
  }

  return Response.json({ ok: true, received: products.length, updated, skipped: products.length - updated, updatedAt: now });
}
