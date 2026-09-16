import assert from "node:assert/strict";
import crypto from "node:crypto";
import test from "node:test";

const DATABASE_URL = String(process.env.DATABASE_URL || "").trim();

if (DATABASE_URL) {
  const parsed = new URL(DATABASE_URL);
  assert.ok(
    parsed.hostname === "127.0.0.1" || parsed.hostname === "localhost",
    "Meta OAuth cutoff regression only permits local PostgreSQL",
  );
  assert.equal(
    parsed.pathname.replace(/^\//, ""),
    "fawri_ci",
    "Meta OAuth cutoff regression only permits the fawri_ci database",
  );
}

function randomPhone(): string {
  return `07${String(crypto.randomInt(0, 1_000_000_000)).padStart(9, "0")}`;
}

function suffix(): string {
  return crypto.randomUUID().replace(/-/g, "").slice(0, 12);
}

test(
  "Meta channel credentials cannot be persisted after merchant operational access is revoked",
  { skip: !DATABASE_URL },
  async (t) => {
    Object.assign(process.env, {
      NODE_ENV: "test",
      FAWRI_OPERATIONAL_POSTGRES_AUTHORITY: "required",
      FAWRI_META_TOKEN_KEY_ID: "meta-oauth-cutoff-test-key",
      FAWRI_META_TOKEN_KEY_BASE64: Buffer.alloc(32, 23).toString("base64"),
    });

    const [{ pool }, accounts, channels] = await Promise.all([
      import("@workspace/db"),
      import("../src/services/postgresMerchantAccountAuthority.js"),
      import("../src/services/postgresMetaChannelAuthority.js"),
    ]);

    const proof = suffix();
    const phone = randomPhone();
    let merchantId = "";

    t.after(async () => {
      if (merchantId) {
        await pool
          .query("DELETE FROM accounts WHERE id = $1", [merchantId])
          .catch(() => undefined);
      }
      await pool.end();
    });

    const collision = await pool.query(
      "SELECT id FROM accounts WHERE phone = $1 LIMIT 1",
      [phone],
    );
    assert.equal(
      collision.rows.length,
      0,
      "generated Meta OAuth cutoff phone must not collide with an existing account",
    );

    const created = await accounts.upsertPendingMerchantAuthoritative({
      phone,
      passwordHash: `meta-oauth-cutoff-hash-${proof}`,
      ownerName: `Meta OAuth Cutoff Owner ${proof}`,
      storeName: `Meta OAuth Cutoff Store ${proof}`,
      activityType: "retail",
      language: "en",
      requestedPlan: "silver",
    });
    merchantId = created.account.id;
    await accounts.markMerchantOtpVerifiedAuthoritative(merchantId);

    async function setStatus(
      status: "approved" | "suspended" | "rejected",
    ): Promise<void> {
      const accountStatus = status === "approved" ? "approved" : status;
      await pool.query(
        `UPDATE merchants
            SET status = $2::merchant_status,
                account_status = $3::merchant_account_status,
                updated_at = now()
          WHERE id = $1`,
        [merchantId, status, accountStatus],
      );
      await pool.query(
        `UPDATE accounts
            SET state = $2::account_state,
                suspended_at = CASE WHEN $2::account_state = 'suspended' THEN now() ELSE NULL END,
                updated_at = now()
          WHERE id = $1 AND kind = 'merchant'`,
        [merchantId, status === "approved" ? "active" : "suspended"],
      );
    }

    async function storedPageCount(pageId: string): Promise<number> {
      const result = await pool.query<{ count: number }>(
        `SELECT count(*)::int AS count
           FROM merchant_channels
          WHERE merchant_id = $1 AND page_id = $2`,
        [merchantId, pageId],
      );
      return Number(result.rows[0]?.count || 0);
    }

    await setStatus("approved");
    const approvedPageId = `meta-approved-${proof}`;
    const active = await channels.connectMetaChannelAuthoritative({
      merchantId,
      platform: "messenger",
      pageId: approvedPageId,
      pageName: "Approved Meta Page",
      accessToken: `approved-token-${proof}`,
      webhookSubscribed: true,
    });
    assert.equal(active.page_id, approvedPageId);
    assert.equal(await storedPageCount(approvedPageId), 1);

    await setStatus("suspended");
    const suspendedPageId = `meta-suspended-${proof}`;
    await assert.rejects(
      () =>
        channels.connectMetaChannelAuthoritative({
          merchantId,
          platform: "messenger",
          pageId: suspendedPageId,
          pageName: "Suspended Meta Page",
          accessToken: `suspended-token-${proof}`,
          webhookSubscribed: true,
        }),
      (error: unknown) => {
        assert.equal(
          (error as { code?: unknown }).code,
          "MERCHANT_SUSPENDED",
        );
        return true;
      },
    );
    assert.equal(
      await storedPageCount(suspendedPageId),
      0,
      "suspended merchant must not persist a new Meta channel or credential",
    );

    await setStatus("approved");
    await setStatus("rejected");
    const rejectedPageId = `meta-rejected-${proof}`;
    await assert.rejects(
      () =>
        channels.connectMetaChannelAuthoritative({
          merchantId,
          platform: "instagram",
          pageId: rejectedPageId,
          pageName: "Rejected Meta Page",
          accessToken: `rejected-token-${proof}`,
          webhookSubscribed: true,
          instagramAccountId: `ig-${proof}`,
          instagramUsername: `cutoff_${proof}`,
        }),
      (error: unknown) => {
        assert.equal(
          (error as { code?: unknown }).code,
          "MERCHANT_REJECTED",
        );
        return true;
      },
    );
    assert.equal(
      await storedPageCount(rejectedPageId),
      0,
      "rejected merchant must not persist a new Meta channel or credential",
    );
  },
);
