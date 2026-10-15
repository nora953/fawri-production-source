import assert from "node:assert/strict";
import crypto from "node:crypto";
import test from "node:test";
import { DecryptCommand, GenerateDataKeyCommand } from "@aws-sdk/client-kms";
import {
  FAWRI_META_KMS_ENCRYPTION_CONTEXT,
  assertAwsKmsMetaCredentialProviderReady,
  bootstrapAwsKmsMetaCredentialKeyProvider,
  generateWrappedAwsKmsMetaCredentialDek,
  type AwsKmsMetaCredentialConfig,
} from "../src/services/awsKmsMetaCredentialKeyProvider";
import {
  createEnvironmentMetaCredentialKeyProvider,
  decryptMetaCredential,
  encryptMetaCredential,
  type MetaCredentialKeyProvider,
} from "../src/services/metaCredentialVault";

const KMS_KEY_ARN = "arn:aws:kms:us-east-1:123456789012:key/11111111-2222-3333-4444-555555555555";

function code(error: unknown): unknown {
  return (error as { code?: unknown } | undefined)?.code;
}

function wrapped(label: string): string {
  return Buffer.from(`kms-ciphertext:${label}`, "utf8").toString("base64");
}

function config(currentDekId = "dek-current", ids = ["dek-current"]): AwsKmsMetaCredentialConfig {
  return {
    region: "us-east-1",
    kmsKeyArn: KMS_KEY_ARN,
    currentDekId,
    wrappedDeks: Object.fromEntries(ids.map((id) => [id, wrapped(id)])),
  };
}

class FakeKmsClient {
  readonly keys = new Map<string, Buffer>();
  mode: "ok" | "wrong-key" | "permission" | "unavailable" | "context-mismatch" = "ok";
  wrongLength = false;
  generatedPlaintext?: Uint8Array;

  constructor(ids: string[] = ["dek-current"]) {
    for (const id of ids) this.keys.set(id, crypto.createHash("sha256").update(id).digest());
  }

  async send(command: unknown): Promise<any> {
    if (this.mode === "permission") throw new Error("AccessDeniedException: secret-material-must-not-leak");
    if (this.mode === "unavailable") throw new Error("KMS unavailable: secret-material-must-not-leak");
    const input = (command as { input?: Record<string, any> }).input || {};
    if (JSON.stringify(input.EncryptionContext) !== JSON.stringify(FAWRI_META_KMS_ENCRYPTION_CONTEXT)) {
      throw new Error("InvalidCiphertextException: encryption context mismatch");
    }
    if (this.mode === "context-mismatch") throw new Error("InvalidCiphertextException: encryption context mismatch");

    if (command instanceof DecryptCommand) {
      const marker = Buffer.from(input.CiphertextBlob).toString("utf8");
      const id = marker.replace(/^kms-ciphertext:/, "");
      const key = this.keys.get(id);
      if (!key) throw new Error("InvalidCiphertextException");
      return {
        KeyId: this.mode === "wrong-key" ? `${KMS_KEY_ARN}-wrong` : KMS_KEY_ARN,
        Plaintext: this.wrongLength ? new Uint8Array(31) : Uint8Array.from(key),
      };
    }

    if (command instanceof GenerateDataKeyCommand) {
      assert.equal(input.KeySpec, "AES_256");
      this.generatedPlaintext = Uint8Array.from(crypto.randomBytes(32));
      return {
        KeyId: this.mode === "wrong-key" ? `${KMS_KEY_ARN}-wrong` : KMS_KEY_ARN,
        Plaintext: this.generatedPlaintext,
        CiphertextBlob: Uint8Array.from(Buffer.from("generated-wrapped-dek")),
      };
    }
    throw new Error("unexpected command");
  }
}

test("successful bootstrap unwraps DEKs and satisfies AWS KMS production readiness", async () => {
  const client = new FakeKmsClient(["dek-current", "dek-old"]);
  const provider = await bootstrapAwsKmsMetaCredentialKeyProvider({
    config: config("dek-current", ["dek-current", "dek-old"]),
    client: client as any,
  });
  const readiness = assertAwsKmsMetaCredentialProviderReady(provider);
  assert.equal(readiness.provider_id, "aws-kms");
  assert.equal(readiness.current_key_id, "dek-current");
  assert.deepEqual(new Set(readiness.decrypt_key_ids), new Set(["dek-current", "dek-old"]));
  provider.dispose();
});

