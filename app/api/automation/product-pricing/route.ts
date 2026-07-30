import { env } from "cloudflare:workers";

type RuntimeEnv = {
  DB?: D1Database;
  AUTOMATION_TOKEN?: string;
  ADMIN_TOKEN?: string;
};

type PriceUpdate = {
  id?: string;
  priceLabel?: string;
  salesLabel?: string;
};

type PricingPayload = {
  updates?: PriceUpdate[];
};

const AUTOMATION_TOKEN_SHA256 = "accbdd50cbec0974cfe273071351f61e6400911ed81ec1f19a7ed972effaf2a8";

function runtime() {
  return env as unknown as RuntimeEnv;
}

async function sha256(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function authorized(request: Request, token?: string, adminToken?: string) {
  const supplied = request.headers.get("x-automation-token");
  if (!supplied) return false;
  if (token && supplied === token) return true;
  if (adminToken && supplied === adminToken) return true;
  return (await sha256(supplied)) === AUTOMATION_TOKEN_SHA256;
}

function safeProductId(value: unknown) {
  const id = String(value ?? "").trim();
  return /^[a-zA-Z0-9_-]{1,80}$/.test(id) ? id : "";
}

function safePriceLabel(value: unknown) {
  const label = String(value ?? "").trim().replace(/^Rp\s*/i, "");
  if (!/^\d{1,3}(?:\.\d{3})*$/.test(label) && !/^\d{3,10}$/.test(label)) return "";
  const amount = Number(label.replaceAll(".", ""));
  return Number.isSafeInteger(amount) && amount >= 100 && amount <= 1_000_000_000 ? label : "";
}

function safeSalesLabel(value: unknown) {
  const label = String(value ?? "").trim();
  return label && /^[\d.,+\sA-Za-z]+$/.test(label) ? label.slice(0, 80) : null;
}

export async function POST(request: Request) {
  const { DB, AUTOMATION_TOKEN, ADMIN_TOKEN } = runtime();
  if (!(await authorized(request, AUTOMATION_TOKEN, ADMIN_TOKEN))) {
    return Response.json({ error: "Token otomatisasi tidak valid." }, { status: 401 });
  }
  if (!DB) return Response.json({ error: "Database belum aktif." }, { status: 503 });

  let payload: PricingPayload;
  try {
    payload = await request.json() as PricingPayload;
  } catch {
    return Response.json({ error: "Payload JSON tidak valid." }, { status: 400 });
  }

  const updates = (Array.isArray(payload.updates) ? payload.updates : [])
    .slice(0, 150)
    .map((update) => ({
      id: safeProductId(update.id),
      priceLabel: safePriceLabel(update.priceLabel),
      salesLabel: safeSalesLabel(update.salesLabel),
    }))
    .filter((update) => update.id && update.priceLabel);

  if (!updates.length) {
    return Response.json({ error: "Tidak ada pembaruan harga yang valid." }, { status: 422 });
  }

  const updatedAt = new Date().toISOString();
  const results = await DB.batch(
    updates.map((update) => DB.prepare(
      "UPDATE products SET price_label = ?, sales_label = COALESCE(?, sales_label), updated_at = ? WHERE id = ? AND active = 1",
    ).bind(update.priceLabel, update.salesLabel, updatedAt, update.id)),
  );

  const updated = results.reduce((total, result) => total + Number(result.meta.changes ?? 0), 0);
  return Response.json({
    ok: true,
    requested: updates.length,
    updated,
    skipped: updates.length - updated,
    updatedAt,
  });
}
