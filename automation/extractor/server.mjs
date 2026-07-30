import http from "node:http";
import { lookup } from "node:dns/promises";
import { chromium } from "playwright-core";
import { cleanShopeeDescription } from "./description.mjs";

const port = Number(process.env.PORT || 3000);
const token = String(process.env.EXTRACTOR_TOKEN || "");
const cdpUrl = String(process.env.CHROME_CDP_URL || "");
const navigationTimeout = Number(process.env.NAVIGATION_TIMEOUT_MS || 90000);
const priceRequestDelay = Math.max(250, Number(process.env.PRICE_REQUEST_DELAY_MS || 1200));
const priceCooldownEvery = Math.max(10, Number(process.env.PRICE_COOLDOWN_EVERY || 50));
const priceCooldownMs = Math.max(60000, Number(process.env.PRICE_COOLDOWN_MS || 180000));
const maxConcurrency = Math.max(1, Number(process.env.MAX_CONCURRENCY || 1));
const SOCIAL_USER_AGENT = "facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)";

let activeJobs = 0;
let cdpBrowser = null;
let resolvedCdpUrl = "";

class ShopeeApiError extends Error {
  constructor(message, code) {
    super(message);
    this.name = "ShopeeApiError";
    this.code = code;
  }
}

function json(response, status, body) {
  response.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
  });
  response.end(JSON.stringify(body));
}

function authorized(request) {
  return Boolean(token && request.headers.authorization === `Bearer ${token}`);
}

function validShopeeUrl(value) {
  try {
    const url = new URL(String(value || ""));
    return url.protocol === "https:"
      && (url.hostname === "shopee.co.id" || url.hostname.endsWith(".shopee.co.id"))
      && /^\/(?:product|opaanlp)\/\d+\/\d+/.test(url.pathname);
  } catch {
    return false;
  }
}

function shopeeProductIds(value) {
  try {
    const url = new URL(String(value || ""));
    if (url.protocol !== "https:"
      || (url.hostname !== "shopee.co.id" && !url.hostname.endsWith(".shopee.co.id"))) {
      return null;
    }
    const match = url.pathname.match(/^\/(?:product|opaanlp)\/(\d+)\/(\d+)/);
    return match ? { shopId: match[1], itemId: match[2] } : null;
  } catch {
    return null;
  }
}

async function requestBody(request) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > 64 * 1024) throw new Error("Payload terlalu besar.");
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

function decodeHtml(value) {
  return String(value || "")
    .replaceAll("&amp;", "&")
    .replaceAll("&quot;", "\"")
    .replaceAll("&#39;", "'")
    .replaceAll("\\u002F", "/")
    .replaceAll("\\/", "/");
}

function normalizeUrl(value) {
  const source = decodeHtml(value).trim();
  if (!source) return "";
  if (source.startsWith("//")) return `https:${source}`;
  if (source.startsWith("http://")) return `https://${source.slice(7)}`;
  return source;
}

function isShopeeMedia(value) {
  try {
    const url = new URL(normalizeUrl(value));
    return url.protocol === "https:" && (
      url.hostname.endsWith(".susercontent.com")
      || url.hostname.endsWith(".shopeemobile.com")
      || url.hostname.endsWith(".shopee.co.id")
    );
  } catch {
    return false;
  }
}

function looksLikeImage(value) {
  const url = normalizeUrl(value);
  return isShopeeMedia(url)
    && /(?:\/file\/|img\.susercontent\.com)/i.test(url)
    && !/(?:avatar|icon|logo|sprite|favicon|category|shop\/|\/assets\/|bundle)/i.test(url);
}

function looksLikeVideo(value) {
  const url = normalizeUrl(value);
  return isShopeeMedia(url)
    && (/\.(?:m3u8|mp4|mov|webm)(?:$|\?)/i.test(url) || /(?:vod|video|cvf)/i.test(url))
    && !/(?:bundle|assets\/|static)/i.test(url);
}

function canonicalImageUrl(value) {
  const normalized = normalizeUrl(value);
  if (!looksLikeImage(normalized)) return "";
  const match = normalized.match(/^(https:\/\/[^/]+\/file\/[^@?]+)/i);
  return match ? `${match[1].replace(/\.webp$/i, "")}.webp` : normalized;
}

function unique(values, limit) {
  return [...new Set(values.map(normalizeUrl).filter(Boolean))].slice(0, limit);
}

