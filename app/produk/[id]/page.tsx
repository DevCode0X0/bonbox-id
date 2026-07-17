import type { Metadata } from "next";
import { parseRupiahValue } from "../../../lib/format-rupiah";
import { getProductById } from "../../../lib/product-server";
import ProductDetail from "./product-detail";

const SITE_URL = "https://bonbox.id";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const product = await getProductById(id);
  if (!product) return { title: "Produk tidak ditemukan" };

  const description = product.description || `${product.category} pilihan dari ${product.store}. Lihat detail produk dan lanjutkan pembelian dengan aman di Shopee.`;
  const productImages = [product.imageUrl, ...product.galleryUrls].filter(Boolean);
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
      images: productImages.length ? productImages.map((url) => ({ url, alt: product.name })) : [{ url: "/og.png", width: 1731, height: 909, alt: "BONBOX — Rumah lebih rapi. Hidup lebih mudah." }],
    },
    twitter: {
      card: "summary_large_image",
      title: product.name,
      description,
      images: productImages.length ? productImages : ["/og.png"],
    },
  };
}

export default async function ProductPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const product = await getProductById(id);
  if (!product) return <ProductDetail productId={id} initialProduct={null} />;

  const canonicalUrl = `${SITE_URL}/produk/${product.id}`;
  const price = parseRupiahValue(product.priceLabel);
  const images = [product.imageUrl, ...product.galleryUrls].filter((url, index, all) => url && all.indexOf(url) === index);
  const description = product.description || `${product.category} pilihan dari ${product.store}. Pembelian diselesaikan melalui Shopee.`;
  const productSchema = {
    "@context": "https://schema.org",
    "@type": "Product",
    "@id": `${canonicalUrl}#product`,
    name: product.name,
    description,
    sku: product.id,
    category: product.category,
    ...(images.length ? { image: images } : {}),
    ...(product.name.toUpperCase().includes("BONBOX") ? { brand: { "@type": "Brand", name: "BONBOX" } } : {}),
    ...(price !== null ? {
      offers: {
        "@type": "Offer",
        url: canonicalUrl,
        price,
        priceCurrency: "IDR",
        itemCondition: "https://schema.org/NewCondition",
        seller: { "@type": "Organization", name: product.store },
      },
    } : {}),
  };

  return <>
    <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(productSchema).replace(/</g, "\\u003c") }} />
    <ProductDetail productId={id} initialProduct={product} />
  </>;
}
