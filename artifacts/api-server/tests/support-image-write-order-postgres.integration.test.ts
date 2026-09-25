import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "fawri-support-image-order-"));
process.env.FAWRI_DATA_DIR = dataDir;
process.env.FAWRI_OPERATIONAL_POSTGRES_AUTHORITY = "required";

const dbModule = await import("@workspace/db");
const pool = dbModule.pool;
const accounts = await import("../src/services/postgresMerchantAccountAuthority.js");
const supportImages = await import("../src/services/postgresSupportImageAuthority.js");

const png = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9ZQmcAAAAASUVORK5CYII=",
  "base64",
);

async function raw(sql: string, values: unknown[] = []) {
  return pool.query(sql, values);
}

async function seedMerchant(phone: string, suffix: string) {
  const created = await accounts.upsertPendingMerchantAuthoritative({
    phone,
    passwordHash: `hash-${suffix}`,
    ownerName: `Owner ${suffix}`,
    storeName: `Store ${suffix}`,
    activityType: "retail",
    language: "en",
    requestedPlan: "silver",
  });
  await accounts.markMerchantOtpVerifiedAuthoritative(created.account.id);
  await raw(
    `UPDATE merchants
        SET status = 'approved', account_status = 'approved',
            onboarding_status = 'channel_connected'
      WHERE id = $1`,
    [created.account.id],
  );
  return created.account.id;
}

async function insertTicket(input: {
  id: string;
  merchantId: string;
  status?: "open" | "in_progress" | "closed";
  assignedAdminId?: string | null;
}) {
  const status = input.status || "open";
  await raw(
    `INSERT INTO support_tickets
      (id, merchant_id, subject, category, status, assigned_admin_account_id,
       waiting_on, waiting_since, closed_at, created_at, updated_at)
     VALUES ($1, $2, 'Image write order', 'technical',
             $3::support_ticket_status, $4,
             CASE WHEN $3::support_ticket_status IN ('open','in_progress')
                  THEN 'admin'::support_waiting_on ELSE NULL END,
             CASE WHEN $3::support_ticket_status IN ('open','in_progress')
                  THEN now() ELSE NULL END,
             CASE WHEN $3::support_ticket_status = 'closed' THEN now() ELSE NULL END,
             now(), now())`,
    [input.id, input.merchantId, status, input.assignedAdminId || null],
  );
}

function allStoredFiles(): string[] {
  const root = path.join(dataDir, "support-images");
  if (!fs.existsSync(root)) return [];
  const files: string[] = [];
  for (const entry of fs.readdirSync(root)) {
    const first = path.join(root, entry);
    const stat = fs.lstatSync(first);
    if (stat.isSymbolicLink()) {
      files.push(`${entry}@symlink`);
      continue;
    }
    if (!stat.isDirectory()) {
      files.push(entry);
      continue;
    }
    for (const file of fs.readdirSync(first)) {
      files.push(`${entry}/${file}`);
    }
  }
  return files.sort();
}

let merchantA = "";
let merchantB = "";

await test("seed support image authorization fixtures", async () => {
  merchantA = await seedMerchant("07719990001", "support-image-a");
  merchantB = await seedMerchant("07719990002", "support-image-b");
  await insertTicket({ id: "ticket-write-open", merchantId: merchantA });
  await insertTicket({
    id: "ticket-write-closed",
    merchantId: merchantA,
    status: "closed",
  });
  await insertTicket({ id: "ticket-write-admin-unassigned", merchantId: merchantA });
  await insertTicket({ id: "ticket-write-symlink", merchantId: merchantA });
});