async function extractSocialPage(url) {
  const response = await fetch(url, {
    headers: {
      "user-agent": SOCIAL_USER_AGENT,
      accept: "text/html,application/xhtml+xml",
      "accept-language": "id-ID,id;q=0.9,en;q=0.7",
    },
    redirect: "follow",
  });
  if (!response.ok) throw new Error(`Halaman Shopee merespons ${response.status}.`);

  const html = await response.text();
  const ogImage = decodeHtml(
    html.match(/<meta[^>]+(?:property|name)=["']og:image["'][^>]+content=["']([^"']+)/i)?.[1]
      || html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["']og:image["']/i)?.[1]
      || "",
  );
  const rawImages = [...html.matchAll(/https?:\/\/[^"'<> ]+\/file\/(?:id|sg)-111342(?:01|07)-[a-zA-Z0-9_-]+(?:@[^"'<> ]+)?/gi)]
    .map((match) => canonicalImageUrl(match[0]))
    .filter(Boolean);
  const images = unique([canonicalImageUrl(ogImage), ...rawImages].filter(Boolean), 10);
  const hasVideo = /<video[^>]+product-video__video/i.test(html);

  return {
    finalUrl: response.url,
    title: decodeHtml(html.match(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)/i)?.[1] || ""),
    images,
    hasVideo,
    htmlBytes: html.length,
  };
}

async function browserConnection() {
  if (!cdpUrl) return null;
  if (cdpBrowser?.isConnected()) return cdpBrowser;
  if (!resolvedCdpUrl) {
    const url = new URL(cdpUrl);
    if (url.hostname === "host.docker.internal") {
      const result = await lookup(url.hostname, { family: 4 });
      url.hostname = result.address;
    }
    resolvedCdpUrl = url.toString().replace(/\/$/, "");
  }
  cdpBrowser = await chromium.connectOverCDP(resolvedCdpUrl, { timeout: 15000 });
  return cdpBrowser;
}

async function shopeeApiPage() {
  const browser = await browserConnection();
  if (!browser) throw new Error("Browser Shopee belum dikonfigurasi.");

  const context = browser.contexts()[0];
  if (!context) throw new Error("Profil Chrome otomatisasi belum siap.");

  let page = context.pages().find((candidate) => {
    try {
      const hostname = new URL(candidate.url()).hostname;
      return hostname === "shopee.co.id" || hostname.endsWith(".shopee.co.id");
    } catch {
      return false;
    }
  });

  if (!page) {
    page = await context.newPage();
    await page.goto("https://shopee.co.id/", {
      waitUntil: "domcontentloaded",
      timeout: navigationTimeout,
    });
  }

  return page;
}

function formatRupiahValue(value) {
  return new Intl.NumberFormat("id-ID", { maximumFractionDigits: 0 }).format(value);
}

function wait(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function extractPrice(product) {
  const productId = String(product?.productId || "").trim();
  const url = String(product?.url || "").trim();
  const ids = shopeeProductIds(url);
  if (!productId || !ids) throw new Error("ID atau URL produk Shopee tidak valid.");

  const page = await shopeeApiPage();
  const result = await page.evaluate(async ({ shopId, itemId }) => {
    const response = await fetch(
      `/api/v4/pdp/get_pc?item_id=${encodeURIComponent(itemId)}&shop_id=${encodeURIComponent(shopId)}`,
      {
        credentials: "include",
        headers: { accept: "application/json" },
      },
    );
    const body = await response.json().catch(() => null);
    return {
      status: response.status,
      error: body?.error ?? null,
      item: body?.data?.item ?? null,
      review: body?.data?.product_review ?? null,
    };
  }, ids);

  if (result.status !== 200 || !result.item) {
    throw new ShopeeApiError(
      `Shopee merespons ${result.status}${result.error ? ` (${result.error})` : ""}.`,
      result.error,
    );
  }

  const rawPrice = Number(result.item.price_min ?? result.item.price);
  const priceValue = Math.round(rawPrice / 100000);
  if (!Number.isSafeInteger(priceValue) || priceValue < 100 || priceValue > 1_000_000_000) {
    throw new Error("Harga Shopee tidak valid atau sedang disembunyikan.");
  }

  const salesLabel = String(
    result.review?.sold_count_display
      ?? result.review?.historical_sold_display
      ?? result.review?.global_sold_display
      ?? "",
  ).trim();

  return {
    productId,
    shopId: ids.shopId,
    itemId: ids.itemId,
    priceValue,
    priceLabel: formatRupiahValue(priceValue),
    salesLabel,
  };
}

async function extractPrices(products) {
  const updates = [];
  const failures = [];

  for (let index = 0; index < products.length; index += 1) {
    const product = products[index];
    if (index > 0 && index % priceCooldownEvery === 0) {
      await wait(priceCooldownMs);
    }
    try {
      updates.push(await extractPrice(product));
    } catch (error) {
      if (error instanceof ShopeeApiError && String(error.code) === "90309999") {
        await wait(priceCooldownMs);
        try {
          updates.push(await extractPrice(product));
          if (index < products.length - 1) await wait(priceRequestDelay);
          continue;
        } catch (retryError) {
          failures.push({
            productId: String(product?.productId || ""),
            error: retryError instanceof Error ? retryError.message : "Harga gagal dibaca setelah dicoba ulang.",
          });
        }
      } else {
        failures.push({
          productId: String(product?.productId || ""),
          error: error instanceof Error ? error.message : "Harga gagal dibaca.",
        });
      }
    }
    if (index < products.length - 1) {
      await wait(priceRequestDelay);
    }
  }

  return {
    ok: updates.length > 0,
    requested: products.length,
    succeeded: updates.length,
    failed: failures.length,
    updates,
    failures,
  };
}

async function extractProductDataWithChrome(url) {
  const ids = shopeeProductIds(url);
  if (!ids) throw new Error("URL produk Shopee tidak valid.");

  const page = await shopeeApiPage();
  const result = await page.evaluate(async ({ shopId, itemId }) => {
    const response = await fetch(
      `/api/v4/pdp/get_pc?item_id=${encodeURIComponent(itemId)}&shop_id=${encodeURIComponent(shopId)}`,
      {
        credentials: "include",
        headers: { accept: "application/json" },
      },
    );
    const body = await response.json().catch(() => null);
    const videoCandidates = [];
    const visit = (candidate) => {
      if (!candidate || typeof candidate !== "object") return;
      for (const value of Object.values(candidate)) {
        if (typeof value === "string" && (
          /\.(?:mp4|m3u8|mov|webm)(?:$|\?)/i.test(value)
          || /(?:vod|video|cvf)\./i.test(value)
          || /\/(?:vod|video)\//i.test(value)
        )) {
          videoCandidates.push(value);
        } else if (value && typeof value === "object") {
          visit(value);
        }
      }
    };
    visit(body?.data);
    const serialized = JSON.stringify(body?.data ?? {});

    return {
      status: response.status,
      error: body?.error ?? null,
      description: body?.data?.item?.description ?? "",
      videos: videoCandidates,
      hasVideo: videoCandidates.length > 0 || /"video(?:_|[A-Z])/i.test(serialized),
    };
  }, ids);

  if (result.status !== 200 || result.error || !result.description) {
    throw new ShopeeApiError(
      `Data produk Shopee merespons ${result.status}${result.error ? ` (${result.error})` : ""}.`,
      result.error,
    );
  }

  return {
    available: true,
    description: cleanShopeeDescription(result.description),
    videos: unique(result.videos.map(normalizeUrl).filter(looksLikeVideo), 3),
    hasVideo: Boolean(result.hasVideo),
    browserAvailable: true,
  };
}

async function extractMedia(productId, url) {
  const social = await extractSocialPage(url);
  let productData = {
    available: false,
    description: "",
    videos: [],
    hasVideo: social.hasVideo,
    browserAvailable: Boolean(cdpUrl),
  };
  let productDataError = "";

  if (cdpUrl) {
    try {
      productData = await extractProductDataWithChrome(url);
    } catch (error) {
      productDataError = error instanceof Error ? error.message : "Gagal membaca data produk dari Chrome.";
    }
  }

  const hasVideo = social.hasVideo || productData.hasVideo || productData.videos.length > 0;
  return {
    ok: social.images.length > 0,
    productId,
    requestedUrl: url,
    finalUrl: social.finalUrl,
    title: social.title,
    blocked: /90309999|captcha|verifikasi|traffic/i.test(productDataError),
    images: social.images,
    videos: productData.videos,
    description: productData.description,
    descriptionPending: !productData.description,
    hasVideo,
    videoPending: hasVideo && productData.videos.length === 0,
    diagnostics: {
      strategy: "shopee-social-preview-and-authenticated-product-data",
      htmlBytes: social.htmlBytes,
      browserConfigured: Boolean(cdpUrl),
      browserAvailable: productData.browserAvailable,
      productDataAvailable: productData.available,
      productDataError,
    },
  };
}

const server = http.createServer(async (request, response) => {
  if (request.method === "GET" && request.url === "/healthz") {
    return json(response, 200, {
      status: "ok",
      activeJobs,
      maxConcurrency,
      chromeConfigured: Boolean(cdpUrl),
      chromeConnected: Boolean(cdpBrowser?.isConnected()),
      priceCooldownEvery,
      priceCooldownMs,
    });
  }
  if (request.method !== "POST" || !["/extract", "/prices"].includes(request.url || "")) {
    return json(response, 404, { error: "Endpoint tidak ditemukan." });
  }
  if (!authorized(request)) return json(response, 401, { error: "Token extractor tidak valid." });
  if (activeJobs >= maxConcurrency) return json(response, 429, { error: "Extractor sedang sibuk. Coba lagi sebentar." });

  activeJobs += 1;
  try {
    const body = await requestBody(request);
    if (request.url === "/prices") {
      const products = Array.isArray(body.products) ? body.products.slice(0, 150) : [];
      if (!products.length) return json(response, 400, { error: "Daftar produk kosong." });
      const result = await extractPrices(products);
      return json(response, result.ok ? 200 : 422, result);
    }
    if (!validShopeeUrl(body.url)) return json(response, 400, { error: "URL produk Shopee tidak valid." });
    const result = await extractMedia(String(body.productId || ""), String(body.url));
    return json(response, result.ok ? 200 : 422, result);
  } catch (error) {
    return json(response, 500, { error: error instanceof Error ? error.message : "Ekstraksi gagal." });
  } finally {
    activeJobs -= 1;
  }
});

server.listen(port, "0.0.0.0", () => {
  console.log(`Bonbox media extractor listening on port ${port}`);
});
