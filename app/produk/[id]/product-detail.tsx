"use client";

import { useEffect, useMemo, useState } from "react";
import type { Product } from "../../product-catalog";
import { formatRupiahLabel } from "../../../lib/format-rupiah";
import Brand from "../../brand";

export default function ProductDetail({ productId, initialProduct }: { productId: string; initialProduct: Product | null }) {
  const [product, setProduct] = useState<Product | null>(initialProduct);
  const [activeImage, setActiveImage] = useState(initialProduct?.imageUrl ?? "");
  const [imageFailed, setImageFailed] = useState(false);

  useEffect(() => {
    fetch(`/api/products?id=${encodeURIComponent(productId)}`)
      .then((response) => response.json())
      .then((data) => {
        if (data.product) {
          setProduct(data.product);
          setActiveImage(data.product.imageUrl || data.product.galleryUrls?.[0] || "");
          setImageFailed(false);
        }
      })
      .catch(() => undefined);
  }, [productId]);

  const images = useMemo(() => product ? [product.imageUrl, ...(product.galleryUrls ?? [])].filter((url, index, all) => url && all.indexOf(url) === index) : [], [product]);

  if (!product) {
    return <main className="detail-missing"><Brand /><h1>Produk tidak ditemukan</h1><a href="/#produk">Kembali ke katalog</a></main>;
  }

  return (
    <main className="detail-page">
      <header className="site-header detail-header"><Brand /><a className="back-link" href="/#produk">← Kembali ke katalog</a><a className="header-cta" href={product.affiliateUrl} target="_blank" rel="sponsored noopener">Beli di Shopee</a></header>
      <div className="breadcrumbs"><a href="/">Beranda</a><span>/</span><a href="/#kategori">{product.category}</a><span>/</span><b>{product.id}</b></div>
      <section className="detail-hero">
        <div className="media-gallery">
          <div className="feature-media">
            {activeImage && !imageFailed ? <img src={activeImage} alt={product.name} onError={() => setImageFailed(true)} /> : <div className="detail-placeholder"><span>{product.category.slice(0, 2).toUpperCase()}</span><p>Feature image belum tersedia</p></div>}
          </div>
          {images.length > 0 && <div className="thumbnail-row">{images.map((url, index) => <button className={activeImage === url ? "active" : ""} key={url} onClick={() => { setActiveImage(url); setImageFailed(false); }} aria-label={`Tampilkan foto ${index + 1}`}><img src={url} alt="" /></button>)}</div>}
        </div>
        <div className="detail-copy">
          <div className="detail-label">{product.category} · {product.salesLabel} terjual</div>
          <h1>{product.name}</h1>
          <p className="detail-store">Dijual oleh <b>{product.store}</b></p>
          <div className="detail-price"><small>Harga mulai</small><strong>{formatRupiahLabel(product.priceLabel)}</strong><span>Harga dapat berubah di Shopee</span></div>
          <div className="detail-highlights"><div><b>✓</b><span><strong>Checkout aman</strong><small>Transaksi diselesaikan di Shopee</small></span></div><div><b>↗</b><span><strong>Link affiliate resmi</strong><small>Anda tetap mendapat layanan dari toko</small></span></div></div>
          <a className="shopee-button" href={product.affiliateUrl} target="_blank" rel="sponsored noopener">Lanjutkan beli di Shopee <span>↗</span></a>
          <p className="affiliate-note">BONBOX.id dapat menerima komisi dari transaksi yang memenuhi ketentuan, tanpa menambah harga belanja Anda.</p>
        </div>
      </section>

      <section className="detail-content">
        <div><div className="eyebrow">TENTANG PRODUK</div><h2>Detail dan kegunaan</h2></div>
        <div className="description-copy">{product.description ? product.description.split(/\r?\n/).map((paragraph, index) => paragraph && <p key={index}>{paragraph}</p>) : <p>Deskripsi produk belum diisi. Informasi lengkap sementara dapat dilihat pada halaman Shopee.</p>}</div>
      </section>

      {product.videoUrl && <section className="video-section"><div><div className="eyebrow">VIDEO PRODUK</div><h2>Lihat produknya beraksi</h2></div><video controls preload="metadata" src={product.videoUrl}>Browser Anda tidak mendukung video.</video></section>}

      <section className="detail-bottom-cta"><div><small>SUDAH YAKIN?</small><h2>Lengkapi rumahmu<br />dengan BONBOX.</h2></div><a href={product.affiliateUrl} target="_blank" rel="sponsored noopener">Beli produk ini di Shopee <span>↗</span></a></section>
      <footer><Brand className="footer-brand" /><p>Make life easy.</p><div><a href="/#produk">Katalog</a><a href="/admin">Admin</a></div><small>Harga dan ketersediaan mengikuti halaman Shopee.</small></footer>
    </main>
  );
}
