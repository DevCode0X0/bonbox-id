import { cache } from "react";
import { env } from "cloudflare:workers";
import seedProducts from "../data/products.json";

type RuntimeEnv = { DB?: D1Database };

export type ServerProduct = {
  id: string;
  slug: string;
  name: string;
  category: string;
  priceLabel: string;
  salesLabel: string;
  store: string;
  commissionRate: string;
  commissionLabel: string;
  productUrl: string;
  affiliateUrl: string;
  imageUrl: string;
  galleryUrls: string[];
  videoUrl: string;
  description: string;
  featured: boolean;
};

function fallbackProduct(id: string): ServerProduct | null {
  const product = seedProducts.find((item) => item.id === id);
  return product ? { ...product, galleryUrls: [], videoUrl: "", description: "" } : null;
}

function mapProduct(row: Record<string, unknown>): ServerProduct {
  let galleryUrls: string[] = [];
  try { galleryUrls = JSON.parse(String(row.gallery_urls ?? "[]")); } catch { galleryUrls = []; }
  return {
    id: String(row.id),
    slug: String(row.id),
    name: String(row.name),
    category: String(row.category),
    priceLabel: String(row.price_label),
    salesLabel: String(row.sales_label),
    store: String(row.store),
    commissionRate: String(row.commission_rate),
    commissionLabel: String(row.commission_label),
    productUrl: String(row.product_url),
    affiliateUrl: String(row.affiliate_url),
    imageUrl: String(row.image_url),
    galleryUrls,
    videoUrl: String(row.video_url ?? ""),
    description: String(row.description ?? ""),
    featured: Boolean(row.featured),
  };
}

export const getProductById = cache(async (id: string): Promise<ServerProduct | null> => {
  const { DB } = env as unknown as RuntimeEnv;
  if (!DB) return fallbackProduct(id);
  try {
    const row = await DB.prepare("SELECT * FROM products WHERE id = ? AND active = 1").bind(id).first<Record<string, unknown>>();
    return row ? mapProduct(row) : null;
  } catch {
    return fallbackProduct(id);
  }
});

export const getActiveProducts = cache(async (): Promise<ServerProduct[]> => {
  const fallback = seedProducts.map((product) => ({ ...product, galleryUrls: [], videoUrl: "", description: "" }));
  const { DB } = env as unknown as RuntimeEnv;
  if (!DB) return fallback;
  try {
    const result = await DB.prepare("SELECT * FROM products WHERE active = 1 ORDER BY featured DESC, rowid ASC").all<Record<string, unknown>>();
    return result.results.map(mapProduct);
  } catch {
    return fallback;
  }
});

export type SitemapProduct = {
  id: string;
  images: string[];
  updatedAt?: string;
};

export const getSitemapProducts = cache(async (): Promise<SitemapProduct[]> => {
  const fallback = seedProducts.map((product) => ({ id: product.id, images: product.imageUrl ? [product.imageUrl] : [] }));
  const { DB } = env as unknown as RuntimeEnv;
  if (!DB) return fallback;
  try {
    const result = await DB.prepare("SELECT id, image_url, gallery_urls, updated_at FROM products WHERE active = 1 ORDER BY rowid ASC").all<Record<string, unknown>>();
    return result.results.map((row) => {
      let galleryUrls: string[] = [];
      try { galleryUrls = JSON.parse(String(row.gallery_urls ?? "[]")); } catch { galleryUrls = []; }
      const images = [String(row.image_url ?? ""), ...galleryUrls].filter((url, index, all) => url && all.indexOf(url) === index);
      return { id: String(row.id), images, updatedAt: row.updated_at ? String(row.updated_at) : undefined };
    });
  } catch {
    return fallback;
  }
});
