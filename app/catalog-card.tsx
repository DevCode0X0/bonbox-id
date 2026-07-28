import { formatRupiahLabel } from "../lib/format-rupiah";
import type { ServerProduct } from "../lib/product-server";

export default function CatalogCard({ product }: { product: ServerProduct }) {
  const initials = product.category
    .split(" ")
    .map((word) => word[0])
    .join("")
    .slice(0, 2);

  return (
    <article className="product-card">
      <div className="image-wrap">
        <a
          className="product-image-link"
          href={`/produk/${product.id}`}
          aria-label={`Lihat detail ${product.name}`}
        >
          {product.imageUrl ? (
            <img src={product.imageUrl} alt={product.name} loading="lazy" />
          ) : (
            <div className="product-placeholder" aria-label="Gambar produk segera tersedia">
              <span>{initials}</span>
              <small>foto segera hadir</small>
            </div>
          )}
        </a>
        {product.featured && <span className="badge">Pilihan</span>}
      </div>
      <div className="product-body">
        <div className="product-meta">
          <span>{product.category}</span>
          <span>{product.salesLabel} terjual</span>
        </div>
        <h3><a href={`/produk/${product.id}`}>{product.name}</a></h3>
        <p className="store-name">{product.store}</p>
        <div className="product-footer">
          <div><small>Mulai</small><strong>{formatRupiahLabel(product.priceLabel)}</strong></div>
          <a href={`/produk/${product.id}`}>Lihat detail <span>→</span></a>
        </div>
      </div>
    </article>
  );
}
