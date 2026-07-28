import type { MetadataRoute } from "next";
import { getActiveProducts, getSitemapProducts } from "../lib/product-server";
import { CATEGORY_PAGE_SIZE, categoryToSlug } from "../lib/product-categories";

const SITE_URL = "https://bonbox.id";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const [products, activeProducts] = await Promise.all([
    getSitemapProducts(),
    getActiveProducts(),
  ]);
  const categoryGroups = Array.from(
    activeProducts.reduce((groups, product) => {
      groups.set(product.category, (groups.get(product.category) ?? 0) + 1);
      return groups;
    }, new Map<string, number>()),
  );
  const categoryPages = categoryGroups.flatMap(([category, productCount]) => {
    const slug = categoryToSlug(category);
    const totalPages = Math.ceil(productCount / CATEGORY_PAGE_SIZE);
    return Array.from({ length: totalPages }, (_, index) => ({
      url: index === 0
        ? `${SITE_URL}/kategori/${slug}`
        : `${SITE_URL}/kategori/${slug}?page=${index + 1}`,
      changeFrequency: "weekly" as const,
      priority: index === 0 ? 0.9 : 0.7,
    }));
  });

  return [
    {
      url: SITE_URL,
      changeFrequency: "daily",
      priority: 1,
    },
    ...categoryPages,
    ...products.map((product) => ({
      url: `${SITE_URL}/produk/${product.id}`,
      ...(product.updatedAt ? { lastModified: product.updatedAt } : {}),
      changeFrequency: "weekly" as const,
      priority: 0.8,
      ...(product.images.length ? { images: product.images } : {}),
    })),
  ];
}
