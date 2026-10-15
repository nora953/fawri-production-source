import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const testDirectory = path.dirname(fileURLToPath(import.meta.url));
const apiRoot = path.resolve(testDirectory, "..");
const repositoryRoot = path.resolve(apiRoot, "../..");

function source(relativePath) {
  return fs.readFileSync(path.join(repositoryRoot, relativePath), "utf8");
}

function between(text, startMarker, endMarker) {
  const start = text.indexOf(startMarker);
  const end = text.indexOf(endMarker, start + startMarker.length);
  assert.notEqual(start, -1, `missing source marker: ${startMarker}`);
  assert.notEqual(end, -1, `missing source marker: ${endMarker}`);
  return text.slice(start, end);
}

test("irreversible merchant deletion must retire merchant-scoped delivery promotions", () => {
  const management = source(
    "artifacts/api-server/src/services/postgresMerchantManagementAuthority.ts",
  );
  const promotions = source("lib/db/src/schema/commerce-promotions.ts");

  assert.match(
    promotions,
    /scope:\s*commercePromotionScopeEnum\("scope"\)\.notNull\(\)/,
    "promotion lifecycle proof expects merchant-scoped promotion rows",
  );
  assert.match(
    promotions,
    /\$\{table\.scope\}\s*=\s*'delivery'[\s\S]*\$\{table\.productId\}\s+IS\s+NULL[\s\S]*\$\{table\.variantId\}\s+IS\s+NULL/,
    "delivery promotions intentionally have no product/variant target and therefore cannot rely on catalog-row cascade deletion",
  );
  assert.match(
    promotions,
    /name:\s*text\("name"\)\.notNull\(\)/,
    "promotion rows contain merchant-authored operational text",
  );
  assert.match(
    promotions,
    /metadata:\s*jsonb\("metadata"\)/,
    "promotion rows contain merchant operational metadata",
  );

  const purge = between(
    management,
    "async function purgeMerchantOperationalData(",
    "export async function completeMerchantDeletionPostgres(",
  );

  assert.match(
    purge,
    /DELETE FROM products WHERE merchant_id = \$1/,
    "merchant deletion currently retires the catalog",
  );
  assert.match(
    purge,
    /DELETE FROM commerce_promotions WHERE merchant_id = \$1/,
    "merchant deletion can leave delivery-scoped commerce promotions behind because they do not reference a product and the merchant row is tombstoned rather than deleted",
  );

  assert.match(
    management,
    /UPDATE merchants[\s\S]*retention_status = 'deleted'/,
    "merchant deletion uses a retained tombstone row, so merchant-level cascade is not a cleanup mechanism",
  );
  assert.doesNotMatch(
    management,
    /DELETE FROM merchants\s+WHERE id = \$1/,
    "this regression targets the current tombstone lifecycle",
  );
});
