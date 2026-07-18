import type { Metadata } from "next";
import ProductCatalog from "./product-catalog";
import { getActiveProducts } from "../lib/product-server";

export const metadata: Metadata = {
  title: "Home living pilihan untuk hidup lebih mudah",
  description: "Temukan produk home living BONBOX dan lanjutkan pembelian dengan aman di Shopee.",
};

export default async function Home() {
  const catalog = await getActiveProducts();
  return <ProductCatalog initialProducts={catalog} />;
}
