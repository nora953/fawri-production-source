import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const testDirectory = path.dirname(fileURLToPath(import.meta.url));
const apiRoot = path.resolve(testDirectory, "..");
const workspaceArtifacts = path.resolve(apiRoot, "..");

function read(relativePath) {
  return fs.readFileSync(path.resolve(workspaceArtifacts, relativePath), "utf8");
}

test("catalog router derives the tenant from the authenticated session", () => {
  const source = read("api-server/src/routes/catalog-operations.ts");
  assert.match(source, /requireMerchantSession/);
  assert.match(source, /getMerchantIdFromSession\(res\)/);
  assert.doesNotMatch(source, /req\.query\??\.merchant/i);
  assert.doesNotMatch(source, /req\.params\??\.merchant/i);
  assert.match(source, /MERCHANT_ACCESS_FORBIDDEN/);
});

test("active products entry exposes the canonical server-authoritative catalog UI", () => {
  const page = read("fawri/src/pages/dashboard/ProductsPage.tsx");
  const activation = read("fawri/src/pages/dashboard/ProductsPage.ts");

  assert.doesNotMatch(page, /localStorage|sessionStorage/);
  assert.doesNotMatch(page, /\bgetProducts\b|\bsaveProducts\b/);
  assert.doesNotMatch(page, /['"]\/api\/products['"]/);
  assert.doesNotMatch(page, /\/api\/bot\/products\/sync/);
  assert.match(page, /listCatalogProducts\(\)/);
  assert.match(page, /createCatalogProduct/);
  assert.match(page, /updateCatalogProduct/);
  assert.match(page, /deleteCatalogProduct/);
  assert.equal(
    activation.trim(),
    "export { default } from './ProductsPage.tsx';",
  );
});

test("catalog runtime does not persist embedded image payloads", () => {
  const source = read("api-server/src/services/catalogInventoryRuntime.ts");
  assert.match(source, /CATALOG_IMAGE_BINARY_FORBIDDEN/);
  assert.match(source, /data:|base64|blob:/);
  assert.match(source, /image_refs/);
});
