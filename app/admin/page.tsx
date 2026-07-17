import type { Metadata } from "next";
import AdminProducts from "./products";
import products from "../../data/products.json";

export const metadata: Metadata = { title: "Admin Produk" };

export default function AdminPage() {
  const catalog = products.map((product) => ({ ...product, galleryUrls: [], videoUrl: "", description: "" }));
  return <AdminProducts initialProducts={catalog} />;
}
