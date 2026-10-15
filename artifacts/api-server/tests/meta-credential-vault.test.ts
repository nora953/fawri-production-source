import assert from "node:assert/strict";
import crypto from "node:crypto";
import test from "node:test";
import {
  assertProductionMetaCredentialProviderReady,
  createEnvironmentMetaCredentialKeyProvider,
  decryptMetaCredential,
  encryptMetaCredential,
  type MetaCredentialKey,
  type MetaCredentialKeyProvider,
} from "../src/services/metaCredentialVault";

function errorCode(error: unknown): string | undefined {
  return (error as { code?: string } | undefined)?.code;
}

function singleKeyProvider(key: MetaCredentialKey): MetaCredentialKeyProvider {
  return {
    current: () => key,
    resolve: (id) => (id === key.id ? key : null),
  };
}

function rotatingProvider(input: {
  current: MetaCredentialKey;
  decrypt: MetaCredentialKey[];
}): MetaCredentialKeyProvider {
  const keys = new Map(input.decrypt.map((key) => [key.id, key]));
  return {
    current: () => input.current,
    resolve: (id) => keys.get(id) || null,
    readiness: () => ({
      provider: "external",
      provider_id: "test-external-provider",
      available: true,
      production_eligible: true,
      current_key_id: input.current.id,
      decrypt_key_ids: [...keys.keys()],
    }),
  };
}

test("Meta credentials are encrypted at rest and authenticated", () => {
  const key = { id: "test-key-1", key: crypto.randomBytes(32) };
  const keys = singleKeyProvider(key);
  const token = "EAAB-private-page-token";
  const envelope = encryptMetaCredential(token, keys);
  assert.equal(JSON.stringify(envelope).includes(token), false);
  assert.equal(decryptMetaCredential(envelope, keys), token);
});

test("unavailable external provider fails production readiness closed", () => {
  const provider: MetaCredentialKeyProvider = {
    current: () => {
      throw new Error("must not load a key when readiness says unavailable");
    },
    resolve: () => null,
    readiness: () => ({
      provider: "external",
      provider_id: "owner-selected-provider",
      available: false,
      production_eligible: true,
      current_key_id: "key-current",
      decrypt_key_ids: ["key-current"],
    }),
  };

  assert.throws(
    () => assertProductionMetaCredentialProviderReady(provider),
    (error) => errorCode(error) === "META_CREDENTIAL_EXTERNAL_PROVIDER_UNAVAILABLE",
  );
});

test("environment key provider is never accepted as production KMS/HSM proof", () => {
  const previousId = process.env.FAWRI_META_TOKEN_KEY_ID;
  const previousKey = process.env.FAWRI_META_TOKEN_KEY_BASE64;
  process.env.FAWRI_META_TOKEN_KEY_ID = "environment-key";
  process.env.FAWRI_META_TOKEN_KEY_BASE64 = crypto.randomBytes(32).toString("base64");
  try {
    const provider = createEnvironmentMetaCredentialKeyProvider();
    assert.equal(provider.readiness?.().production_eligible, false);
    assert.throws(
      () => assertProductionMetaCredentialProviderReady(provider),
      (error) => errorCode(error) === "META_CREDENTIAL_PRODUCTION_PROVIDER_REQUIRED",
    );
  } finally {
    if (previousId === undefined) delete process.env.FAWRI_META_TOKEN_KEY_ID;
    else process.env.FAWRI_META_TOKEN_KEY_ID = previousId;
    if (previousKey === undefined) delete process.env.FAWRI_META_TOKEN_KEY_BASE64;
    else process.env.FAWRI_META_TOKEN_KEY_BASE64 = previousKey;
  }
});

test("wrong resolved key_id fails closed before decrypt", () => {
  const actualKey = { id: "actual-key", key: crypto.randomBytes(32) };
  const envelope = encryptMetaCredential("private-token", singleKeyProvider(actualKey));
  const mismatchedProvider: MetaCredentialKeyProvider = {
    current: () => actualKey,
    resolve: () => actualKey,
  };

  assert.throws(
    () =>
      decryptMetaCredential(
        { ...envelope, key_id: "different-key-id" },
        mismatchedProvider,
      ),
    (error) => errorCode(error) === "META_CREDENTIAL_KEY_ID_MISMATCH",
  );
});

test("rotation keeps old envelopes readable while new writes use current key", () => {
  const oldKey = { id: "key-2026-07", key: crypto.randomBytes(32) };
  const currentKey = { id: "key-2026-08", key: crypto.randomBytes(32) };
  const oldEnvelope = encryptMetaCredential(
    "old-token",
    singleKeyProvider(oldKey),
  );
  const provider = rotatingProvider({ current: currentKey, decrypt: [oldKey, currentKey] });

  assert.equal(assertProductionMetaCredentialProviderReady(provider).current_key_id, currentKey.id);
  assert.equal(decryptMetaCredential(oldEnvelope, provider), "old-token");
  const newEnvelope = encryptMetaCredential("new-token", provider);
  assert.equal(newEnvelope.key_id, currentKey.id);
  assert.equal(decryptMetaCredential(newEnvelope, provider), "new-token");
});

test("unknown retired key fails closed", () => {
  const retiredKey = { id: "retired-key", key: crypto.randomBytes(32) };
  const currentKey = { id: "current-key", key: crypto.randomBytes(32) };
  const retiredEnvelope = encryptMetaCredential(
    "retired-token",
    singleKeyProvider(retiredKey),
  );
  const provider = rotatingProvider({ current: currentKey, decrypt: [currentKey] });

  assert.throws(
    () => decryptMetaCredential(retiredEnvelope, provider),
    (error) => errorCode(error) === "META_CREDENTIAL_KEY_UNAVAILABLE",
  );
});

test("corrupt envelope fails closed without logging plaintext", () => {
  const key = { id: "test-key", key: crypto.randomBytes(32) };
  const provider = singleKeyProvider(key);
  const token = "EAAB-never-log-this-token";
  const envelope = encryptMetaCredential(token, provider);
  const captured: string[] = [];
  const originalLog = console.log;
  const originalWarn = console.warn;
  const originalError = console.error;
  console.log = (...args: unknown[]) => captured.push(args.map(String).join(" "));
  console.warn = (...args: unknown[]) => captured.push(args.map(String).join(" "));
  console.error = (...args: unknown[]) => captured.push(args.map(String).join(" "));
  try {
    assert.throws(
      () =>
        decryptMetaCredential(
          { ...envelope, auth_tag: crypto.randomBytes(16).toString("base64") },
          provider,
        ),
      (error) => {
        assert.equal(errorCode(error), "META_CREDENTIAL_DECRYPT_FAILED");
        assert.equal(String(error).includes(token), false);
        return true;
      },
    );
  } finally {
    console.log = originalLog;
    console.warn = originalWarn;
    console.error = originalError;
  }
  assert.equal(captured.join("\n").includes(token), false);
});
