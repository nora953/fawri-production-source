import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test, { after, beforeEach } from "node:test";

const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "fawri-catalog-media-test-"));
process.env.FAWRI_DATA_DIR = dataDir;
process.env.FAWRI_CATALOG_MEDIA_STORAGE_PROVIDER = "filesystem";
process.env.NODE_ENV = "test";

import {
  CatalogMediaError,
  detectCatalogImageMime,
  readCatalogImage,
  removeCatalogMediaStorageObject,
  storeCatalogImage,
} from "../src/services/catalogMediaStorage";

const PNG = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
  0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
]);
const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46]);

beforeEach(() => {
  fs.rmSync(dataDir, { recursive: true, force: true });
  fs.mkdirSync(dataDir, { recursive: true });
});

after(() => {
  fs.rmSync(dataDir, { recursive: true, force: true });
});

test("catalog image response cannot be reused after tenant switch", () => {
  // Browser 'private, max-age' caches are scoped to a browser, not to the
  // currently signed-in merchant. The same browser can be used by A then B.
  const source = fs.readFileSync(
    new URL("../src/routes/catalog-operations.ts", import.meta.url), "utf8",
  );
  const begin = source.indexOf('router.get(\n  "/catalog/media/images",');
  assert.ok(begin >= 0, "merchant image GET route must exist");
  const next = source.indexOf("\nrouter.get(", begin + 1);
  const route = source.slice(begin, next < 0 ? undefined : next);
  assert.match(route, /requireMerchantSession/,
    "merchant session must be required before reading product photos");
  assert.match(route, /res\.setHeader\("Cache-Control", "private, no-store"\)/,
    "private media must not be retained by a shared browser");
  assert.doesNotMatch(route, /max-age\s*=/,
    "a stale authenticated media response must never be reused for a new session");
});

test("catalog media detects supported image content from magic bytes", () => {
  assert.equal(detectCatalogImageMime(PNG), "image/png");
  assert.equal(detectCatalogImageMime(JPEG), "image/jpeg");
  assert.equal(detectCatalogImageMime(Buffer.from("not-an-image")), null);
});

test("catalog media stores and reads an image through a merchant-scoped storage key", async () => {
  const stored = await storeCatalogImage({
    merchantId: "merchant-media-a",
    buffer: PNG,
    suppliedMime: "image/png",
  });

  assert.match(stored.storage_key, /^merchant\/[a-f0-9]{32}\/[0-9a-f-]{36}\.png$/i);
  assert.equal(stored.mime_type, "image/png");
  assert.equal(stored.size_bytes, PNG.length);
  assert.match(stored.sha256, /^[a-f0-9]{64}$/);
  assert.equal(
    stored.preview_url,
    `/api/catalog/media/images?storage_key=${encodeURIComponent(stored.storage_key)}`,
  );

  const read = await readCatalogImage({
    merchantId: "merchant-media-a",
    storageKey: stored.storage_key,
  });
  assert.equal(read.mime_type, "image/png");
  assert.deepEqual(read.buffer, PNG);
  assert.equal(read.sha256, stored.sha256);
});

test("V1 catalog uploads commit privately without leftover temporary files", async () => {
  const stored = await storeCatalogImage({
    merchantId: "merchant-media-private-v1",
    buffer: PNG,
    suppliedMime: "image/png",
  });
  const location = path.join(dataDir, "catalog-media", stored.storage_key);
  const parent = path.dirname(location);

  // Other OS accounts must not read merchant media bytes even if the
  // underlying persistent disk is mounted into another process.
  assert.equal(fs.statSync(location).mode & 0o777, 0o600);
  assert.equal(fs.statSync(parent).mode & 0o777, 0o700);
  assert.deepEqual(fs.readFileSync(location), PNG);
  assert.deepEqual(fs.readdirSync(parent), [path.basename(location)],
    "the API acknowledgement must not leave a temporary upload");
  const read = await readCatalogImage({
    merchantId: "merchant-media-private-v1",
    storageKey: stored.storage_key,
  });
  assert.equal(read.sha256, stored.sha256);
});

