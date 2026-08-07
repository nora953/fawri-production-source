import assert from "node:assert/strict";
import crypto from "node:crypto";
import test from "node:test";
import {
  decryptMetaCredential,
  encryptMetaCredential,
  type MetaCredentialKeyProvider,
} from "../src/services/metaCredentialVault";

function provider(): MetaCredentialKeyProvider {
  const key = { id: "test-key-1", key: crypto.randomBytes(32) };
  return {
    current: () => key,
    resolve: (id) => (id === key.id ? key : null),
  };
}

test("Meta credentials are encrypted at rest and authenticated", () => {
  const keys = provider();
  const token = "EAAB-private-page-token";
  const envelope = encryptMetaCredential(token, keys);
  assert.equal(JSON.stringify(envelope).includes(token), false);
  assert.equal(decryptMetaCredential(envelope, keys), token);

  assert.throws(() =>
    decryptMetaCredential(
      { ...envelope, ciphertext: `${envelope.ciphertext.slice(0, -2)}AA` },
      keys,
    ),
  );
});
