/** Standalone preview for a dedicated origin. Never mounts the production API. */
import { createHash, timingSafeEqual } from "node:crypto";
import { createServer } from "node:http";
import { readFile, realpath } from "node:fs/promises";
import { extname, resolve, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const merchant = {
  id: "fawri-preview-merchant", store_name: "متجر المعاينة", owner_name: "مالكة المعاينة",
  activity_type: "retail", phone: "", status: "approved", account_status: "approved",
  onboarding_status: "channel_connected", language: "ar", theme_preference: "light",
  created_at: "2026-01-01T00:00:00Z", is_admin: false, cod_enabled: true,
};
const context = { country_code: "IQ", timezone: "Asia/Baghdad", currency_code: "IQD", currency_fraction_digits: 0 };
const subscription = {
  id: "fawri-preview-subscription", merchant_id: merchant.id, plan_name: "gold", price_iqd: 49000,
  reply_limit: 8000, replies_used: 0, replies_remaining: 8000, status: "active",
  start_date: "2026-01-01T00:00:00Z", expires_at: "2099-01-01T00:00:00Z", auto_reply_enabled: false,
  emergency_credit_used: 0, emergency_credit_amount: 0, emergency_credit_remaining: 0,
  emergency_credit_activated: false, pending_next_cycle_deduction: 0,
};
const fixtures = new Map([
  ["/api/auth/me", { ok: true, merchant }],
  ["/api/auth/lifecycle", { ok: true, lifecycle: { merchant_id: merchant.id,
    account_status: merchant.account_status, merchant_status: merchant.status,
    onboarding_status: merchant.onboarding_status } }],
  ["/api/auth/subscription/current", { ok: true, subscription }],
  ["/api/auth/emergency-read-access/notices", { ok: true, notices: [] }],
  ["/api/catalog/products", { ok: true, products: [], count: 0 }],
  ["/api/catalog/context", { ok: true, context }],
  ["/api/catalog/promotions", { ok: true, promotions: [] }],
  ["/api/merchant/regional", { ok: true, context }],
  ["/api/orders", { ok: true, orders: [], count: 0 }],
  ["/api/conversations", { ok: true, conversations: [], count: 0 }],
  ["/api/auth/notifications", { ok: true, notifications: [], unread_count: 0 }],
]);
const pages = new Set(["/", "/dashboard", "/dashboard/overview", "/dashboard/products", "/dashboard/orders"]);
const staticRoot = new Set(["/favicon.svg", "/fawri-logo.svg", "/catalog-kurdish-layout-fix.css"]);
const mediaTypes = new Map([
  [".html", "text/html; charset=utf-8"], [".js", "application/javascript"], [".css", "text/css"],
  [".svg", "image/svg+xml"], [".png", "image/png"], [".jpg", "image/jpeg"],
  [".webp", "image/webp"], [".woff2", "font/woff2"],
]);
const digest = value => createHash("sha256").update(value).digest();
export const PREVIEW_DOMAIN = "preview.fawrireply.com";

export async function createOwnerPreview({ dist, tokenHash, expiresAt, now = Date.now, domain = undefined }) {
  if (domain !== undefined && domain !== PREVIEW_DOMAIN) {
    throw new Error("Unexpected preview domain");
  }
  const start = now();
  if (!/^[\da-f]{64}$/.test(tokenHash) || !Number.isFinite(expiresAt) || expiresAt <= start || expiresAt > start + 3_600_000) {
    throw new Error("Preview requires a token hash and an expiry within one hour");
  }
  const expected = Buffer.from(tokenHash, "hex");
  const root = await realpath(dist);
  const index = (await readFile(resolve(root, "index.html"), "utf8"))
    .replace(/<link\b[^>]*\bhref="https:\/\/fonts\.(?:googleapis|gstatic)\.com[^"\s]*"[^>]*>\s*/g, "");
  if (!/<script\b[^>]*\bsrc="\/assets\/[\w.-]+\.js"/.test(index)) {
    throw new Error("Preview requires a release build with BASE_PATH=/ on its own origin");
  }

  const server = createServer(async (req, res) => {
    res.setHeader("Cache-Control", "private, no-store");
    res.setHeader("X-Robots-Tag", "noindex, nofollow, noarchive");
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Referrer-Policy", "no-referrer");
    res.setHeader("Content-Security-Policy", "default-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'self'; worker-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'");
    // Take the original authority used by the routing layer. A caller-supplied
    // forwarding header must never substitute for the dedicated preview host.
    const authority = domain ?? `127.0.0.1:${server.address().port}`;
    if (req.headers.host !== authority || now() >= expiresAt) {
      res.writeHead(404).end();
      return;
    }
    const header = /^Basic ([A-Za-z0-9+/=]{1,128})$/.exec(req.headers.authorization ?? "");
    const credential = header && /^owner:([\da-f]{64})$/.exec(Buffer.from(header[1], "base64").toString("utf8"));
    if (!credential || !timingSafeEqual(digest(credential[1]), expected)) {
      res.writeHead(401, { "WWW-Authenticate": 'Basic realm="Fawri preview", charset="UTF-8"' }).end();
      return;
    }
    if (!['GET', 'HEAD'].includes(req.method)) {
      res.writeHead(405, { Allow: "GET, HEAD" }).end();
      return;
    }
    const path = req.url?.split("?", 1)[0];
    if (path === "/api/auth/events") {
      res.writeHead(200, { "Content-Type": "text/event-stream" });
      if (req.method === "HEAD") { res.end(); return; }
      res.write(": preview fixture\n\n");
      const timeout = setTimeout(() => res.end(), Math.max(0, Math.min(30_000, expiresAt - now())));
      res.once("close", () => clearTimeout(timeout));
      return;
    }
    if (fixtures.has(path)) {
      res.writeHead(200, { "Content-Type": "application/json" }).end(JSON.stringify(fixtures.get(path)));
      return;
    }
    if (pages.has(path)) {
      res.writeHead(200, { "Content-Type": mediaTypes.get(".html") }).end(index);
      return;
    }
    const type = mediaTypes.get(extname(path ?? ""));
    if (type && (staticRoot.has(path) || /^\/assets\/[\w.-]+$/.test(path))) {
      try {
        const filename = await realpath(resolve(root, `.${path}`));
        if (filename.startsWith(root + sep)) {
          const bytes = await readFile(filename);
          res.writeHead(200, { "Content-Type": type }).end(bytes);
          return;
        }
      } catch {
        // Missing build assets use the same closed response as unknown routes.
      }
    }
    res.writeHead(404).end();
  });

  return server;
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  try {
    const domain = process.env.FAWRI_OWNER_PREVIEW_DOMAIN;
    const port = domain ? Number(process.env.PORT) : 0;
    if (domain && (!Number.isInteger(port) || port < 1024 || port > 65535)) {
      throw new Error("Hosted preview requires a valid service port");
    }
    const server = await createOwnerPreview({
      dist: fileURLToPath(new URL("../artifacts/fawri/dist/public", import.meta.url)),
      tokenHash: process.env.FAWRI_OWNER_PREVIEW_TOKEN_SHA256 ?? "",
      expiresAt: Date.parse(process.env.FAWRI_OWNER_PREVIEW_EXPIRES_AT ?? ""),
      domain,
    });
    server.on("error", () => { console.error("FAWRI_OWNER_PREVIEW_BIND_FAILED"); process.exitCode = 1; });
    server.listen(port, domain ? "0.0.0.0" : "127.0.0.1", () => {
      console.log(domain ? "FAWRI_OWNER_PREVIEW_LISTENING" : `http://127.0.0.1:${server.address().port}/dashboard`);
    });
  } catch {
    console.error("FAWRI_OWNER_PREVIEW_REFUSED");
    process.exitCode = 1;
  }
}
