import { env } from "cloudflare:workers";

type RuntimeEnv = {
  DB?: D1Database;
  MEDIA?: R2Bucket;
  AUTOMATION_TOKEN?: string;
};

type MediaSyncPayload = {
  id?: string;
  imageUrls?: string[];
  videoUrls?: string[];
};

type ImportedMedia = {
  sourceUrl: string;
  url: string;
  key: string;
  contentType: string;
  size?: number;
};

const MAX_IMAGES = 10;
const MAX_IMAGE_BYTES = 15 * 1024 * 1024;
const MAX_VIDEO_BYTES = 150 * 1024 * 1024;
const ALLOWED_MEDIA_HOSTS = [".susercontent.com", ".shopeemobile.com", ".shopee.co.id"];
const AUTOMATION_TOKEN_SHA256 = "accbdd50cbec0974cfe273071351f61e6400911ed81ec1f19a7ed972effaf2a8";

function runtime() {
  return env as unknown as RuntimeEnv;
}

async function sha256(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function authorized(request: Request, token?: string) {
  const supplied = request.headers.get("x-automation-token");
  if (!supplied) return false;
  if (token && supplied === token) return true;
  return (await sha256(supplied)) === AUTOMATION_TOKEN_SHA256;
}

function safeProductId(value: unknown) {
  const id = String(value ?? "").trim();
  return /^[a-zA-Z0-9_-]{1,80}$/.test(id) ? id : "";
}

function uniqueHttpsUrls(values: unknown, limit: number) {
  if (!Array.isArray(values)) return [];
  return [...new Set(values.map((value) => String(value ?? "").trim()))]
    .filter((value) => {
      try {
        const url = new URL(value);
        return url.protocol === "https:"
          && ALLOWED_MEDIA_HOSTS.some((suffix) => url.hostname === suffix.slice(1) || url.hostname.endsWith(suffix));
      } catch {
        return false;
      }
    })
    .slice(0, limit);
}

function extensionFor(contentType: string, sourceUrl: string) {
  const normalized = contentType.split(";")[0].trim().toLowerCase();
  const byType: Record<string, string> = {
    "image/avif": "avif",
    "image/gif": "gif",
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
    "video/mp4": "mp4",
    "video/webm": "webm",
    "video/quicktime": "mov",
  };
  if (byType[normalized]) return byType[normalized];
  const pathExtension = new URL(sourceUrl).pathname.match(/\.([a-zA-Z0-9]{2,5})$/)?.[1]?.toLowerCase();
  return pathExtension && /^[a-z0-9]{2,5}$/.test(pathExtension) ? pathExtension : "bin";
}

async function importMedia(
  bucket: R2Bucket,
  productId: string,
  sourceUrl: string,
  kind: "image" | "video",
  index: number,
  origin: string,
): Promise<ImportedMedia> {
  const response = await fetch(sourceUrl, {
    headers: {
      accept: kind === "image" ? "image/avif,image/webp,image/apng,image/*,*/*;q=0.8" : "video/*,*/*;q=0.8",
      "user-agent": "Mozilla/5.0 (compatible; BonboxMediaSync/1.0; +https://bonbox.id)",
    },
    redirect: "follow",
  });
  if (!response.ok || !response.body) throw new Error(`Sumber media merespons ${response.status}.`);

  const contentType = (response.headers.get("content-type") ?? "").split(";")[0].trim().toLowerCase();
  if (kind === "image" && !contentType.startsWith("image/")) throw new Error(`Tipe ${contentType || "tidak diketahui"} bukan gambar.`);
  if (kind === "video" && !contentType.startsWith("video/")) throw new Error(`Tipe ${contentType || "tidak diketahui"} bukan video.`);

  const sizeHeader = Number(response.headers.get("content-length") ?? 0);
  const maxBytes = kind === "image" ? MAX_IMAGE_BYTES : MAX_VIDEO_BYTES;
  if (sizeHeader > maxBytes) throw new Error(`${kind === "image" ? "Gambar" : "Video"} melebihi batas ukuran.`);

  const extension = extensionFor(contentType, response.url || sourceUrl);
  const sequence = String(index + 1).padStart(2, "0");
  const key = `products/${productId}/${kind}-${sequence}.${extension}`;
  await bucket.put(key, response.body, {
    httpMetadata: {
      contentType,
      cacheControl: "public, max-age=31536000, immutable",
    },
    customMetadata: {
      sourceUrl: sourceUrl.slice(0, 1024),
      importedAt: new Date().toISOString(),
    },
  });

  return {
    sourceUrl,
    url: `${origin}/media/${key}`,
    key,
    contentType,
    size: sizeHeader || undefined,
  };
}

export async function POST(request: Request) {
  const { DB, MEDIA, AUTOMATION_TOKEN } = runtime();
  if (!(await authorized(request, AUTOMATION_TOKEN))) return Response.json({ error: "Token otomatisasi tidak valid." }, { status: 401 });
  if (!DB) return Response.json({ error: "Database belum aktif." }, { status: 503 });

  let payload: MediaSyncPayload;
  try {
    payload = await request.json() as MediaSyncPayload;
  } catch {
    return Response.json({ error: "Payload JSON tidak valid." }, { status: 400 });
  }

  const id = safeProductId(payload.id);
  if (!id) return Response.json({ error: "ID produk tidak valid." }, { status: 400 });

  const imageUrls = uniqueHttpsUrls(payload.imageUrls, MAX_IMAGES);
  const videoUrls = uniqueHttpsUrls(payload.videoUrls, 1);
  if (!imageUrls.length) return Response.json({ error: "Tidak ada URL gambar Shopee yang valid." }, { status: 422 });

  const existing = await DB.prepare("SELECT id, image_url, gallery_urls, video_url FROM products WHERE id = ? AND active = 1")
    .bind(id)
    .first<Record<string, unknown>>();
  if (!existing) return Response.json({ error: "Produk tidak ditemukan." }, { status: 404 });

  if (!MEDIA) {
    const imageUrl = imageUrls[0];
    const galleryUrls = imageUrls.slice(1);
    const videoUrl = videoUrls[0] || String(existing.video_url ?? "");
    const updatedAt = new Date().toISOString();

    await DB.prepare("UPDATE products SET image_url = ?, gallery_urls = ?, video_url = ?, updated_at = ? WHERE id = ?")
      .bind(imageUrl, JSON.stringify(galleryUrls), videoUrl, updatedAt, id)
      .run();

    return Response.json({
      ok: true,
      id,
      storage: "source",
      imageUrl,
      galleryUrls,
      videoUrl,
      importedImages: [],
      importedVideo: null,
      errors: [],
      updatedAt,
    });
  }

  const origin = new URL(request.url).origin;
  const errors: Array<{ kind: string; sourceUrl: string; error: string }> = [];
  const importedImages: ImportedMedia[] = [];

  for (let index = 0; index < imageUrls.length; index += 1) {
    try {
      importedImages.push(await importMedia(MEDIA, id, imageUrls[index], "image", index, origin));
    } catch (error) {
      errors.push({
        kind: "image",
        sourceUrl: imageUrls[index],
        error: error instanceof Error ? error.message : "Gagal mengimpor gambar.",
      });
    }
  }

  if (!importedImages.length) {
    return Response.json({ error: "Semua gambar gagal diimpor.", errors }, { status: 422 });
  }

  let importedVideo: ImportedMedia | null = null;
  if (videoUrls[0]) {
    try {
      importedVideo = await importMedia(MEDIA, id, videoUrls[0], "video", 0, origin);
    } catch (error) {
      errors.push({
        kind: "video",
        sourceUrl: videoUrls[0],
        error: error instanceof Error ? error.message : "Gagal mengimpor video.",
      });
    }
  }

  const imageUrl = importedImages[0].url;
  const galleryUrls = importedImages.slice(1).map((media) => media.url);
  const videoUrl = importedVideo?.url || String(existing.video_url ?? "");
  const updatedAt = new Date().toISOString();

  await DB.prepare("UPDATE products SET image_url = ?, gallery_urls = ?, video_url = ?, updated_at = ? WHERE id = ?")
    .bind(imageUrl, JSON.stringify(galleryUrls), videoUrl, updatedAt, id)
    .run();

  return Response.json({
    ok: true,
    id,
    storage: "r2",
    imageUrl,
    galleryUrls,
    videoUrl,
    importedImages,
    importedVideo,
    errors,
    updatedAt,
  });
}
