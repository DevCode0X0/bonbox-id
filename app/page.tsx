import type { Metadata } from "next";
import ProductCatalog from "./product-catalog";
import products from "../data/products.json";

export const metadata: Metadata = {
  title: "BONBOX — Home living pilihan untuk hidup lebih mudah",
  description: "Temukan produk home living BONBOX dan lanjutkan pembelian dengan aman di Shopee.",
};

export default function Home() {
  return <ProductCatalog initialProducts={products} />;
}
