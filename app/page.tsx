import type { Metadata } from "next";
import ProductCatalog from "./product-catalog";
import { getActiveProducts } from "../lib/product-server";

export const metadata: Metadata = {
  title: "Home living pilihan untuk hidup lebih mudah",
  description: "Temukan produk home living BONBOX dan lanjutkan pembelian dengan aman di Shopee.",
};

function pickRandomHeroProducts<T extends { imageUrl: string }>(products: T[], limit = 3) {
  const candidates = products.filter((product) => product.imageUrl);

  for (let index = candidates.length - 1; index > 0; index -= 1) {
    const randomIndex = Math.floor(Math.random() * (index + 1));
    [candidates[index], candidates[randomIndex]] = [candidates[randomIndex], candidates[index]];
  }

  return candidates.slice(0, limit);
}

export default async function Home() {
  const catalog = await getActiveProducts();
  const initialHeroProducts = pickRandomHeroProducts(catalog);
  return <ProductCatalog initialProducts={catalog} initialHeroProducts={initialHeroProducts} />;
}
