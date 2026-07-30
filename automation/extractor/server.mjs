import http from "node:http";
import { lookup } from "node:dns/promises";
import { chromium } from "playwright-core";

const port = Number(process.env.PORT || 3000);
const token = String(process.env.EXTRACTOR_TOKEN || "");
const cdpUrl = String(process.env.CHROME_CDP_URL || "");
const navigationTimeout = Number(process.env.NAVIGATION_TIMEOUT_MS || 90000);
const priceRequestDelay = Math.max(250, Number(process.env.PRICE_REQUEST_DELAY_MS || 1200));
const maxConcurrency = Math.max(1, Number(process.env.MAX_CONCURRENCY || 1));
const SOCIAL_USER_AGENT = "facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)";

let activeJobs = 0;
let cdpBrowser = null;
let resolvedCdpUrl = "";

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
    throw new Error(`Shopee merespons ${result.status}${result.error ? ` (${result.error})` : ""}.`);
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
    try {
      updates.push(await extractPrice(product));
    } catch (error) {
      failures.push({
        productId: String(product?.productId || ""),
        error: error instanceof Error ? error.message : "Harga gagal dibaca.",
      });
    }
    if (index < products.length - 1) {
      await new Promise((resolve) => setTimeout(resolve, priceRequestDelay));
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

async function extractVideoWithChrome(productId, url) {
  const browser = await browserConnection();
  if (!browser) return { videos: [], browserAvailable: false, blocked: false };

  const context = browser.contexts()[0];
  if (!context) throw new Error("Profil Chrome otomatisasi belum siap.");

  const page = await context.newPage();
  const videos = new Set();
  const apiResponses = [];

  page.on("response", async (response) => {
    const responseUrl = response.url();
    const contentType = String(response.headers()["content-type"] || "").toLowerCase();
    if ((contentType.startsWith("video/") || contentType.includes("mpegurl")) && isShopeeMedia(responseUrl)) {
      videos.add(responseUrl);
    }
    if (/\/api\/v\d+\/pdp\/get_pc/i.test(responseUrl)) {
      apiResponses.push({ url: responseUrl, status: response.status() });
      if (response.status() === 200) {
        try {
          const body = await response.json();
          const serialized = JSON.stringify(body);
          const patterns = [
            /https?:\\?\/\\?\/[^"']+?\.mp4[^"']*/gi,
            /https?:\\?\/\\?\/[^"']+?\.m3u8[^"']*/gi,
          ];
          for (const pattern of patterns) {
            for (const match of serialized.matchAll(pattern)) {
              const candidate = normalizeUrl(match[0]);
              if (looksLikeVideo(candidate)) videos.add(candidate);
            }
          }
          if (!serialized.includes(String(productId))) apiResponses.at(-1).mismatchedProduct = true;
        } catch {
          apiResponses.at(-1).unreadable = true;
        }
      }
    }
  });

  try {
    await page.setViewportSize({ width: 1440, height: 1100 });
    await page.setExtraHTTPHeaders({ "accept-language": "id-ID,id;q=0.9,en-US;q=0.8,en;q=0.7" });
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: navigationTimeout });
    await page.waitForTimeout(8000);
    await page.mouse.wheel(0, 1200);
    await page.waitForTimeout(1500);

    const domVideos = await page.evaluate(() => [
      ...[...document.querySelectorAll("video")].flatMap((video) => [video.currentSrc, video.src]),
      ...[...document.querySelectorAll("video source")].map((source) => source.src),
      ...performance.getEntriesByType("resource").map((entry) => "name" in entry ? String(entry.name) : ""),
    ]);
    domVideos.map(normalizeUrl).filter(looksLikeVideo).forEach((candidate) => videos.add(candidate));
    const blocked = /\/verify\/traffic\//i.test(page.url())
      || /captcha|verifikasi|aktivitas mencurigakan|masuk diperlukan/i.test(await page.locator("body").innerText().catch(() => ""));

    return {
      videos: unique([...videos], 3),
      browserAvailable: true,
      blocked,
      browserUrl: page.url(),
      apiResponses,
    };
  } finally {
    await page.close();
  }
}

async function extractMedia(productId, url) {
  const social = await extractSocialPage(url);
  let video = { videos: [], browserAvailable: Boolean(cdpUrl), blocked: false };
  let videoError = "";

  if (social.hasVideo && cdpUrl) {
    try {
      video = await extractVideoWithChrome(productId, url);
    } catch (error) {
      videoError = error instanceof Error ? error.message : "Gagal membaca video dari Chrome.";
    }
  }

  return {
    ok: social.images.length > 0,
    productId,
    requestedUrl: url,
    finalUrl: social.finalUrl,
    title: social.title,
    blocked: video.blocked,
    images: social.images,
    videos: video.videos,
    hasVideo: social.hasVideo,
    videoPending: social.hasVideo && video.videos.length === 0,
    diagnostics: {
      strategy: "shopee-social-preview",
      htmlBytes: social.htmlBytes,
      browserConfigured: Boolean(cdpUrl),
      browserAvailable: video.browserAvailable,
      browserUrl: video.browserUrl,
      videoError,
      apiResponses: video.apiResponses,
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
