import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import Brand from "../../brand";
import CatalogCard from "../../catalog-card";
import { getActiveProducts } from "../../../lib/product-server";
import {
  CATEGORY_PAGE_SIZE,
  categoryToSlug,
  getCategoryDescription,
} from "../../../lib/product-categories";

type CategoryPageProps = {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ page?: string | string[] }>;
};

async function getCategory(slug: string) {
  const products = await getActiveProducts();
  const category = Array.from(new Set(products.map((product) => product.category)))
    .find((name) => categoryToSlug(name) === slug);

  return {
    category,
    products: category ? products.filter((product) => product.category === category) : [],
    categories: Array.from(new Set(products.map((product) => product.category))).sort(),
  };
}

function parsePage(value: string | string[] | undefined) {
  const rawValue = Array.isArray(value) ? value[0] : value;
  const page = Number.parseInt(rawValue ?? "1", 10);
  return Number.isInteger(page) && page > 0 ? page : 1;
}

export async function generateMetadata({
  params,
  searchParams,
}: CategoryPageProps): Promise<Metadata> {
  const [{ slug }, query] = await Promise.all([params, searchParams]);
  const { category } = await getCategory(slug);
  if (!category) return { title: "Kategori tidak ditemukan" };

  const page = parsePage(query.page);
  const canonical = page === 1 ? `/kategori/${slug}` : `/kategori/${slug}?page=${page}`;
  return {
    title: `${category}${page > 1 ? ` — Halaman ${page}` : ""}`,
    description: getCategoryDescription(category),
    alternates: { canonical },
    openGraph: {
      title: `${category} pilihan | BONBOX`,
      description: getCategoryDescription(category),
      url: canonical,
      siteName: "BONBOX",
      locale: "id_ID",
      type: "website",
    },
  };
}

export default async function CategoryPage({ params, searchParams }: CategoryPageProps) {
  const [{ slug }, query] = await Promise.all([params, searchParams]);
  const { category, products, categories } = await getCategory(slug);
  if (!category) notFound();

  const page = parsePage(query.page);
  if (query.page === "1") redirect(`/kategori/${slug}`);

  const totalPages = Math.max(1, Math.ceil(products.length / CATEGORY_PAGE_SIZE));
  if (page > totalPages) notFound();

  const start = (page - 1) * CATEGORY_PAGE_SIZE;
  const visibleProducts = products.slice(start, start + CATEGORY_PAGE_SIZE);
  const pageHref = (target: number) =>
    target === 1 ? `/kategori/${slug}` : `/kategori/${slug}?page=${target}`;

  return (
    <main className="category-page">
      <header className="site-header">
        <Brand />
        <nav aria-label="Navigasi utama">
          <Link href="/">Beranda</Link>
          <a href="#produk">Produk</a>
          <Link href="/#tentang">Tentang</Link>
        </nav>
        <a className="header-cta" href="#produk">Lihat produk</a>
      </header>

      <div className="breadcrumbs">
        <Link href="/">Beranda</Link><span>/</span><b>{category}</b>
      </div>

      <section className="category-intro">
        <div>
          <div className="eyebrow">KATEGORI BONBOX</div>
          <h1>{category}</h1>
        </div>
        <div>
          <p>{getCategoryDescription(category)}</p>
          <strong>{products.length} produk pilihan</strong>
        </div>
      </section>

      <nav className="category-directory" aria-label="Kategori produk">
        {categories.map((name) => (
          <Link
            className={name === category ? "active" : ""}
            href={`/kategori/${categoryToSlug(name)}`}
            key={name}
          >
            {name}
          </Link>
        ))}
      </nav>

      <section className="category-products" id="produk">
        <div className="section-heading products-heading">
          <div>
            <small>KATALOG PILIHAN</small>
            <h2>{page === 1 ? category : `${category} — Halaman ${page}`}</h2>
          </div>
          <p>Menampilkan {start + 1}–{Math.min(start + CATEGORY_PAGE_SIZE, products.length)} dari {products.length} produk</p>
        </div>

        <div className="product-grid">
          {visibleProducts.map((product) => (
            <CatalogCard product={product} key={product.id} />
          ))}
        </div>

        {totalPages > 1 && (
          <nav className="pagination" aria-label="Halaman katalog">
            {page > 1 && <Link href={pageHref(page - 1)} rel="prev">← Sebelumnya</Link>}
            <div>
              {Array.from({ length: totalPages }, (_, index) => index + 1).map((target) => (
                <Link
                  className={target === page ? "active" : ""}
                  href={pageHref(target)}
                  aria-current={target === page ? "page" : undefined}
                  key={target}
                >
                  {target}
                </Link>
              ))}
            </div>
            {page < totalPages && <Link href={pageHref(page + 1)} rel="next">Berikutnya →</Link>}
          </nav>
        )}
      </section>

      <footer>
        <Brand className="footer-brand" />
        <p>Make life easy.</p>
        <div><Link href="/">Beranda</Link></div>
        <small>Harga dan ketersediaan mengikuti halaman Shopee.</small>
      </footer>
    </main>
  );
}
