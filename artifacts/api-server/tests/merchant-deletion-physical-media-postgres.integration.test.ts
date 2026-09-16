import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

const DATABASE_URL = String(process.env.DATABASE_URL || "").trim();

if (DATABASE_URL) {
  const parsed = new URL(DATABASE_URL);
  assert.ok(
    parsed.hostname === "127.0.0.1" || parsed.hostname === "localhost",
    "physical-media deletion regression only permits local PostgreSQL",
  );
  assert.equal(
    parsed.pathname.replace(/^\//, ""),
    "fawri_ci",
    "physical-media deletion regression only permits the fawri_ci database",
  );
}

function randomPhone(): string {
  return `07${String(crypto.randomInt(0, 1_000_000_000)).padStart(9, "0")}`;
}

function suffix(): string {
  return crypto.randomUUID().replace(/-/g, "").slice(0, 12);
}

test(
  "irreversible merchant deletion physically retires catalog and support media after the PostgreSQL tombstone commits",
  { skip: !DATABASE_URL },
  async (t) => {
    const dataRoot = fs.mkdtempSync(
      path.join(os.tmpdir(), "fawri-merchant-media-delete-"),
    );
    Object.assign(process.env, {
      NODE_ENV: "test",
      FAWRI_OPERATIONAL_POSTGRES_AUTHORITY: "required",
      FAWRI_PASSWORD_SALT:
        "physical-media-deletion-test-password-salt-over-thirty-two-characters",
      FAWRI_DATA_DIR: dataRoot,
      FAWRI_CATALOG_MEDIA_STORAGE_PROVIDER: "filesystem",
    });

    const [
      { pool },
      { hashPassword },
      merchantAccounts,
      merchantManagement,
      catalogMedia,
      supportImages,
      physicalCleanup,
    ] = await Promise.all([
      import("@workspace/db"),
      import("../src/services/authPasswordService.js"),
      import("../src/services/postgresMerchantAccountAuthority.js"),
      import("../src/services/postgresMerchantManagementAuthority.js"),
      import("../src/services/catalogMediaStorage.js"),
      import("../src/services/postgresSupportImageAuthority.js"),
      import("../src/services/merchantPhysicalMediaCleanup.js"),
    ]);

    const proof = suffix();
    const merchantPhone = randomPhone();
    const adminPhone = randomPhone();
    const adminId = `media-delete-admin-${proof}`;
    const productId = `media-delete-product-${proof}`;
    const imageRefId = `media-delete-image-${proof}`;
    const ticketId = `media-delete-ticket-${proof}`;
    let merchantId = "";

    t.after(async () => {
      await pool.end();
      fs.rmSync(dataRoot, { recursive: true, force: true });
    });

    const collisions = await pool.query(
      "SELECT id FROM accounts WHERE phone = ANY($1::text[]) LIMIT 1",
      [[merchantPhone, adminPhone]],
    );
    assert.equal(collisions.rows.length, 0);

    await pool.query(
      `INSERT INTO accounts (
         id, kind, phone, password_hash, state, language,
         phone_verified, phone_verified_at, created_at, updated_at
       ) VALUES ($1, 'admin', $2, $3, 'active', 'en', true, now(), now(), now())`,
      [adminId, adminPhone, hashPassword("PhysicalMediaDeletionAdmin9!")],
    );
    await pool.query(
      `INSERT INTO admin_profiles (
         id, account_id, profile_kind, display_name, role,
         enabled, must_change_password, created_at, updated_at
       ) VALUES ($1, $1, 'admin', $2, 'owner_admin', true, false, now(), now())`,
      [adminId, `Physical Media Owner ${proof}`],
    );

    const merchant = await merchantAccounts.upsertPendingMerchantAuthoritative({
      phone: merchantPhone,
      passwordHash: hashPassword("PhysicalMediaDeletionMerchant9!"),
      ownerName: `Physical Media Merchant ${proof}`,
      storeName: `Physical Media Store ${proof}`,
      activityType: "retail",
      language: "en",
      requestedPlan: "silver",
    });
    merchantId = merchant.account.id;
    await merchantAccounts.markMerchantOtpVerifiedAuthoritative(merchantId);
    await pool.query(
      `UPDATE merchants
          SET status = 'approved',
              account_status = 'approved',
              onboarding_status = 'channel_connected',
              updated_at = now()
        WHERE id = $1`,
      [merchantId],
    );

    await pool.query(
      `INSERT INTO products (id, merchant_id, name, created_at, updated_at)
       VALUES ($1, $2, $3, now(), now())`,
      [productId, merchantId, `Physical media product ${proof}`],
    );

    const imageBytes = Buffer.from([0xff, 0xd8, 0xff, 0xd9]);
    const catalogUpload = await catalogMedia.storeCatalogImage({
      merchantId,
      buffer: imageBytes,
      suppliedMime: "image/jpeg",
    });
    await pool.query(
      `INSERT INTO catalog_image_references (
         id, merchant_id, product_id, storage_key, ordinal, created_at
       ) VALUES ($1, $2, $3, $4, 0, now())`,
      [imageRefId, merchantId, productId, catalogUpload.storage_key],
    );
    const catalogFile = path.join(
      dataRoot,
      "catalog-media",
      catalogUpload.storage_key,
    );
    assert.equal(fs.existsSync(catalogFile), true);

    await pool.query(
      `INSERT INTO support_tickets (
         id, merchant_id, subject, category, status, metadata,
         created_at, updated_at
       ) VALUES ($1, $2, $3, 'account', 'open', '{}'::jsonb, now(), now())`,
      [ticketId, merchantId, `Physical media ticket ${proof}`],
    );
    const supportUpload = await supportImages.saveSupportImagePostgres({
      ticketId,
      buffer: imageBytes,
      suppliedMime: "image/jpeg",
      fileName: "proof.jpg",
      senderType: "merchant",
      senderAccountId: merchantId,
      senderName: "Merchant",
      merchantId,
    });
    const supportFile = path.join(
      dataRoot,
      "support-images",
      supportUpload.attachment.storage_key,
    );
    assert.equal(fs.existsSync(supportFile), true);

    await merchantManagement.updateMerchantStatusPostgres({
      merchantId,
      status: "suspended",
      reason: "physical media deletion proof",
      actorAdminId: adminId,
    });
    const deletionRequest = await merchantManagement.createDeletionRequestPostgres({
      merchantId,
      reason: "policy_violation",
      details: "physical media deletion proof",
      actorAdminId: adminId,
    });

    const deleted =
      await physicalCleanup.completeMerchantDeletionWithPhysicalMediaCleanup({
        merchantId,
        deletionRequestId: deletionRequest.id,
        actorAdminId: adminId,
      });
    assert.equal(deleted.ok, true);

    assert.equal(fs.existsSync(catalogFile), false);
    assert.equal(fs.existsSync(supportFile), false);
    assert.equal(
      fs.existsSync(path.join(dataRoot, "support-images", ticketId)),
      false,
    );

    const catalogReferences = await pool.query(
      "SELECT id FROM catalog_image_references WHERE merchant_id = $1",
      [merchantId],
    );
    const supportAttachments = await pool.query(
      "SELECT id FROM support_attachments WHERE merchant_id = $1",
      [merchantId],
    );
    assert.equal(catalogReferences.rowCount, 0);
    assert.equal(supportAttachments.rowCount, 0);

    const tombstone = await pool.query<{
      account_state: string;
      retention_status: string | null;
    }>(
      `SELECT a.state::text AS account_state, m.retention_status
         FROM merchants m
         JOIN accounts a ON a.id = m.account_id
        WHERE m.id = $1`,
      [merchantId],
    );
    assert.deepEqual(tombstone.rows[0], {
      account_state: "closed",
      retention_status: "deleted",
    });

    const manifestDirectory = path.join(dataRoot, "merchant-media-cleanup");
    const manifests = fs
      .readdirSync(manifestDirectory)
      .filter((name) => name.endsWith(".json"));
    assert.equal(manifests.length, 1);
    const manifest = JSON.parse(
      fs.readFileSync(path.join(manifestDirectory, manifests[0]!), "utf8"),
    ) as {
      state: string;
      attempts: number;
      entries: unknown[];
      completed_at?: string;
    };
    assert.equal(manifest.state, "complete");
    assert.ok(manifest.attempts >= 1);
    assert.deepEqual(manifest.entries, []);
    assert.ok(manifest.completed_at);

    const retried =
      await physicalCleanup.reconcileMerchantPhysicalMediaCleanup(merchantId);
    assert.deepEqual(retried, { status: "complete", remaining: 0 });
  },
);
