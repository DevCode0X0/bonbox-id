import type { MetadataRoute } from "next";
import { getSitemapProducts } from "../lib/product-server";

const SITE_URL = "https://bonbox.id";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const products = await getSitemapProducts();
  return [
    {
      url: SITE_URL,
      changeFrequency: "daily",
      priority: 1,
    },
    ...products.map((product) => ({
      url: `${SITE_URL}/produk/${product.id}`,
      ...(product.updatedAt ? { lastModified: product.updatedAt } : {}),
      changeFrequency: "weekly" as const,
      priority: 0.8,
      ...(product.images.length ? { images: product.images } : {}),
    })),
  ];
}
