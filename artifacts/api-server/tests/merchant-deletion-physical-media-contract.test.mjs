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

function between(text, startMarker, endMarker) {
  const start = text.indexOf(startMarker);
  const end = text.indexOf(endMarker, start + startMarker.length);
  assert.notEqual(start, -1, `missing source marker: ${startMarker}`);
  assert.notEqual(end, -1, `missing source marker: ${endMarker}`);
  return text.slice(start, end);
}

test("irreversible merchant deletion must retire physical catalog and support media, not only PostgreSQL references", () => {
  const management = source("src/services/postgresMerchantManagementAuthority.ts");
  const catalogMedia = source("src/services/catalogMediaStorage.ts");
  const supportMedia = source("src/services/postgresSupportImageAuthority.ts");

  const purge = between(
    management,
    "async function purgeMerchantOperationalData(",
    "export async function completeMerchantDeletionPostgres(",
  );

  assert.match(
    catalogMedia,
    /catalog-media/,
    "catalog media must remain a physical storage concern in this proof",
  );
  assert.match(
    catalogMedia,
    /fs\.(?:writeFileSync|renameSync)/,
    "catalog media proof expects the current filesystem-backed provider",
  );
  assert.match(
    purge,
    /DELETE FROM catalog_image_references WHERE merchant_id = \$1/,
    "merchant deletion is expected to delete catalog media references",
  );

  const catalogPhysicalCleanup =
    /(?:remove|delete|purge)[A-Za-z0-9_]*(?:Catalog|catalog)[A-Za-z0-9_]*(?:Media|Image|media|image)|(?:Catalog|catalog)[A-Za-z0-9_]*(?:Media|Image|media|image)[A-Za-z0-9_]*(?:remove|delete|purge)/.test(
      purge,
    );
  assert.equal(
    catalogPhysicalCleanup,
    true,
    "merchant deletion removes catalog_image_references from PostgreSQL but has no catalog-media physical cleanup step; stored product images can remain orphaned after irreversible merchant deletion",
  );

  assert.match(
    supportMedia,
    /SUPPORT_IMAGE_DIR/,
    "support images must remain a physical storage concern in this proof",
  );
  assert.match(
    supportMedia,
    /fs\.(?:writeFileSync|renameSync)/,
    "support media proof expects the current filesystem-backed provider",
  );
  assert.match(
    purge,
    /DELETE FROM support_attachments WHERE merchant_id = \$1/,
    "merchant deletion is expected to delete support attachment references",
  );

  const supportPhysicalCleanup =
    /(?:remove|delete|purge)[A-Za-z0-9_]*(?:Support|support)[A-Za-z0-9_]*(?:Media|Image|Attachment|media|image|attachment)|(?:Support|support)[A-Za-z0-9_]*(?:Media|Image|Attachment|media|image|attachment)[A-Za-z0-9_]*(?:remove|delete|purge)/.test(
      purge,
    );
  assert.equal(
    supportPhysicalCleanup,
    true,
    "merchant deletion removes support_attachments from PostgreSQL but has no support-image physical cleanup step; uploaded support images can remain on disk after irreversible merchant deletion",
  );
});
