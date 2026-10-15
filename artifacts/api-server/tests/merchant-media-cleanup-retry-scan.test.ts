import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

test("completed media manifests cannot exhaust the pending retry batch", async (t) => {
  const originalData = process.env.FAWRI_DATA_DIR;
  const originalAuthority = process.env.FAWRI_OPERATIONAL_POSTGRES_AUTHORITY;
  const originalUrl = process.env.DATABASE_URL;
  const dataRoot = fs.mkdtempSync(path.join(os.tmpdir(), "fawri-media-retry-scan-"));
  process.env.FAWRI_DATA_DIR = dataRoot;
  process.env.FAWRI_OPERATIONAL_POSTGRES_AUTHORITY = "required";
  process.env.DATABASE_URL = "postgresql://fawri_test@127.0.0.1:1/fawri_test";
  const { pool } = await import("@workspace/db");
  const query = t.mock.method(pool, "query", async () => ({ rows: [] }));
  t.after(async () => {
    query.mock.restore();
    await pool.end();
    if (originalData === undefined) delete process.env.FAWRI_DATA_DIR;
    else process.env.FAWRI_DATA_DIR = originalData;
    if (originalAuthority === undefined) delete process.env.FAWRI_OPERATIONAL_POSTGRES_AUTHORITY;
    else process.env.FAWRI_OPERATIONAL_POSTGRES_AUTHORITY = originalAuthority;
    if (originalUrl === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = originalUrl;
    fs.rmSync(dataRoot, { recursive: true, force: true });
  });
  const directory = path.join(dataRoot, "merchant-media-cleanup");
  fs.mkdirSync(directory);
  const entries = ["merchant-a", "merchant-b", "merchant-c"].map(merchant => ({
    merchant,
    name: crypto.createHash("sha256").update(merchant).digest("hex") + ".json",
  })).sort((a, b) => a.name.localeCompare(b.name));
  for (const [index, entry] of entries.entries()) {
    fs.writeFileSync(path.join(directory, entry.name), JSON.stringify({
      version: 1, merchant_id: entry.merchant, deletion_request_id: "synthetic-deletion",
      state: index === 0 ? "complete" : "prepared", attempts: 0, entries: [],
      created_at: "2026-01-01T00:00:00Z", updated_at: "2026-01-01T00:00:00Z",
    }));
  }
  assert.equal(fs.readdirSync(directory)[0], entries[0].name);
  const { reconcilePendingMerchantPhysicalMediaCleanups } = await import("../src/services/merchantPhysicalMediaCleanup");
  assert.deepEqual(await reconcilePendingMerchantPhysicalMediaCleanups(1), { inspected: 1, pending: 1 });
  assert.equal(query.mock.callCount(), 1, "the prepared manifest must reach the database commit check");
});
