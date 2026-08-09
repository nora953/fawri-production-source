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
  assert.match(page, /setCatalogInventory/);
  assert.match(page, /adjustCatalogInventory/);
  assert.equal(
    activation.trim(),
    "export { default } from './ProductsPage.tsx';",
  );
});

test("catalog inventory routes preserve version and variant scope authority", () => {
  const source = read("api-server/src/routes/catalog-operations.ts");
  assert.match(source, /\/inventory\/products\/:productId\/set/);
  assert.match(source, /setCatalogInventory\(\{/);
  assert.match(source, /variantId: req\.body\?\.variant_id/);
  assert.match(source, /expectedVersion: req\.body\?\.expected_version/);
  assert.match(source, /quantity: req\.body\?\.quantity/);
  assert.match(source, /\/inventory\/products\/:productId\/adjust/);
  assert.match(source, /adjustCatalogInventory\(\{/);
  assert.match(source, /delta: req\.body\?\.delta/);
  assert.match(source, /idempotencyKey: idempotencyKey\(req\)/);
});

test("catalog runtime does not persist embedded image payloads or invent upload authority", () => {
  const source = read("api-server/src/services/catalogInventoryRuntime.ts");
  const page = read("fawri/src/pages/dashboard/ProductsPage.tsx");
  assert.match(source, /CATALOG_IMAGE_BINARY_FORBIDDEN/);
  assert.match(source, /data:|base64|blob:/);
  assert.match(source, /image_refs/);
  assert.doesNotMatch(page, /FileReader|FormData|createObjectURL|Cloudinary|S3/);
  assert.match(page, /imageReferenceOnly/);
});

test("variant-managed product stock remains derived from variant stock", () => {
  const runtime = read("api-server/src/services/catalogInventoryRuntime.ts");
  assert.match(runtime, /const variantStock = variants\.reduce/);
  assert.match(runtime, /CATALOG_STOCK_MISMATCH/);
  assert.match(runtime, /CATALOG_VARIANT_REQUIRED/);
});
