import type { Metadata } from "next";
import products from "../../../data/products.json";
import ProductDetail from "./product-detail";

export const metadata: Metadata = {
  title: "Detail Produk",
  description: "Detail, foto, video, dan informasi produk BONBOX.",
};

export default async function ProductPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const seed = products.find((product) => product.id === id);
  const initialProduct = seed ? { ...seed, galleryUrls: [], videoUrl: "", description: "" } : null;
  return <ProductDetail productId={id} initialProduct={initialProduct} />;
}
