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
  const page = read("fawri/src/pages/dashboard/CommerceCatalogSimplifiedPage.tsx");

  assert.equal(
    activation.trim(),
    "export { default } from './ProductsWorkspacePage.tsx';",
  );
  assert.match(workspace, /import CommerceCatalogPage from ['"]\.\/CommerceCatalogSimplifiedPage['"]/);
  assert.match(workspace, /<CommerceCatalogPage\s*\/>/);

  assert.doesNotMatch(page, /localStorage|sessionStorage/);
  assert.doesNotMatch(page, /\bgetProducts\b|\bsaveProducts\b/);
  assert.doesNotMatch(page, /['"]\/api\/products['"]/);
  assert.doesNotMatch(page, /\/api\/bot\/products\/sync/);
  assert.match(page, /listCatalogProducts\(\)/);
  assert.match(page, /createCatalogProduct/);
  assert.match(page, /updateCatalogProduct/);
  assert.match(page, /deleteCatalogProduct/);
  assert.match(page, /getCatalogProductLocationInventory/);
  assert.match(page, /setCatalogLocationInventory/);
  assert.match(page, /adjustCatalogLocationInventory/);
  assert.match(page, /inventoryLevelVersion/);
  assert.doesNotMatch(page, /expectedVersion:\s*product\.version/);
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

test("catalog media upload is canonical, tenant-scoped, and binary-safe", () => {
  const runtime = read("api-server/src/services/catalogInventoryRuntime.ts");
  const route = read("api-server/src/routes/catalog-operations.ts");
  const storage = read("api-server/src/services/catalogMediaStorage.ts");
  const mediaUi = read("fawri/src/lib/catalogMediaUiApi.ts");
  const editor = read("fawri/src/components/catalog/CatalogImageUploadEditor.tsx");

  assert.match(runtime, /CATALOG_IMAGE_BINARY_FORBIDDEN/);
  assert.match(runtime, /lower\.startsWith\("data:"\)/);
  assert.match(runtime, /lower\.startsWith\("blob:"\)/);
  assert.match(runtime, /image_refs/);

  assert.match(route, /\/catalog\/media\/images/);
  assert.match(route, /storeCatalogImage/);
  assert.match(route, /readCatalogImage/);

  assert.match(storage, /merchantStoragePrefix/);
  assert.match(storage, /detectCatalogImageMime/);
  assert.match(storage, /CATALOG_IMAGE_TYPE_MISMATCH/);
  assert.match(storage, /CATALOG_MEDIA_ACCESS_FORBIDDEN/);

  assert.match(mediaUi, /uploadCatalogImage/);
  assert.match(mediaUi, /body:\s*file/);
  assert.doesNotMatch(mediaUi, /FileReader|FormData|createObjectURL/);

  assert.match(editor, /uploadCatalogImage\(file\)/);
  assert.match(editor, /storage_key:\s*asset\.storage_key/);
  assert.doesNotMatch(editor, /FileReader|FormData/);
  assert.doesNotMatch(editor, /createObjectURL\(file\)/);
  assert.match(editor, /fetch\(protectedRequest/);
  assert.match(editor, /const blob = await response\.blob\(\)/);
  assert.match(editor, /URL\.createObjectURL\(blob\)/);
  assert.match(editor, /URL\.revokeObjectURL/);
});

test("variant-managed product stock remains derived from variant stock", () => {
  const runtime = read("api-server/src/services/catalogInventoryRuntime.ts");
  assert.match(runtime, /const variantStock = variants\.reduce/);
  assert.match(runtime, /CATALOG_STOCK_MISMATCH/);
  assert.match(runtime, /CATALOG_VARIANT_REQUIRED/);
});