await test("unauthorized or inactive tickets cause zero filesystem mutation", async () => {
  const before = allStoredFiles();

  await assert.rejects(
    () =>
      supportImages.saveSupportImagePostgres({
        ticketId: "ticket-does-not-exist",
        buffer: png,
        suppliedMime: "image/png",
        fileName: "missing.png",
        senderType: "merchant",
        senderAccountId: merchantA,
        senderName: "Merchant A",
        merchantId: merchantA,
      }),
    (error: unknown) =>
      (error as { code?: string }).code === "SUPPORT_TICKET_NOT_FOUND",
  );
  assert.deepEqual(allStoredFiles(), before);

  await assert.rejects(
    () =>
      supportImages.saveSupportImagePostgres({
        ticketId: "ticket-write-open",
        buffer: png,
        suppliedMime: "image/png",
        fileName: "cross-tenant.png",
        senderType: "merchant",
        senderAccountId: merchantB,
        senderName: "Merchant B",
        merchantId: merchantB,
      }),
    (error: unknown) =>
      (error as { code?: string }).code === "SUPPORT_TICKET_NOT_FOUND",
  );
  assert.deepEqual(allStoredFiles(), before);

  await assert.rejects(
    () =>
      supportImages.saveSupportImagePostgres({
        ticketId: "ticket-write-closed",
        buffer: png,
        suppliedMime: "image/png",
        fileName: "closed.png",
        senderType: "merchant",
        senderAccountId: merchantA,
        senderName: "Merchant A",
        merchantId: merchantA,
      }),
    (error: unknown) =>
      (error as { code?: string }).code === "SUPPORT_TICKET_NOT_ACTIVE",
  );
  assert.deepEqual(allStoredFiles(), before);

  await assert.rejects(
    () =>
      supportImages.saveSupportImagePostgres({
        ticketId: "ticket-write-admin-unassigned",
        buffer: png,
        suppliedMime: "image/png",
        fileName: "unassigned.png",
        senderType: "admin",
        senderAccountId: "unassigned-admin",
        senderName: "Support",
      }),
    (error: unknown) =>
      (error as { code?: string }).code === "SUPPORT_TICKET_ADMIN_MISMATCH",
  );
  assert.deepEqual(allStoredFiles(), before);
});

await test("database rollback removes an already-authorized filesystem write", async () => {
  const before = allStoredFiles();
  await assert.rejects(() =>
    supportImages.saveSupportImagePostgres({
      ticketId: "ticket-write-open",
      buffer: png,
      suppliedMime: "image/png",
      fileName: "rollback.png",
      senderType: "merchant",
      // Authorization is ticket/merchant based, but this intentionally-invalid
      // sender account forces the support_messages FK to fail after the write.
      senderAccountId: "missing-account-after-authorization",
      senderName: "Merchant A",
      merchantId: merchantA,
    }),
  );
  assert.deepEqual(allStoredFiles(), before);

  const rows = await raw(
    `SELECT count(*)::int AS count
       FROM support_attachments
      WHERE ticket_id = $1`,
    ["ticket-write-open"],
  );
  assert.equal(rows.rows[0].count, 0);
});

await test("symlinked ticket directory is rejected before image bytes are persisted", async () => {
  const root = path.join(dataDir, "support-images");
  const outside = fs.mkdtempSync(path.join(os.tmpdir(), "fawri-support-outside-"));
  fs.mkdirSync(root, { recursive: true });
  fs.symlinkSync(outside, path.join(root, "ticket-write-symlink"), "dir");

  await assert.rejects(
    () =>
      supportImages.saveSupportImagePostgres({
        ticketId: "ticket-write-symlink",
        buffer: png,
        suppliedMime: "image/png",
        fileName: "escape.png",
        senderType: "merchant",
        senderAccountId: merchantA,
        senderName: "Merchant A",
        merchantId: merchantA,
      }),
    (error: unknown) =>
      (error as { code?: string }).code === "SUPPORT_IMAGE_STORAGE_INVALID",
  );
  assert.deepEqual(fs.readdirSync(outside), []);
  fs.rmSync(path.join(root, "ticket-write-symlink"), { force: true });
  fs.rmSync(outside, { recursive: true, force: true });
});

await test("authorized image persists and orphan reconciliation removes only unreferenced files", async () => {
  const saved = await supportImages.saveSupportImagePostgres({
    ticketId: "ticket-write-open",
    buffer: png,
    suppliedMime: "image/png",
    fileName: "valid.png",
    senderType: "merchant",
    senderAccountId: merchantA,
    senderName: "Merchant A",
    merchantId: merchantA,
  });
  const livePath = path.join(dataDir, "support-images", saved.attachment.storage_key);
  assert.equal(fs.existsSync(livePath), true);

  const orphanPath = path.join(
    dataDir,
    "support-images",
    "ticket-write-open",
    "orphan-uncommitted.png",
  );
  fs.writeFileSync(orphanPath, png, { mode: 0o600 });
  assert.equal(fs.existsSync(orphanPath), true);

  const reconciled = await supportImages.reconcileOrphanSupportImagesPostgres({
    minimumAgeMs: 0,
  });
  assert.ok(reconciled.inspected >= 2);
  assert.ok(reconciled.removed >= 1);
  assert.equal(fs.existsSync(orphanPath), false);
  assert.equal(fs.existsSync(livePath), true);
});

test.after(async () => {
  await pool.end();
  fs.rmSync(dataDir, { recursive: true, force: true });
});
