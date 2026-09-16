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