test("AWS KMS readiness rejects a non-adapter external provider", () => {
  const key = { id: "dek-current", key: crypto.randomBytes(32) };
  const impostor: MetaCredentialKeyProvider = {
    current: () => key,
    resolve: (id) => (id === key.id ? key : null),
    readiness: () => ({
      provider: "external",
      provider_id: "aws-kms",
      available: true,
      production_eligible: true,
      current_key_id: key.id,
      decrypt_key_ids: [key.id],
    }),
  };
  assert.throws(
    () => assertAwsKmsMetaCredentialProviderReady(impostor),
    (error) => code(error) === "META_CREDENTIAL_AWS_KMS_PROVIDER_REQUIRED",
  );
  key.key.fill(0);
});

test("wrong returned KMS key identity fails closed", async () => {
  const client = new FakeKmsClient(); client.mode = "wrong-key";
  await assert.rejects(
    bootstrapAwsKmsMetaCredentialKeyProvider({ config: config(), client: client as any }),
    (error) => code(error) === "META_CREDENTIAL_AWS_KMS_KEY_ID_MISMATCH",
  );
});

test("EncryptionContext mismatch fails closed", async () => {
  const client = new FakeKmsClient(); client.mode = "context-mismatch";
  await assert.rejects(
    bootstrapAwsKmsMetaCredentialKeyProvider({ config: config(), client: client as any }),
    (error) => code(error) === "META_CREDENTIAL_AWS_KMS_BOOTSTRAP_FAILED",
  );
});

test("permission denied fails closed with a sanitized error", async () => {
  const client = new FakeKmsClient(); client.mode = "permission";
  await assert.rejects(
    bootstrapAwsKmsMetaCredentialKeyProvider({ config: config(), client: client as any }),
    (error) => code(error) === "META_CREDENTIAL_AWS_KMS_BOOTSTRAP_FAILED" && !String(error).includes("secret-material"),
  );
});

test("KMS unavailable fails closed with a sanitized error", async () => {
  const client = new FakeKmsClient(); client.mode = "unavailable";
  await assert.rejects(
    bootstrapAwsKmsMetaCredentialKeyProvider({ config: config(), client: client as any }),
    (error) => code(error) === "META_CREDENTIAL_AWS_KMS_BOOTSTRAP_FAILED" && !String(error).includes("secret-material"),
  );
});

test("malformed CiphertextBlob fails closed", async () => {
  const invalid = config(); invalid.wrappedDeks["dek-current"] = "not base64***";
  await assert.rejects(
    bootstrapAwsKmsMetaCredentialKeyProvider({ config: invalid, client: new FakeKmsClient() as any }),
    (error) => code(error) === "META_CREDENTIAL_AWS_KMS_CIPHERTEXT_INVALID",
  );
});

test("plaintext DEK with wrong length fails closed", async () => {
  const client = new FakeKmsClient(); client.wrongLength = true;
  await assert.rejects(
    bootstrapAwsKmsMetaCredentialKeyProvider({ config: config(), client: client as any }),
    (error) => code(error) === "META_CREDENTIAL_AWS_KMS_PLAINTEXT_INVALID",
  );
});

test("current logical DEK encrypts new tokens", async () => {
  const provider = await bootstrapAwsKmsMetaCredentialKeyProvider({ config: config(), client: new FakeKmsClient() as any });
  const envelope = encryptMetaCredential("new-private-token", provider);
  assert.equal(envelope.version, 1);
  assert.equal(envelope.key_id, "dek-current");
  assert.equal(decryptMetaCredential(envelope, provider), "new-private-token");
  provider.dispose();
});

test("historical DEK decrypts old envelopes and rotation preserves envelope v1", async () => {
  const oldClient = new FakeKmsClient(["dek-old"]);
  const oldProvider = await bootstrapAwsKmsMetaCredentialKeyProvider({ config: config("dek-old", ["dek-old"]), client: oldClient as any });
  const oldEnvelope = encryptMetaCredential("old-private-token", oldProvider);
  oldProvider.dispose();

  const rotatedClient = new FakeKmsClient(["dek-old", "dek-current"]);
  const rotated = await bootstrapAwsKmsMetaCredentialKeyProvider({ config: config("dek-current", ["dek-old", "dek-current"]), client: rotatedClient as any });
  assert.equal(oldEnvelope.version, 1);
  assert.equal(decryptMetaCredential(oldEnvelope, rotated), "old-private-token");
  const fresh = encryptMetaCredential("fresh-private-token", rotated);
  assert.equal(fresh.key_id, "dek-current");
  rotated.dispose();
});

