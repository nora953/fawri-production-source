/** Local rehearsal for a dedicated preview origin. Never mounts the production API. */
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
const fixtures = new Map([
  ["/api/auth/me", { ok: true, merchant }],
  ["/api/auth/lifecycle", { ok: true, lifecycle: { merchant_id: merchant.id,
    account_status: merchant.account_status, merchant_status: merchant.status,
    onboarding_status: merchant.onboarding_status } }],
  ["/api/catalog/products", { ok: true, products: [] }],
  ["/api/orders", { ok: true, orders: [] }],
  ["/api/conversations", { ok: true, conversations: [] }],
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
  const index = await readFile(resolve(root, "index.html"), "utf8");
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
    const server = await createOwnerPreview({
      dist: fileURLToPath(new URL("../artifacts/fawri/dist/public", import.meta.url)),
      tokenHash: process.env.FAWRI_OWNER_PREVIEW_TOKEN_SHA256 ?? "",
      expiresAt: Date.parse(process.env.FAWRI_OWNER_PREVIEW_EXPIRES_AT ?? ""),
    });
    server.on("error", () => { console.error("FAWRI_OWNER_PREVIEW_BIND_FAILED"); process.exitCode = 1; });
    server.listen(0, "127.0.0.1", () => console.log(`http://127.0.0.1:${server.address().port}/dashboard`));
  } catch {
    console.error("FAWRI_OWNER_PREVIEW_REFUSED");
    process.exitCode = 1;
  }
}
