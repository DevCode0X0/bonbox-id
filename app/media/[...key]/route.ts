import { env } from "cloudflare:workers";

type RuntimeEnv = { MEDIA?: R2Bucket };

function runtime() {
  return env as unknown as RuntimeEnv;
}

function objectKey(request: Request) {
  return new URL(request.url).pathname
    .replace(/^\/media\//, "")
    .split("/")
    .map((segment) => decodeURIComponent(segment))
    .join("/");
}

async function serveMedia(request: Request, headOnly = false) {
  const { MEDIA } = runtime();
  if (!MEDIA) return new Response("Media storage belum aktif.", { status: 503 });

  const key = objectKey(request);
  if (!key || key.includes("..")) return new Response("Media tidak valid.", { status: 400 });

  const object = await MEDIA.get(key, { range: request.headers });
  if (!object) return new Response("Media tidak ditemukan.", { status: 404 });

  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set("etag", object.httpEtag);
  headers.set("accept-ranges", "bytes");
  headers.set("cache-control", headers.get("cache-control") ?? "public, max-age=31536000, immutable");

  let status = 200;
  if (object.range) {
    const offset = "offset" in object.range ? object.range.offset : 0;
    const length = "length" in object.range ? object.range.length : object.size;
    headers.set("content-range", `bytes ${offset}-${offset + length - 1}/${object.size}`);
    headers.set("content-length", String(length));
    status = 206;
  } else {
    headers.set("content-length", String(object.size));
  }

  return new Response(headOnly ? null : object.body, { status, headers });
}

export async function GET(request: Request) {
  return serveMedia(request);
}

export async function HEAD(request: Request) {
  return serveMedia(request, true);
}
