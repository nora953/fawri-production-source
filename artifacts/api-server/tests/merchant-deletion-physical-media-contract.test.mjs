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
    /reconcileMerchantPhysicalMediaCleanup\(input\.merchantId\)\.catch\(\(error\) => \{[\s\S]*logCleanupFailure\(error,[\s\S]*phase: "post_commit"/,
    "post-commit provider failure must remain retryable and become observable without restoring merchant access",
  );
  assert.equal(
    coordinator.includes("void run().catch(() => null)"),
    false,
    "scheduled cleanup failures must never be swallowed silently",
  );
  assert.match(
    coordinator,
    /PHYSICAL_MEDIA_CLEANUP_PENDING/,
    "pending cleanup work must emit an operational warning",
  );
  assert.match(
    coordinator,
    /merchantLogHash/,
    "cleanup logs must use a hashed merchant identifier instead of raw merchant identity",
  );

  assert.match(
    coordinator,
    /removeCatalogMediaStorageObject\(\{\s*merchantId,/,
    "the physical deletion worker must bind every catalog key to its merchant",
  );
  assert.match(
    catalogMedia,
    /const storageKey = assertMerchantStorageKey\(params\.merchantId, params\.storageKey\)/,
    "provider object cleanup must reject cross-merchant or forged storage keys",
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

test("V1 restricted tenant cannot read deleted-merchant tombstones; cleanup uses trusted auth issuer", () => {
  const coordinator = source("src/services/merchantPhysicalMediaCleanup.ts");
  const tenantGrants = fs.readFileSync(path.resolve(apiRoot,
    "../../lib/db/first-commercial/held/v1_tenant_online_commerce_grants.sql"), "utf8");
  const authGrants = fs.readFileSync(path.resolve(apiRoot,
    "../../lib/db/first-commercial/held/v1_authentication_core_grants.sql"), "utf8");

  assert.match(tenantGrants, /No SELECT\/UPDATE on merchants is granted to the tenant LOGIN/);
  assert.match(authGrants, /GRANT SELECT, INSERT, UPDATE, DELETE ON\s+public\.accounts,/);
  assert.match(authGrants, /GRANT SELECT, INSERT, UPDATE ON\s+public\.merchants,/);
  assert.match(coordinator, /const rows = productionReleaseGateRequired\(\)\s+\? await withAuthenticationTransaction\(client =>\s+operationalQueryRows<DeletionTombstone>\(client, query, \[merchantId\]\)\)/);
  assert.match(coordinator, /WHERE m\.id = \$1\s+LIMIT 1/);
  assert.match(coordinator, /rows\[0\]\?\.account_state === "closed"/);
  assert.match(coordinator, /rows\[0\]\?\.retention_status === "deleted"/);
});

test("manual V1 deletion capture reads protected identity with issuer and excludes deferred Support", () => {
  const coordinator = source("src/services/merchantPhysicalMediaCleanup.ts");
  const tenantGrants = fs.readFileSync(path.resolve(apiRoot,
    "../../lib/db/first-commercial/held/v1_tenant_online_commerce_grants.sql"), "utf8");
  assert.match(tenantGrants, /No SELECT\/UPDATE on merchants is granted to the tenant LOGIN/);
  assert.match(coordinator, /manualCommercialRelease\(\)\s+\? await \(async \(\) => \{/);
  assert.match(coordinator, /const identity = await withAuthenticationTransaction\(client =>\s+operationalQueryRows<MerchantStateRow>\(client, merchantSql, \[input\.merchantId\]\)\)/);
  assert.match(coordinator, /const catalog = await withMerchantOperationalTransaction\(\s+input\.merchantId,\s+client => operationalQueryRows<CatalogRow>\(client, catalogSql, \[input\.merchantId\]\)/);
  assert.match(coordinator, /return \[identity, catalog, \[\] as SupportRow\[\], \[\] as TicketRow\[\]\] as const/);
  assert.match(coordinator, /: await withMerchantOperationalTransaction\(input\.merchantId, async client => \[/);
});
