import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);

async function source(path) {
  return readFile(new URL(path, root), "utf8");
}

function categoryToSlug(category) {
  return category
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/&/g, " dan ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

test("the product dataset maps to stable crawlable category pages", async () => {
  const products = JSON.parse(await source("data/products.json"));
  const categories = new Map();

  for (const product of products) {
    categories.set(product.category, (categories.get(product.category) ?? 0) + 1);
  }

  assert.equal(products.length, 100);
  assert.equal(
    products.filter((product) => product.imageUrl).length,
    40,
    "The repository fallback must retain the product images available in production",
  );
  assert.deepEqual(
    [...categories].map(([name, count]) => ({
      name,
      slug: categoryToSlug(name),
      pages: Math.ceil(count / 20),
    })).sort((a, b) => a.slug.localeCompare(b.slug)),
    [
      { name: "Botol & Tumbler", slug: "botol-dan-tumbler", pages: 1 },
      { name: "Kebersihan", slug: "kebersihan", pages: 4 },
      { name: "Penyimpanan", slug: "penyimpanan", pages: 2 },
    ],
  );
});

test("homepage, product breadcrumbs, and sitemap link to category routes", async () => {
  const [homepage, catalog, detail, sitemap] = await Promise.all([
    source("app/page.tsx"),
    source("app/product-catalog.tsx"),
    source("app/produk/[id]/product-detail.tsx"),
    source("app/sitemap.ts"),
  ]);

  assert.match(homepage, /alternates:\s*\{\s*canonical:\s*"\/"/);
  assert.match(catalog, /href=\{item === "Semua" \? "#produk" : `\/kategori\/\$\{categoryToSlug\(item\)\}`\}/);
  assert.match(detail, /href=\{`\/kategori\/\$\{categoryToSlug\(product\.category\)\}`\}/);
  assert.match(sitemap, /categoryPages/);
  assert.match(sitemap, /\?page=\$\{index \+ 1\}/);
});

test("category route provides crawlable pagination and self canonicals", async () => {
  const categoryPage = await source("app/kategori/[slug]/page.tsx");

  assert.match(categoryPage, /alternates:\s*\{\s*canonical\s*\}/);
  assert.match(categoryPage, /href=\{pageHref\(target\)\}/);
  assert.match(categoryPage, /rel="prev"/);
  assert.match(categoryPage, /rel="next"/);
  assert.match(categoryPage, /<CatalogCard product=\{product\}/);
});

test("www requests permanently redirect to the apex domain", async () => {
  const worker = await source("worker/index.ts");
  assert.match(worker, /url\.hostname === "www\.bonbox\.id"/);
  assert.match(worker, /url\.hostname = "bonbox\.id"/);
  assert.match(worker, /Response\.redirect\(url,\s*301\)/);
});
