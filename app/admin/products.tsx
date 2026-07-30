"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import type { Product } from "../product-catalog";
import Brand from "../brand";

type Status = { kind: "info" | "success" | "error"; text: string };
type EditableField = "imageUrl" | "videoUrl" | "description" | "category";
type CsvProductUpdate = Pick<Product, "id" | "name" | "priceLabel" | "salesLabel" | "store" | "commissionRate" | "commissionLabel" | "productUrl" | "affiliateUrl">;

const CSV_FIELDS = {
  id: "ID Produk",
  name: "Nama Produk",
  priceLabel: "Harga",
  salesLabel: "Penjualan",
  store: "Nama Toko",
  commissionRate: "Komisi hingga",
  commissionLabel: "Komisi",
  productUrl: "Link Produk",
  affiliateUrl: "Link Komisi Ekstra",
} as const;

const ADMIN_PAGE_SIZE = 20;

function parseCsv(text: string) {
  const rows: string[][] = [];
  let row: string[] = [];
  let value = "";
  let quoted = false;
  const source = text.replace(/^\uFEFF/, "");

  for (let index = 0; index < source.length; index += 1) {
    const character = source[index];
    const next = source[index + 1];
    if (character === '"' && quoted && next === '"') {
      value += '"';
      index += 1;
    } else if (character === '"') {
      quoted = !quoted;
    } else if (character === "," && !quoted) {
      row.push(value);
      value = "";
    } else if ((character === "\n" || character === "\r") && !quoted) {
      if (character === "\r" && next === "\n") index += 1;
      row.push(value);
      if (row.some((cell) => cell.trim())) rows.push(row);
      row = [];
      value = "";
    } else {
      value += character;
    }
  }
  if (value || row.length) {
    row.push(value);
    if (row.some((cell) => cell.trim())) rows.push(row);
  }
  return rows;
}

function readShopeeCsv(text: string): CsvProductUpdate[] {
  const [headerRow, ...records] = parseCsv(text);
  if (!headerRow) throw new Error("CSV kosong atau tidak dapat dibaca.");
  const headers = headerRow.map((header) => header.trim());
  const missing = Object.values(CSV_FIELDS).filter((field) => !headers.includes(field));
  if (missing.length) throw new Error(`Kolom CSV tidak lengkap: ${missing.join(", ")}.`);

  const unique = new Map<string, CsvProductUpdate>();
  for (const record of records) {
    const source = Object.fromEntries(headers.map((header, column) => [header, record[column]?.trim() ?? ""]));
    const product = Object.fromEntries(Object.entries(CSV_FIELDS).map(([field, header]) => [field, source[header] ?? ""])) as CsvProductUpdate;
    if (product.id) unique.set(product.id, product);
  }
  return [...unique.values()];
}

function csvProductChanged(product: Product, update: CsvProductUpdate) {
  return (Object.keys(CSV_FIELDS) as Array<keyof CsvProductUpdate>).some((field) => product[field] !== update[field]);
}

function createGalleryDrafts(products: Product[]) {
  return Object.fromEntries(products.map((product) => [product.id, product.galleryUrls.join("\n")]));
}

