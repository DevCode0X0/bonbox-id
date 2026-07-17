"use client";

import { useEffect, useMemo, useState } from "react";
import type { Product } from "../product-catalog";

type Status = { kind: "info" | "success" | "error"; text: string };
type EditableField = "imageUrl" | "videoUrl" | "description" | "category";

export default function AdminProducts({ initialProducts }: { initialProducts: Product[] }) {
  const [products, setProducts] = useState(initialProducts);
  const [token, setToken] = useState("");
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<Status>({ kind: "info", text: "Masukkan kunci admin, lalu pilih produk yang ingin diedit." });

  useEffect(() => {
    fetch("/api/products").then((response) => response.json()).then((data) => {
      if (data.products) setProducts(data.products);
    }).catch(() => undefined);
  }, []);

  const filtered = useMemo(() => {
    const keyword = query.trim().toLowerCase();
    if (!keyword) return products;
    return products.filter((product) => `${product.name} ${product.id} ${product.category}`.toLowerCase().includes(keyword));
  }, [products, query]);

  function updateProduct(id: string, field: EditableField, value: string) {
    setProducts((current) => current.map((product) => product.id === id ? { ...product, [field]: value } : product));
  }

  function updateGallery(id: string, value: string) {
    const galleryUrls = value.split(/\r?\n/).map((url) => url.trim()).filter(Boolean);
    setProducts((current) => current.map((product) => product.id === id ? { ...product, galleryUrls } : product));
  }

  async function save(product: Product) {
    setStatus({ kind: "info", text: `Menyimpan ${product.id}...` });
    const response = await fetch("/api/products", {
      method: "PUT",
      headers: { "content-type": "application/json", "x-admin-token": token },
      body: JSON.stringify({
        id: product.id,
        imageUrl: product.imageUrl,
        galleryUrls: product.galleryUrls,
        videoUrl: product.videoUrl,
        description: product.description,
        category: product.category,
      }),
    });
    const data = await response.json();
    setStatus(response.ok ? { kind: "success", text: `Produk ${product.id} berhasil disimpan.` } : { kind: "error", text: data.error ?? "Gagal menyimpan perubahan." });
  }

  return (
    <main className="admin-page">
      <div className="admin-panel">
        <div className="admin-top"><a className="brand" href="/"><span>BON</span>BOX</a><a href="/">← Lihat katalog</a></div>
        <div className="admin-intro">
          <div><div className="eyebrow">BACKEND KATALOG</div><h1>Kelola produk</h1><p>Tambahkan feature image, galeri foto, video, dan deskripsi. Gunakan satu URL HTTPS per baris untuk galeri.</p></div>
          <div className="token-box"><input type="password" value={token} onChange={(event) => setToken(event.target.value)} placeholder="Kunci admin" aria-label="Kunci admin" /><button type="button" onClick={() => setStatus({ kind: "info", text: token ? "Kunci siap digunakan." : "Kunci masih kosong." })}>Gunakan</button></div>
        </div>
        <p className={`admin-status ${status.kind}`}>{status.text}</p>
        <div className="admin-search"><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Cari nama, ID, atau kategori..." aria-label="Cari produk admin" /><span>{filtered.length} produk</span></div>
        <div className="admin-editors">
          {filtered.map((product) => (
            <details className="admin-product-editor" key={product.id}>
              <summary><span className="admin-thumb">{product.imageUrl ? <img src={product.imageUrl} alt="" /> : product.category.slice(0, 2).toUpperCase()}</span><span><small>{product.id} · {product.category}</small><b>{product.name}</b></span><em>{product.imageUrl ? "Media tersedia" : "Belum ada gambar"}</em></summary>
              <div className="editor-form">
                <label><span>Kategori</span><input value={product.category} onChange={(event) => updateProduct(product.id, "category", event.target.value)} /></label>
                <label className="wide"><span>Feature image</span><input value={product.imageUrl} onChange={(event) => updateProduct(product.id, "imageUrl", event.target.value)} placeholder="https://...webp" /></label>
                <label className="wide"><span>Galeri foto <small>satu URL per baris</small></span><textarea rows={5} value={product.galleryUrls.join("\n")} onChange={(event) => updateGallery(product.id, event.target.value)} placeholder={"https://...foto-2.webp\nhttps://...foto-3.webp"} /></label>
                <label className="wide"><span>Video produk</span><input value={product.videoUrl} onChange={(event) => updateProduct(product.id, "videoUrl", event.target.value)} placeholder="https://...video.mp4" /></label>
                <label className="wide"><span>Deskripsi produk</span><textarea rows={6} value={product.description} onChange={(event) => updateProduct(product.id, "description", event.target.value)} placeholder="Tuliskan manfaat, bahan, ukuran, dan cara penggunaan..." /></label>
                <div className="editor-actions"><a href={`/produk/${product.id}`} target="_blank" rel="noopener">Preview halaman detail ↗</a><button className="save-button" type="button" onClick={() => save(product)}>Simpan perubahan</button></div>
              </div>
            </details>
          ))}
        </div>
      </div>
    </main>
  );
}
