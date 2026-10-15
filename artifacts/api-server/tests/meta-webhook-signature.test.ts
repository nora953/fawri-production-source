import assert from "node:assert/strict";
import crypto from "node:crypto";
import test from "node:test";
import { verifyMetaWebhookRawBodySignature } from "../src/middleware/metaWebhookSecurity";

test("Meta signature verification is bound to the exact raw bytes", () => {
  const secret = "test-app-secret";
  const raw = Buffer.from('{"object":"page","entry":[]}', "utf8");
  const signature = `sha256=${crypto
    .createHmac("sha256", secret)
    .update(raw)
    .digest("hex")}`;
  assert.equal(verifyMetaWebhookRawBodySignature(raw, signature, secret), true);
  assert.equal(
    verifyMetaWebhookRawBodySignature(
      Buffer.from('{"object":"page", "entry":[]}', "utf8"),
      signature,
      secret,
    ),
    false,
  );
  assert.equal(verifyMetaWebhookRawBodySignature(raw, "sha256=invalid", secret), false);
  assert.equal(verifyMetaWebhookRawBodySignature(raw, signature, ""), false);
});
