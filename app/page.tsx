import type { Metadata } from "next";
import ProductCatalog from "./product-catalog";
import products from "../data/products.json";

export const metadata: Metadata = {
  title: "Home living pilihan untuk hidup lebih mudah",
  description: "Temukan produk home living BONBOX dan lanjutkan pembelian dengan aman di Shopee.",
};

export default function Home() {
  const catalog = products.map((product) => ({ ...product, galleryUrls: [], videoUrl: "", description: "" }));
  return <ProductCatalog initialProducts={catalog} />;
}
