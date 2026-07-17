"use client";

import { useEffect, useState } from "react";
import type { Product } from "../product-catalog";

type Status = { kind: "info" | "success" | "error"; text: string };

export default function AdminProducts({ initialProducts }: { initialProducts: Product[] }) {
  const [products, setProducts] = useState(initialProducts);
  const [token, setToken] = useState("");
  const [status, setStatus] = useState<Status>({ kind: "info", text: "Masukkan kunci admin untuk menyimpan perubahan URL gambar." });

  useEffect(() => {
    fetch("/api/products").then((response) => response.json()).then((data) => {
      if (data.products) setProducts(data.products);
    }).catch(() => undefined);
  }, []);

  function updateProduct(id: string, field: "imageUrl" | "category", value: string) {
    setProducts((current) => current.map((product) => product.id === id ? { ...product, [field]: value } : product));
  }

  async function save(product: Product) {
    setStatus({ kind: "info", text: `Menyimpan ${product.id}...` });
    const response = await fetch("/api/products", {
      method: "PUT",
      headers: { "content-type": "application/json", "x-admin-token": token },
      body: JSON.stringify({ id: product.id, imageUrl: product.imageUrl, category: product.category }),
    });
    const data = await response.json();
    setStatus(response.ok ? { kind: "success", text: "Perubahan berhasil disimpan." } : { kind: "error", text: data.error ?? "Gagal menyimpan perubahan." });
  }

  return (
    <main className="admin-page">
      <div className="admin-panel">
        <div className="admin-top"><a className="brand" href="/"><span>BON</span>BOX</a><a href="/">← Lihat katalog</a></div>
        <div className="admin-intro"><div><div className="eyebrow">BACKEND KATALOG</div><h1>Kelola produk</h1><p>Isi URL gambar HTTPS, ubah kategori bila diperlukan, lalu simpan per produk. Data akan tetap tersimpan di backend.</p></div><div className="token-box"><input type="password" value={token} onChange={(event) => setToken(event.target.value)} placeholder="Kunci admin" aria-label="Kunci admin" /><button type="button" onClick={() => setStatus({ kind: "info", text: token ? "Kunci siap digunakan." : "Kunci masih kosong." })}>Gunakan</button></div></div>
        <p className={`admin-status ${status.kind}`}>{status.text}</p>
        <div className="admin-table">
          <div className="admin-row header"><span>ID</span><span>Produk</span><span>Kategori</span><span>URL gambar</span><span>Aksi</span></div>
          {products.map((product) => <div className="admin-row" key={product.id}><span>{product.id.slice(-8)}</span><b>{product.name}</b><input value={product.category} onChange={(event) => updateProduct(product.id, "category", event.target.value)} aria-label={`Kategori ${product.name}`} /><input value={product.imageUrl} onChange={(event) => updateProduct(product.id, "imageUrl", event.target.value)} placeholder="https://..." aria-label={`URL gambar ${product.name}`} /><button className="save-button" type="button" onClick={() => save(product)}>Simpan</button></div>)}
        </div>
      </div>
    </main>
  );
}