export default function AdminProducts({ initialProducts }: { initialProducts: Product[] }) {
  const [products, setProducts] = useState(initialProducts);
  const [galleryDrafts, setGalleryDrafts] = useState<Record<string, string>>(() => createGalleryDrafts(initialProducts));
  const [token, setToken] = useState("");
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [shopeeUrl, setShopeeUrl] = useState("");
  const [newProductCategory, setNewProductCategory] = useState("Home Living");
  const [newProductPrice, setNewProductPrice] = useState("");
  const [newProductSales, setNewProductSales] = useState("");
  const [addingProduct, setAddingProduct] = useState(false);
  const [csvFileName, setCsvFileName] = useState("");
  const [csvProducts, setCsvProducts] = useState<CsvProductUpdate[]>([]);
  const [syncingCsv, setSyncingCsv] = useState(false);
  const [status, setStatus] = useState<Status>({ kind: "info", text: "Masukkan kunci admin, lalu pilih produk yang ingin diedit." });

  useEffect(() => {
    fetch("/api/products").then((response) => response.json()).then((data) => {
      if (data.products) {
        setProducts(data.products);
        setGalleryDrafts(createGalleryDrafts(data.products));
      }
    }).catch(() => undefined);
  }, []);

  const filtered = useMemo(() => {
    const keyword = query.trim().toLowerCase();
    if (!keyword) return products;
    return products.filter((product) => `${product.name} ${product.id} ${product.category}`.toLowerCase().includes(keyword));
  }, [products, query]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / ADMIN_PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const visibleProducts = useMemo(
    () => filtered.slice((currentPage - 1) * ADMIN_PAGE_SIZE, currentPage * ADMIN_PAGE_SIZE),
    [currentPage, filtered],
  );
  const paginationItems = useMemo(() => {
    if (totalPages <= 7) return Array.from({ length: totalPages }, (_, index) => index + 1);
    const pages = [...new Set([1, totalPages, currentPage - 1, currentPage, currentPage + 1])]
      .filter((item) => item >= 1 && item <= totalPages)
      .sort((a, b) => a - b);
    return pages.flatMap((item, index) => {
      const previous = pages[index - 1];
      return previous && item - previous > 1 ? ["ellipsis", item] : [item];
    });
  }, [currentPage, totalPages]);

  const csvPreview = useMemo(() => {
    const productById = new Map(products.map((product) => [product.id, product]));
    const matched = csvProducts.filter((update) => productById.has(update.id));
    const changed = matched.filter((update) => csvProductChanged(productById.get(update.id)!, update));
    const priceChanges = changed.filter((update) => productById.get(update.id)!.priceLabel !== update.priceLabel).map((update) => ({
      id: update.id,
      name: update.name,
      from: productById.get(update.id)!.priceLabel,
      to: update.priceLabel,
    }));
    return { matched, changed, priceChanges, newProducts: csvProducts.length - matched.length };
  }, [csvProducts, products]);

  function updateProduct(id: string, field: EditableField, value: string) {
    setProducts((current) => current.map((product) => product.id === id ? { ...product, [field]: value } : product));
  }

  function updateGallery(id: string, value: string) {
    setGalleryDrafts((current) => ({ ...current, [id]: value }));
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

  function goToPage(target: number) {
    setPage(Math.min(Math.max(target, 1), totalPages));
    window.requestAnimationFrame(() => {
      document.querySelector(".admin-search")?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }

  async function addShopeeProduct(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!token) {
      setStatus({ kind: "error", text: "Masukkan kunci admin sebelum menambahkan produk." });
      return;
    }
    if (!shopeeUrl.trim()) {
      setStatus({ kind: "error", text: "Tempel link produk atau link affiliate Shopee." });
      return;
    }
    if (!newProductPrice.trim()) {
      setStatus({ kind: "error", text: "Masukkan harga yang terlihat di halaman Shopee." });
      return;
    }

    setAddingProduct(true);
    setStatus({ kind: "info", text: "Membaca produk Shopee dan menyalin fotonya..." });
    try {
      const response = await fetch("/api/products", {
        method: "POST",
        headers: { "content-type": "application/json", "x-admin-token": token },
        body: JSON.stringify({
          url: shopeeUrl.trim(),
          category: newProductCategory.trim(),
          priceLabel: newProductPrice.trim(),
          salesLabel: newProductSales.trim(),
        }),
      });
      const data = await response.json();
      if (!response.ok) {
        setStatus({ kind: "error", text: data.error ?? "Produk gagal ditambahkan." });
        if (data.id) setQuery(String(data.id));
        return;
      }

      const refreshed = await fetch("/api/products").then((result) => result.json());
      if (Array.isArray(refreshed.products)) {
        setProducts(refreshed.products);
        setGalleryDrafts(createGalleryDrafts(refreshed.products));
      }
      const productId = String(data.product?.id ?? "");
      setShopeeUrl("");
      setNewProductPrice("");
      setNewProductSales("");
      if (productId) setQuery(productId);
      setStatus({
        kind: "success",
        text: data.mediaSynced
          ? `Produk ${productId} berhasil ditambahkan beserta fotonya.`
          : `Produk ${productId} berhasil ditambahkan. ${data.warning || "Foto akan dilengkapi otomatis."}`,
      });
    } catch {
      setStatus({ kind: "error", text: "Produk gagal ditambahkan karena koneksi terputus. Silakan coba lagi." });
    } finally {
      setAddingProduct(false);
    }
  }

  async function selectCsv(file?: File) {
    if (!file) return;
    try {
      const parsed = readShopeeCsv(await file.text());
      setCsvFileName(file.name);
      setCsvProducts(parsed);
      setStatus({ kind: "success", text: `${parsed.length} baris CSV berhasil dibaca. Periksa ringkasan sebelum menerapkan.` });
    } catch (error) {
      setCsvFileName("");
      setCsvProducts([]);
      setStatus({ kind: "error", text: error instanceof Error ? error.message : "CSV tidak dapat dibaca." });
    }
  }

  async function applyCsv() {
    if (!token) {
      setStatus({ kind: "error", text: "Masukkan kunci admin sebelum menerapkan CSV." });
      return;
    }
    if (!csvPreview.changed.length) {
      setStatus({ kind: "info", text: "Tidak ada perubahan pada produk yang sudah tersimpan." });
      return;
    }

    setSyncingCsv(true);
    setStatus({ kind: "info", text: `Memperbarui ${csvPreview.changed.length} produk...` });
    try {
      const response = await fetch("/api/products", {
        method: "PATCH",
        headers: { "content-type": "application/json", "x-admin-token": token },
        body: JSON.stringify({ products: csvPreview.changed }),
      });
      const data = await response.json();
      if (!response.ok) {
        setStatus({ kind: "error", text: data.error ?? "Pembaruan CSV gagal." });
        return;
      }
      const refreshed = await fetch("/api/products").then((result) => result.json());
      if (Array.isArray(refreshed.products)) {
        setProducts(refreshed.products);
        setGalleryDrafts(createGalleryDrafts(refreshed.products));
      }
      setStatus({ kind: "success", text: `${data.updated} produk berhasil diperbarui. ${data.skipped ? `${data.skipped} ID tidak ditemukan dan dilewati.` : "Media manual tetap dipertahankan."}` });
    } catch {
      setStatus({ kind: "error", text: "Pembaruan gagal karena koneksi terputus. Silakan coba lagi." });
    } finally {
      setSyncingCsv(false);
    }
  }

  return (
    <main className="admin-page">
      <div className="admin-panel">
        <div className="admin-top"><Brand /><Link href="/">← Lihat katalog</Link></div>
        <div className="admin-intro">
          <div><div className="eyebrow">BACKEND KATALOG</div><h1>Kelola produk</h1><p>Tambahkan feature image, galeri foto, video, dan deskripsi. Gunakan satu URL HTTPS per baris untuk galeri.</p></div>
          <div className="token-box"><input type="password" value={token} onChange={(event) => setToken(event.target.value)} placeholder="Kunci admin" aria-label="Kunci admin" /><button type="button" onClick={() => setStatus({ kind: "info", text: token ? "Kunci siap digunakan." : "Kunci masih kosong." })}>Gunakan</button></div>
        </div>
        <p className={`admin-status ${status.kind}`}>{status.text}</p>
        <section className="link-import-panel" aria-labelledby="link-import-title">
          <div className="link-import-copy">
            <span className="eyebrow">TAMBAH PRODUK</span>
            <h2 id="link-import-title">Tambah dari link Shopee</h2>
            <p>Tempel link affiliate atau link produk. Nama, toko, dan foto dibaca otomatis; masukkan harga yang tampil di Shopee agar katalog langsung lengkap.</p>
          </div>
          <form className="link-import-form" onSubmit={addShopeeProduct}>
            <label className="link-field"><span>Link Shopee</span><input type="url" value={shopeeUrl} onChange={(event) => setShopeeUrl(event.target.value)} placeholder="https://s.shopee.co.id/..." required /></label>
            <label className="category-field"><span>Kategori</span><input value={newProductCategory} onChange={(event) => setNewProductCategory(event.target.value)} placeholder="Home Living" /></label>
            <label className="price-field"><span>Harga</span><input value={newProductPrice} onChange={(event) => setNewProductPrice(event.target.value)} placeholder="91.665" inputMode="numeric" required /></label>
            <label className="sales-field"><span>Terjual</span><input value={newProductSales} onChange={(event) => setNewProductSales(event.target.value)} placeholder="3" inputMode="numeric" /></label>
            <button className="save-button" type="submit" disabled={addingProduct}>{addingProduct ? "Menambahkan..." : "Tambah produk"}</button>
          </form>
          <small className="link-import-note">Link yang ditempel akan digunakan untuk tombol pembelian. Gunakan link affiliate agar komisi tetap tercatat.</small>
        </section>
        <section className="csv-sync-panel" aria-labelledby="csv-sync-title">
          <div className="csv-sync-heading">
            <div><span className="eyebrow">SINKRONISASI SHOPEE</span><h2 id="csv-sync-title">Perbarui data dari CSV</h2><p>Harga, penjualan, komisi, toko, dan link akan diperbarui berdasarkan ID. Media dan deskripsi manual tidak disentuh.</p></div>
            <label className="csv-file-button">Pilih CSV Shopee<input type="file" accept=".csv,text/csv" onChange={(event) => selectCsv(event.target.files?.[0])} /></label>
          </div>
          {csvProducts.length > 0 && <div className="csv-preview">
            <div className="csv-preview-summary">
              <strong>{csvFileName}</strong>
              <span>{csvProducts.length} baris</span><span>{csvPreview.matched.length} ID cocok</span><span>{csvPreview.changed.length} berubah</span><span>{csvPreview.priceChanges.length} harga berubah</span>
              {csvPreview.newProducts > 0 && <span>{csvPreview.newProducts} produk baru dilewati</span>}
            </div>
            {csvPreview.priceChanges.length > 0 && <div className="csv-price-changes">
              {csvPreview.priceChanges.slice(0, 8).map((change) => <div key={change.id}><span><small>{change.id}</small><b>{change.name}</b></span><em>{change.from || "—"} → {change.to || "—"}</em></div>)}
              {csvPreview.priceChanges.length > 8 && <p>+ {csvPreview.priceChanges.length - 8} perubahan harga lainnya</p>}
            </div>}
            <div className="csv-sync-actions"><small>Periksa jumlah perubahan, lalu terapkan menggunakan kunci admin.</small><button className="save-button" type="button" disabled={syncingCsv || !csvPreview.changed.length} onClick={applyCsv}>{syncingCsv ? "Memperbarui..." : `Terapkan ${csvPreview.changed.length} perubahan`}</button></div>
          </div>}
        </section>
        <div className="admin-search"><input value={query} onChange={(event) => { setQuery(event.target.value); setPage(1); }} placeholder="Cari nama, ID, atau kategori..." aria-label="Cari produk admin" /><span>{filtered.length} produk · Halaman {currentPage}/{totalPages}</span></div>
        <div className="admin-editors">
          {visibleProducts.map((product) => (
            <details className="admin-product-editor" key={product.id}>
              <summary><span className="admin-thumb">{product.imageUrl ? <img src={product.imageUrl} alt="" /> : product.category.slice(0, 2).toUpperCase()}</span><span><small>{product.id} · {product.category}</small><b>{product.name}</b></span><em>{product.imageUrl ? "Media tersedia" : "Belum ada gambar"}</em></summary>
              <div className="editor-form">
                <label><span>Kategori</span><input value={product.category} onChange={(event) => updateProduct(product.id, "category", event.target.value)} /></label>
                <label className="wide"><span>Feature image</span><input value={product.imageUrl} onChange={(event) => updateProduct(product.id, "imageUrl", event.target.value)} placeholder="https://...webp" /></label>
                <label className="wide"><span>Galeri foto <small>satu URL per baris</small></span><textarea rows={5} value={galleryDrafts[product.id] ?? product.galleryUrls.join("\n")} onChange={(event) => updateGallery(product.id, event.target.value)} placeholder={"https://...foto-2.webp\nhttps://...foto-3.webp"} /></label>
                <label className="wide"><span>Video produk</span><input value={product.videoUrl} onChange={(event) => updateProduct(product.id, "videoUrl", event.target.value)} placeholder="https://...video.mp4" /></label>
                <label className="wide"><span>Deskripsi produk</span><textarea rows={6} value={product.description} onChange={(event) => updateProduct(product.id, "description", event.target.value)} placeholder="Tuliskan manfaat, bahan, ukuran, dan cara penggunaan..." /></label>
                <div className="editor-actions"><a href={`/produk/${product.id}`} target="_blank" rel="noopener">Preview halaman detail ↗</a><button className="save-button" type="button" onClick={() => save(product)}>Simpan perubahan</button></div>
              </div>
            </details>
          ))}
          {!visibleProducts.length && <div className="admin-empty"><b>Produk tidak ditemukan</b><span>Coba nama, ID, atau kategori lain.</span></div>}
        </div>
        {filtered.length > ADMIN_PAGE_SIZE && (
          <nav className="admin-pagination" aria-label="Halaman daftar produk admin">
            <button type="button" onClick={() => goToPage(currentPage - 1)} disabled={currentPage === 1}>← Sebelumnya</button>
            <div>
              {paginationItems.map((item, index) => item === "ellipsis"
                ? <span className="admin-page-ellipsis" key={`ellipsis-${index}`}>…</span>
                : <button type="button" className={item === currentPage ? "active" : ""} aria-current={item === currentPage ? "page" : undefined} onClick={() => goToPage(item)} key={item}>{item}</button>)}
            </div>
            <button type="button" onClick={() => goToPage(currentPage + 1)} disabled={currentPage === totalPages}>Berikutnya →</button>
          </nav>
        )}
      </div>
    </main>
  );
}
