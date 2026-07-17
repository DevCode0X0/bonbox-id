"use client";

import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent, type WheelEvent as ReactWheelEvent } from "react";
import type { Product } from "../../product-catalog";
import { formatRupiahLabel } from "../../../lib/format-rupiah";
import Brand from "../../brand";

export default function ProductDetail({ productId, initialProduct }: { productId: string; initialProduct: Product | null }) {
  const [product, setProduct] = useState<Product | null>(initialProduct);
  const [activeImage, setActiveImage] = useState(initialProduct?.imageUrl ?? "");
  const [imageFailed, setImageFailed] = useState(false);
  const [viewerOpen, setViewerOpen] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const gesture = useRef({ centerX: 0, centerY: 0, distance: 0, zoom: 1, x: 0, y: 0 });

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

  useEffect(() => {
    if (!viewerOpen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setViewerOpen(false);
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [viewerOpen]);

  const resetViewer = () => {
    pointers.current.clear();
    setZoom(1);
    setPosition({ x: 0, y: 0 });
  };

  const openViewer = () => {
    resetViewer();
    setViewerOpen(true);
  };

  const changeZoom = (nextZoom: number) => {
    const value = Math.min(4, Math.max(1, nextZoom));
    setZoom(value);
    if (value === 1) setPosition({ x: 0, y: 0 });
  };

  const beginGesture = () => {
    const points = [...pointers.current.values()];
    if (!points.length) return;
    const centerX = points.reduce((sum, point) => sum + point.x, 0) / points.length;
    const centerY = points.reduce((sum, point) => sum + point.y, 0) / points.length;
    const distance = points.length > 1 ? Math.hypot(points[0].x - points[1].x, points[0].y - points[1].y) : 0;
    gesture.current = { centerX, centerY, distance, zoom, x: position.x, y: position.y };
  };

  const handlePointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    event.currentTarget.setPointerCapture(event.pointerId);
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    beginGesture();
  };

  const handlePointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!pointers.current.has(event.pointerId)) return;
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    const points = [...pointers.current.values()];
    if (points.length > 1) {
      const centerX = (points[0].x + points[1].x) / 2;
      const centerY = (points[0].y + points[1].y) / 2;
      const distance = Math.hypot(points[0].x - points[1].x, points[0].y - points[1].y);
      const nextZoom = gesture.current.distance ? gesture.current.zoom * (distance / gesture.current.distance) : gesture.current.zoom;
      const constrainedZoom = Math.min(4, Math.max(1, nextZoom));
      setZoom(constrainedZoom);
      setPosition(constrainedZoom === 1 ? { x: 0, y: 0 } : { x: gesture.current.x + centerX - gesture.current.centerX, y: gesture.current.y + centerY - gesture.current.centerY });
    } else if (zoom > 1) {
      setPosition({ x: gesture.current.x + points[0].x - gesture.current.centerX, y: gesture.current.y + points[0].y - gesture.current.centerY });
    }
  };

  const handlePointerEnd = (event: ReactPointerEvent<HTMLDivElement>) => {
    pointers.current.delete(event.pointerId);
    if (pointers.current.size) beginGesture();
  };

  const handleWheel = (event: ReactWheelEvent<HTMLDivElement>) => {
    event.preventDefault();
    changeZoom(zoom + (event.deltaY < 0 ? 0.25 : -0.25));
  };

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
            {activeImage && !imageFailed ? <button className="feature-media-button" type="button" onClick={openViewer} aria-label="Buka foto dan perbesar"><img src={activeImage} alt={product.name} onError={() => setImageFailed(true)} /><span className="zoom-hint">⌕ Sentuh untuk zoom</span></button> : <div className="detail-placeholder"><span>{product.category.slice(0, 2).toUpperCase()}</span><p>Feature image belum tersedia</p></div>}
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
      {viewerOpen && activeImage && !imageFailed && <div className="image-viewer" role="dialog" aria-modal="true" aria-label="Perbesar foto produk">
        <div className="viewer-top"><span>Cubit untuk zoom · geser untuk melihat detail</span><button type="button" onClick={() => setViewerOpen(false)} aria-label="Tutup foto">×</button></div>
        <div className="zoom-stage" onPointerDown={handlePointerDown} onPointerMove={handlePointerMove} onPointerUp={handlePointerEnd} onPointerCancel={handlePointerEnd} onWheel={handleWheel} onDoubleClick={() => changeZoom(zoom > 1 ? 1 : 2)}>
          <img src={activeImage} alt={product.name} draggable={false} style={{ transform: `translate3d(${position.x}px, ${position.y}px, 0) scale(${zoom})` }} />
        </div>
        <div className="viewer-controls"><button type="button" onClick={() => changeZoom(zoom - 0.5)} aria-label="Perkecil foto">−</button><button type="button" onClick={resetViewer} aria-label="Reset zoom">{Math.round(zoom * 100)}%</button><button type="button" onClick={() => changeZoom(zoom + 0.5)} aria-label="Perbesar foto">+</button></div>
      </div>}
    </main>
  );
}
