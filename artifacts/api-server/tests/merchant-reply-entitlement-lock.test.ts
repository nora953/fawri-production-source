import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { reserveMerchantAutoReply } from "../src/services/merchantReplyEntitlement";

test("an active cross-process entitlement lock fails closed without charging", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "fawri-entitlement-lock-"));
  const previous = process.env.FAWRI_DATA_DIR;
  process.env.FAWRI_DATA_DIR = directory;
  const merchantPath = path.join(directory, "merchants.json");
  try {
    await writeFile(
      merchantPath,
      JSON.stringify({
        subscriptions: [
          {
            id: "subscription-1",
            merchant_id: "merchant-1",
            status: "active",
            start_date: "2026-08-01T00:00:00.000Z",
            expires_at: "2026-09-01T00:00:00.000Z",
            auto_reply_enabled: true,
            reply_limit: 2,
            replies_used: 0,
            replies_remaining: 2,
            base_reply_limit: 2,
            base_replies_used: 0,
            base_replies_remaining: 2,
            addon_replies_remaining: 0,
            addon_reply_batches: [],
          },
        ],
      }),
    );
    await writeFile(
      path.join(directory, "reply-entitlements.lock"),
      JSON.stringify({ token: "other-process", pid: 999999 }),
    );

    const before = await readFile(merchantPath, "utf8");
    const decision = reserveMerchantAutoReply(
      "merchant-1",
      "meta:page-1:message-1",
      new Date("2026-08-07T00:00:00.000Z"),
    );
    assert.equal(decision.allowed, false);
    if (!decision.allowed) {
      assert.equal(decision.code, "MERCHANT_REPLY_ENTITLEMENT_UNAVAILABLE");
    }
    assert.equal(await readFile(merchantPath, "utf8"), before);
  } finally {
    if (previous === undefined) delete process.env.FAWRI_DATA_DIR;
    else process.env.FAWRI_DATA_DIR = previous;
    await rm(directory, { recursive: true, force: true });
  }
});
