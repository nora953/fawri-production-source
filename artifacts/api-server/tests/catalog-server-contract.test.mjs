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

test("active products workspace exposes the canonical server-authoritative catalog UI", () => {
  const activation = read("fawri/src/pages/dashboard/ProductsPage.ts");
  const workspace = read("fawri/src/pages/dashboard/ProductsWorkspacePage.tsx");
  const page = read("fawri/src/pages/dashboard/CommerceCatalogPage.tsx");

  assert.equal(
    activation.trim(),
    "export { default } from './ProductsWorkspacePage.tsx';",
  );
  assert.match(workspace, /import CommerceCatalogPage from ['"]\.\/CommerceCatalogPage['"]/);
  assert.match(workspace, /<CommerceCatalogPage\s*\/>/);

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
});

test("catalog inventory routes preserve PostgreSQL authority, version, and variant scope", () => {
  const source = read("api-server/src/routes/catalog-operations.ts");
  assert.match(source, /setCatalogInventoryAuthoritative/);
  assert.match(source, /adjustCatalogInventoryAuthoritative/);
  assert.match(source, /\/inventory\/products\/:productId\/set/);
  assert.match(source, /setCatalogInventoryAuthoritative\(\{/);
  assert.match(source, /variantId: req\.body\?\.variant_id/);
  assert.match(source, /expectedVersion: req\.body\?\.expected_version/);
  assert.match(source, /quantity: req\.body\?\.quantity/);
  assert.match(source, /\/inventory\/products\/:productId\/adjust/);
  assert.match(source, /adjustCatalogInventoryAuthoritative\(\{/);
  assert.match(source, /delta: req\.body\?\.delta/);
  assert.match(source, /idempotencyKey: idempotencyKey\(req\)/);
});

test("catalog runtime does not persist embedded image payloads or invent upload authority", () => {
  const source = read("api-server/src/services/catalogInventoryRuntime.ts");
  const page = read("fawri/src/pages/dashboard/CommerceCatalogPage.tsx");
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