test("retired logical DEK fails closed", async () => {
  const old = await bootstrapAwsKmsMetaCredentialKeyProvider({ config: config("dek-old", ["dek-old"]), client: new FakeKmsClient(["dek-old"]) as any });
  const envelope = encryptMetaCredential("retired-token", old); old.dispose();
  const current = await bootstrapAwsKmsMetaCredentialKeyProvider({ config: config(), client: new FakeKmsClient() as any });
  assert.throws(() => decryptMetaCredential(envelope, current), (error) => code(error) === "META_CREDENTIAL_KEY_UNAVAILABLE");
  current.dispose();
});

test("environment provider remains production_eligible=false", () => {
  const oldId = process.env.FAWRI_META_TOKEN_KEY_ID;
  const oldKey = process.env.FAWRI_META_TOKEN_KEY_BASE64;
  process.env.FAWRI_META_TOKEN_KEY_ID = "environment-key";
  process.env.FAWRI_META_TOKEN_KEY_BASE64 = crypto.randomBytes(32).toString("base64");
  try {
    assert.equal(createEnvironmentMetaCredentialKeyProvider().readiness?.().production_eligible, false);
  } finally {
    if (oldId === undefined) delete process.env.FAWRI_META_TOKEN_KEY_ID; else process.env.FAWRI_META_TOKEN_KEY_ID = oldId;
    if (oldKey === undefined) delete process.env.FAWRI_META_TOKEN_KEY_BASE64; else process.env.FAWRI_META_TOKEN_KEY_BASE64 = oldKey;
  }
});

test("dispose zeroizes cached DEKs and readiness becomes unavailable", async () => {
  const provider = await bootstrapAwsKmsMetaCredentialKeyProvider({ config: config(), client: new FakeKmsClient() as any });
  const cached = provider.current().key;
  assert.notEqual(cached.every((byte) => byte === 0), true);
  provider.dispose();
  assert.equal(cached.every((byte) => byte === 0), true);
  assert.equal(provider.readiness?.().available, false);
  assert.equal(provider.resolve("dek-current"), null);
  assert.throws(() => assertAwsKmsMetaCredentialProviderReady(provider));
});

test("GenerateDataKey AES_256 returns only wrapped artifact and zeroizes plaintext", async () => {
  const client = new FakeKmsClient();
  const result = await generateWrappedAwsKmsMetaCredentialDek({ client: client as any, kmsKeyArn: KMS_KEY_ARN, logicalDekId: "dek-next" });
  assert.deepEqual(Object.keys(result).sort(), ["ciphertext_blob_base64", "logical_dek_id"]);
  assert.equal(result.logical_dek_id, "dek-next");
  assert.ok(result.ciphertext_blob_base64.length > 0);
  assert.ok(client.generatedPlaintext);
  assert.equal(client.generatedPlaintext!.every((byte) => byte === 0), true);
});

test("adapter errors and console output do not leak token or plaintext data key", async () => {
  const token = "EAAB-never-log-token";
  const keyMarker = "secret-material-must-not-leak";
  const captured: string[] = [];
  const original = [console.log, console.warn, console.error] as const;
  console.log = (...args: unknown[]) => captured.push(args.map(String).join(" "));
  console.warn = (...args: unknown[]) => captured.push(args.map(String).join(" "));
  console.error = (...args: unknown[]) => captured.push(args.map(String).join(" "));
  try {
    const client = new FakeKmsClient(); client.mode = "permission";
    await assert.rejects(
      bootstrapAwsKmsMetaCredentialKeyProvider({ config: config(), client: client as any }),
      (error) => !String(error).includes(token) && !String(error).includes(keyMarker),
    );
  } finally {
    [console.log, console.warn, console.error] = original as any;
  }
  assert.equal(captured.join("\n").includes(token), false);
  assert.equal(captured.join("\n").includes(keyMarker), false);
});
