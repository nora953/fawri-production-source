/** Run against the compiled V1 preview with separate Playwright/Chromium tooling. */
import assert from "node:assert/strict";
import { createHash, randomBytes } from "node:crypto";
import { createRequire } from "node:module";
import { isAbsolute, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createOwnerPreview } from "../run-fawri-owner-preview.mjs";

const tooling = process.env.FAWRI_PREVIEW_BROWSER_TOOLING;
assert.ok(tooling && isAbsolute(tooling), "Set FAWRI_PREVIEW_BROWSER_TOOLING to the browser tooling directory");
const require = createRequire(join(tooling, "package.json"));
const { chromium } = require("playwright-core");
const packed = require("@sparticuz/chromium").default;
const token = randomBytes(32).toString("hex");
const dist = fileURLToPath(new URL("../../artifacts/fawri/dist/public/", import.meta.url));
const server = await createOwnerPreview({
  dist, tokenHash: createHash("sha256").update(token).digest("hex"), expiresAt: Date.now() + 120_000,
});
await new Promise((resolve, reject) => {
  server.once("error", reject);
  server.listen(0, "127.0.0.1", resolve);
});
const origin = "http://127.0.0.1:" + server.address().port;
let browser;
try {
  browser = await chromium.launch({ executablePath: await packed.executablePath(), args: packed.args, timeout: 20_000 });
  const authenticated = await browser.newContext({ httpCredentials: { username: "owner", password: token, origin } });
  await authenticated.route("**/*", route => {
    if (new URL(route.request().url()).origin !== origin) return route.abort();
    return route.continue();
  });
  const cases = [
    ["/dashboard", "نظرة عامة", ["/api/auth/subscription/current", "/api/catalog/products"]],
    ["/dashboard/products", "المنتجات والخدمات", ["/api/catalog/products", "/api/catalog/context"]],
    ["/dashboard/orders", "الطلبات", ["/api/orders", "/api/merchant/regional"]],
  ];
  for (const [path, heading, fixturePaths] of cases) {
    const page = await authenticated.newPage();
    const uncaughtErrors = [];
    const failedApi = [];
    page.on("pageerror", error => uncaughtErrors.push(error.name));
    page.on("response", response => {
      const pathname = new URL(response.url()).pathname;
      if (pathname.startsWith("/api/") && response.status() >= 400) failedApi.push(pathname);
    });
    const fixtures = fixturePaths.map(expected => page.waitForResponse(response =>
      new URL(response.url()).pathname === expected && response.status() === 200, { timeout: 10_000 }));
    await Promise.all([page.goto(origin + path, { waitUntil: "domcontentloaded" }), ...fixtures]);
    await page.getByRole("heading", { name: heading, exact: true }).first().waitFor({ timeout: 10_000 });
    assert.equal(new URL(page.url()).pathname, path);
    assert.deepEqual(uncaughtErrors, []);
    assert.deepEqual(failedApi, []);
    await page.close();
    console.log("FAWRI_PREVIEW_BROWSER_PASS", path);
  }
} finally {
  await browser?.close();
  await new Promise(resolve => server.close(resolve));
}
