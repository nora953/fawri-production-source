import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const testDirectory = path.dirname(fileURLToPath(import.meta.url));
const apiRoot = path.resolve(testDirectory, "..");

function source(relativePath) {
  return fs.readFileSync(path.join(apiRoot, relativePath), "utf8");
}

test("irreversible merchant deletion owns durable post-commit physical media retirement", () => {
  const route = source("src/routes/auth-merchant-management-postgres-routes.ts");
  const coordinator = source("src/services/merchantPhysicalMediaCleanup.ts");
  const catalogMedia = source("src/services/catalogMediaStorage.ts");
  const supportStorage = source("src/services/supportImageStorage.ts");
  const runtime = source("src/index.ts");

  assert.match(
    route,
    /completeMerchantDeletionWithPhysicalMediaCleanup\(/,
    "the production irreversible-delete route must use the media cleanup coordinator",
  );

  assert.match(
    coordinator,
    /catalog_image_references[\s\S]*storage_key IS NOT NULL/,
    "catalog storage keys must be captured while PostgreSQL references still exist",
  );
  assert.match(
    coordinator,
    /SELECT storage_provider, storage_key[\s\S]*FROM support_attachments/,
    "support storage provider/key pairs must be captured before relational purge",
  );
  assert.match(
    coordinator,
    /support_tickets[\s\S]*WHERE merchant_id = \$1/,
    "support ticket prefixes must be captured so racing files under a deleted ticket are also retired",
  );
  assert.match(
    coordinator,
    /writeManifest\(manifest\)[\s\S]*completeMerchantDeletionPostgres\(input\)/,
    "cleanup intent must be persisted before the database deletion transaction is attempted",
  );
  assert.match(
    coordinator,
    /deletionIsCommitted[\s\S]*account_state === "closed"[\s\S]*retention_status === "deleted"/,
    "physical deletion must require a committed irreversible merchant tombstone",
  );
  assert.match(
    coordinator,
    /state: remaining\.length === 0 \? "complete" : "pending"/,
    "failed provider deletion must remain explicitly pending for retry",
  );
  assert.match(
    coordinator,
    /reconcileMerchantPhysicalMediaCleanup\(input\.merchantId\)\.catch\(\(\) => null\)/,
    "post-commit provider failure must not restore or roll back deleted merchant access",
  );

  assert.match(
    catalogMedia,
    /removeCatalogMerchantMedia/,
    "catalog storage must expose provider-level merchant-prefix retirement",
  );
  assert.match(
    catalogMedia,
    /removePrefix/,
    "catalog cleanup must remain behind the storage-provider abstraction",
  );
  assert.match(
    supportStorage,
    /removeSupportImageStorageObject/,
    "support object deletion must remain behind a storage-provider boundary",
  );
  assert.match(
    supportStorage,
    /removeSupportTicketImageStoragePrefix/,
    "support ticket-prefix retirement must be idempotent and provider-owned",
  );

  assert.match(
    runtime,
    /startMerchantPhysicalMediaCleanupReconciler/,
    "runtime startup must retry persisted cleanup work instead of silently forgetting failed physical deletion",
  );
});
