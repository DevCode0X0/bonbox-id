import type { Metadata } from "next";
import products from "../../../data/products.json";
import ProductDetail from "./product-detail";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const product = products.find((item) => item.id === id);
  if (!product) return { title: "Produk tidak ditemukan" };

  const description = `${product.category} pilihan dari ${product.store}. Lihat detail produk dan lanjutkan pembelian dengan aman di Shopee.`;
  return {
    title: product.name,
    description,
    alternates: { canonical: `/produk/${product.id}` },
    openGraph: {
      title: product.name,
      description,
      url: `/produk/${product.id}`,
      siteName: "BONBOX",
      locale: "id_ID",
      type: "website",
      images: [{
        url: "/og.png",
        width: 1731,
        height: 909,
        alt: "BONBOX — Rumah lebih rapi. Hidup lebih mudah.",
      }],
    },
    twitter: {
      card: "summary_large_image",
      title: product.name,
      description,
      images: ["/og.png"],
    },
  };
}

export default async function ProductPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const seed = products.find((product) => product.id === id);
  const initialProduct = seed ? { ...seed, galleryUrls: [], videoUrl: "", description: "" } : null;
  return <ProductDetail productId={id} initialProduct={initialProduct} />;
}