test("V1 production rejects image writes, reads and deletion when the durable mount is absent", async (t) => {
  const merchantId = "merchant-media-unmounted";
  const original = await storeCatalogImage({
    merchantId, buffer: PNG, suppliedMime: "image/png",
  });
  const existingFile = path.join(dataDir, "catalog-media", original.storage_key);
  const originalBytes = fs.readFileSync(existingFile);
  const keys = [
    "NODE_ENV", "FAWRI_DEPLOYMENT_MODE", "FAWRI_V1_MANUAL_COMMERCE",
    "FAWRI_PERSISTENT_MEDIA_MOUNT_PATH", "FAWRI_DATA_DIR",
    "FAWRI_CATALOG_MEDIA_STORAGE_PROVIDER",
  ] as const;
  const saved = Object.fromEntries(keys.map(key => [key, process.env[key]]));
  t.after(() => {
    for (const key of keys) {
      if (saved[key] === undefined) delete process.env[key];
      else process.env[key] = saved[key];
    }
  });
  // An ordinary temporary directory is NOT a real persistent mount; even if
  // it is writable, it must not receive new product photos under V1 production.
  Object.assign(process.env, {
    NODE_ENV: "production",
    FAWRI_DEPLOYMENT_MODE: "production",
    FAWRI_V1_MANUAL_COMMERCE: "1",
    FAWRI_PERSISTENT_MEDIA_MOUNT_PATH: dataDir,
    FAWRI_DATA_DIR: path.join(dataDir, "fawri"),
    FAWRI_CATALOG_MEDIA_STORAGE_PROVIDER: "filesystem",
  });
  const isUnavailable = (error: unknown) =>
    error instanceof CatalogMediaError &&
    error.code === "CATALOG_MEDIA_MOUNT_NOT_READY" &&
    error.status === 503;
  await assert.rejects(
    () => storeCatalogImage({ merchantId, buffer: PNG, suppliedMime: "image/png" }),
    isUnavailable,
  );
  await assert.rejects(
    () => readCatalogImage({ merchantId, storageKey: original.storage_key }),
    isUnavailable,
  );
  await assert.rejects(
    () => removeCatalogMediaStorageObject({
      merchantId, storageProvider: "filesystem", storageKey: original.storage_key,
    }),
    isUnavailable,
  );
  assert.deepEqual(fs.readFileSync(existingFile), originalBytes,
    "a missing persistent mount must not change an existing merchant image");
  assert.equal(fs.existsSync(path.join(dataDir, "fawri", "catalog-media")), false,
    "no silent fallback to a fresh container media directory");
});

test("catalog media rejects MIME spoofing before writing a file", async () => {
  await assert.rejects(
    () =>
      storeCatalogImage({
        merchantId: "merchant-media-a",
        buffer: PNG,
        suppliedMime: "image/jpeg",
      }),
    (error: unknown) => {
      assert.ok(error instanceof CatalogMediaError);
      assert.equal(error.code, "CATALOG_IMAGE_TYPE_MISMATCH");
      assert.equal(error.status, 415);
      return true;
    },
  );
});

test("catalog media storage keys cannot be read across merchants", async () => {
  const stored = await storeCatalogImage({
    merchantId: "merchant-media-left",
    buffer: JPEG,
    suppliedMime: "image/jpeg",
  });

  await assert.rejects(
    () =>
      readCatalogImage({
        merchantId: "merchant-media-right",
        storageKey: stored.storage_key,
      }),
    (error: unknown) => {
      assert.ok(error instanceof CatalogMediaError);
      assert.equal(error.code, "CATALOG_MEDIA_ACCESS_FORBIDDEN");
      assert.equal(error.status, 403);
      return true;
    },
  );
});

test("catalog media rejects traversal-like storage keys", async () => {
  await assert.rejects(
    () =>
      readCatalogImage({
        merchantId: "merchant-media-a",
        storageKey: "../../secret.png",
      }),
    (error: unknown) => {
      assert.ok(error instanceof CatalogMediaError);
      assert.equal(error.code, "CATALOG_MEDIA_ACCESS_FORBIDDEN");
      return true;
    },
  );
});

test("physical cleanup rejects a forged foreign image key before unlink", async () => {
  const left = await storeCatalogImage({
    merchantId: "merchant-media-delete-left",
    buffer: PNG,
    suppliedMime: "image/png",
  });
  const right = await storeCatalogImage({
    merchantId: "merchant-media-delete-right",
    buffer: JPEG,
    suppliedMime: "image/jpeg",
  });

  await assert.rejects(
    () => removeCatalogMediaStorageObject({
      merchantId: "merchant-media-delete-left",
      storageProvider: "filesystem",
      storageKey: right.storage_key,
    }),
    (error: unknown) =>
      error instanceof CatalogMediaError &&
      error.code === "CATALOG_MEDIA_ACCESS_FORBIDDEN" &&
      error.status === 403,
  );
  assert.deepEqual((await readCatalogImage({
    merchantId: "merchant-media-delete-right",
    storageKey: right.storage_key,
  })).buffer, JPEG, "foreign merchant image survives forged cleanup reference");

  await removeCatalogMediaStorageObject({
    merchantId: "merchant-media-delete-left",
    storageProvider: "filesystem",
    storageKey: left.storage_key,
  });
  await assert.rejects(() => readCatalogImage({
    merchantId: "merchant-media-delete-left",
    storageKey: left.storage_key,
  }), (error: unknown) =>
    error instanceof CatalogMediaError && error.code === "CATALOG_IMAGE_NOT_FOUND",
  );
  assert.deepEqual((await readCatalogImage({
    merchantId: "merchant-media-delete-right",
    storageKey: right.storage_key,
  })).buffer, JPEG);
});
