"use client";

import { useEffect, useMemo, useState } from "react";

export type Product = {
  id: string;
  slug: string;
  name: string;
  category: string;
  priceLabel: string;
  salesLabel: string;
  store: string;
  commissionRate: string;
  commissionLabel: string;
  productUrl: string;
  affiliateUrl: string;
  imageUrl: string;
  featured: boolean;
};

const PAGE_SIZE = 20;

function rupiahLabel(label: string) {
  if (!label) return "Cek harga";
  return `Rp${label.replace("RB", " rb")}`;
}

function ProductImage({ product }: { product: Product }) {
  const [failed, setFailed] = useState(false);
  if (product.imageUrl && !failed) {
    return <img src={product.imageUrl} alt={product.name} loading="lazy" onError={() => setFailed(true)} />;
  }
  const initials = product.category.split(" ").map((word) => word[0]).join("").slice(0, 2);
  return (
    <div className="product-placeholder" aria-label="Gambar produk segera tersedia">
      <span>{initials}</span>
      <small>foto segera hadir</small>
    </div>
  );
}

export default function ProductCatalog({ initialProducts }: { initialProducts: Product[] }) {
  const [catalog, setCatalog] = useState(initialProducts);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("Semua");
  const [sort, setSort] = useState("popular");
  const [visible, setVisible] = useState(PAGE_SIZE);

  useEffect(() => {
    fetch("/api/products")
      .then((response) => response.json())
      .then((data) => {
        if (Array.isArray(data.products) && data.products.length) setCatalog(data.products);
      })
      .catch(() => undefined);
  }, []);

  const categories = useMemo(
    () => ["Semua", ...Array.from(new Set(catalog.map((product) => product.category))).sort()],
    [catalog],
  );

  const products = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    const filtered = catalog.filter((product) => {
      const matchesCategory = category === "Semua" || product.category === category;
      const matchesQuery = !normalized || `${product.name} ${product.store} ${product.category}`.toLowerCase().includes(normalized);
      return matchesCategory && matchesQuery;
    });
    if (sort === "commission") {
      return [...filtered].sort((a, b) => Number.parseFloat(b.commissionRate.replace(",", ".")) - Number.parseFloat(a.commissionRate.replace(",", ".")));
    }
    if (sort === "name") return [...filtered].sort((a, b) => a.name.localeCompare(b.name));
    return [...filtered].sort((a, b) => Number(b.featured) - Number(a.featured));
  }, [catalog, query, category, sort]);

  function chooseCategory(value: string) {
    setCategory(value);
    setVisible(PAGE_SIZE);
  }

  return (
    <main>
      <header className="site-header">
        <a className="brand" href="#top" aria-label="BONBOX beranda"><span>BON</span>BOX</a>
        <nav aria-label="Navigasi utama">
          <a href="#kategori">Kategori</a>
          <a href="#produk">Produk</a>
          <a href="#tentang">Tentang</a>
        </nav>
        <a className="header-cta" href="#produk">Belanja sekarang</a>
      </header>

      <section className="hero" id="top">
        <div className="hero-copy">
          <div className="eyebrow">BONBOX HOME LIVING</div>
          <h1>Rumah lebih rapi.<br /><em>Hidup lebih mudah.</em></h1>
          <p>Pilihan produk praktis untuk membersihkan, menyimpan, dan menikmati rumah—checkout aman langsung di Shopee.</p>
          <div className="search-box">
            <span aria-hidden="true">⌕</span>
            <input value={query} onChange={(event) => { setQuery(event.target.value); setVisible(PAGE_SIZE); }} placeholder="Cari pel, rak, tumbler..." aria-label="Cari produk" />
            <a href="#produk">Cari</a>
          </div>
          <div className="hero-proof"><b>{catalog.length}</b> produk pilihan <i /> <b>Checkout</b> di Shopee <i /> <b>Official</b> affiliate links</div>
        </div>
        <div className="hero-art" aria-label="Koleksi home living BONBOX">
          <div className="art-sun" />
          <div className="art-card card-a"><span>01</span><b>CLEAN</b><small>daily essentials</small></div>
          <div className="art-card card-b"><span>02</span><b>STORE</b><small>space savers</small></div>
          <div className="art-card card-c"><span>03</span><b>LIVE</b><small>simple comfort</small></div>
        </div>
      </section>

      <section className="category-section" id="kategori">
        <div className="section-heading"><div><small>JELAJAHI</small><h2>Belanja per kategori</h2></div><p>Temukan kebutuhan rumah tanpa harus menggulir terlalu jauh.</p></div>
        <div className="category-row">
          {categories.map((item, index) => (
            <button className={category === item ? "category active" : "category"} onClick={() => chooseCategory(item)} key={item}>
              <span>{String(index + 1).padStart(2, "0")}</span><b>{item}</b><small>{item === "Semua" ? catalog.length : catalog.filter((p) => p.category === item).length} produk</small>
            </button>
          ))}
        </div>
      </section>

      <section className="products-section" id="produk">
        <div className="section-heading products-heading">
          <div><small>KATALOG PILIHAN</small><h2>{category === "Semua" ? "Produk populer" : category}</h2></div>
          <select value={sort} onChange={(event) => setSort(event.target.value)} aria-label="Urutkan produk">
            <option value="popular">Paling populer</option>
            <option value="commission">Komisi tertinggi</option>
            <option value="name">Nama A–Z</option>
          </select>
        </div>
        {products.length ? (
          <>
            <div className="product-grid">
              {products.slice(0, visible).map((product) => (
                <article className="product-card" key={product.id}>
                  <div className="image-wrap"><ProductImage product={product} />{product.featured && <span className="badge">Pilihan</span>}</div>
                  <div className="product-body">
                    <div className="product-meta"><span>{product.category}</span><span>{product.salesLabel} terjual</span></div>
                    <h3>{product.name}</h3>
                    <p className="store-name">{product.store}</p>
                    <div className="product-footer"><div><small>Mulai</small><strong>{rupiahLabel(product.priceLabel)}</strong></div><a href={product.affiliateUrl} target="_blank" rel="sponsored noopener">Beli di Shopee <span>↗</span></a></div>
                  </div>
                </article>
              ))}
            </div>
            {visible < products.length && <button className="load-more" onClick={() => setVisible((current) => current + PAGE_SIZE)}>Tampilkan lebih banyak <span>↓</span></button>}
          </>
        ) : <div className="empty-state"><b>Produk tidak ditemukan</b><p>Coba kata pencarian atau kategori lain.</p></div>}
      </section>

      <section className="about-strip" id="tentang"><div><small>KENAPA BONBOX?</small><h2>Kurasi yang berguna,<br />bukan sekadar ramai.</h2></div><div className="benefit"><b>01</b><span><strong>Praktis setiap hari</strong><small>Produk dipilih untuk pekerjaan rumah yang nyata.</small></span></div><div className="benefit"><b>02</b><span><strong>Belanja tanpa ragu</strong><small>Transaksi dan pengiriman ditangani Shopee.</small></span></div></section>

      <footer><a className="brand footer-brand" href="#top"><span>BON</span>BOX</a><p>Make life easy.</p><div><a href="#produk">Katalog</a><a href="/admin">Admin</a></div><small>Harga dan ketersediaan mengikuti halaman Shopee.</small></footer>
    </main>
  );
}
