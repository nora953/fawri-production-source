import {
  DecryptCommand,
  GenerateDataKeyCommand,
  KMSClient,
  type KMSClientConfig,
} from "@aws-sdk/client-kms";
import {
  assertProductionMetaCredentialProviderReady,
  type MetaCredentialKey,
  type MetaCredentialKeyProvider,
  type MetaCredentialProviderReadiness,
} from "./metaCredentialVault";

export const FAWRI_META_KMS_ENCRYPTION_CONTEXT = Object.freeze({
  application: "fawri",
  purpose: "meta-credential-dek",
  version: "1",
});

export type AwsKmsWrappedDekManifest = Record<string, string>;

export type AwsKmsMetaCredentialConfig = {
  region: string;
  kmsKeyArn: string;
  currentDekId: string;
  wrappedDeks: AwsKmsWrappedDekManifest;
};

export type AwsKmsMetaCredentialKeyProvider = MetaCredentialKeyProvider & {
  dispose(): void;
};

type AwsKmsClientLike = Pick<KMSClient, "send">;
const awsKmsBackedProviders = new WeakSet<MetaCredentialKeyProvider>();

function text(value: unknown): string {
  return String(value || "").trim();
}

function fail(code: string, message: string): Error & { code: string } {
  return Object.assign(new Error(message), { code });
}

function isAdapterError(error: unknown): error is Error & { code: string } {
  const code =
    error && typeof error === "object"
      ? text((error as { code?: unknown }).code)
      : "";
  return code.startsWith("META_CREDENTIAL_");
}

function assertKmsKeyArn(value: unknown): string {
  const keyArn = text(value);
  if (!/^arn:aws[a-z-]*:kms:[^:]+:\d{12}:key\/[A-Za-z0-9-]+$/.test(keyArn)) {
    throw fail(
      "META_CREDENTIAL_AWS_KMS_CONFIG_INVALID",
      "AWS KMS Meta credential key identity must be a KMS key ARN",
    );
  }
  return keyArn;
}

function assertLogicalDekId(value: unknown): string {
  const id = text(value);
  if (!/^[A-Za-z0-9._:-]{1,128}$/.test(id)) {
    throw fail(
      "META_CREDENTIAL_AWS_KMS_CONFIG_INVALID",
      "AWS KMS Meta credential logical DEK id is invalid",
    );
  }
  return id;
}

function decodeCiphertextBlob(encoded: unknown): Buffer {
  const value = text(encoded);
  if (!value || value.length % 4 !== 0 || !/^[A-Za-z0-9+/]+={0,2}$/.test(value)) {
    throw fail(
      "META_CREDENTIAL_AWS_KMS_CIPHERTEXT_INVALID",
      "AWS KMS wrapped DEK is invalid",
    );
  }
  const decoded = Buffer.from(value, "base64");
  if (!decoded.length || decoded.toString("base64") !== value) {
    decoded.fill(0);
    throw fail(
      "META_CREDENTIAL_AWS_KMS_CIPHERTEXT_INVALID",
      "AWS KMS wrapped DEK is invalid",
    );
  }
  return decoded;
}

function normalizeConfig(input: AwsKmsMetaCredentialConfig): AwsKmsMetaCredentialConfig {
  const region = text(input.region);
  const kmsKeyArn = assertKmsKeyArn(input.kmsKeyArn);
  const kmsKeyRegion = kmsKeyArn.split(":")[3] || "";
  const currentDekId = assertLogicalDekId(input.currentDekId);
  if (
    !region ||
    region !== kmsKeyRegion ||
    !input.wrappedDeks ||
    typeof input.wrappedDeks !== "object" ||
    Array.isArray(input.wrappedDeks)
  ) {
    throw fail(
      "META_CREDENTIAL_AWS_KMS_CONFIG_INVALID",
      "AWS KMS Meta credential configuration is invalid",
    );
  }
  const wrappedDeks = Object.create(null) as AwsKmsWrappedDekManifest;
  for (const [rawId, rawCiphertext] of Object.entries(input.wrappedDeks)) {
    const id = assertLogicalDekId(rawId);
    if (Object.prototype.hasOwnProperty.call(wrappedDeks, id)) {
      throw fail(
        "META_CREDENTIAL_AWS_KMS_CONFIG_INVALID",
        "AWS KMS Meta credential DEK manifest contains duplicate ids",
      );
    }
    wrappedDeks[id] = text(rawCiphertext);
  }
  if (
    !Object.prototype.hasOwnProperty.call(wrappedDeks, currentDekId) ||
    !wrappedDeks[currentDekId]
  ) {
    throw fail(
      "META_CREDENTIAL_AWS_KMS_CONFIG_INVALID",
      "AWS KMS Meta credential current DEK is missing from the manifest",
    );
  }
  return { region, kmsKeyArn, currentDekId, wrappedDeks };
}

export function readAwsKmsMetaCredentialConfigFromEnvironment(
  env: NodeJS.ProcessEnv = process.env,
): AwsKmsMetaCredentialConfig {
  let wrappedDeks: unknown;
  try {
    wrappedDeks = JSON.parse(text(env.FAWRI_META_AWS_KMS_WRAPPED_DEKS_JSON));
  } catch {
    throw fail(
      "META_CREDENTIAL_AWS_KMS_CONFIG_INVALID",
      "AWS KMS Meta credential wrapped DEK manifest is invalid",
    );
  }
  return normalizeConfig({
    region: text(env.FAWRI_META_AWS_REGION),
    kmsKeyArn: text(env.FAWRI_META_AWS_KMS_KEY_ARN),
    currentDekId: text(env.FAWRI_META_AWS_CURRENT_DEK_ID),
    wrappedDeks: wrappedDeks as AwsKmsWrappedDekManifest,
  });
}

export function assertAwsKmsMetaCredentialProviderReady(
  provider: MetaCredentialKeyProvider,
): MetaCredentialProviderReadiness {
  if (!awsKmsBackedProviders.has(provider)) {
    throw fail(
      "META_CREDENTIAL_AWS_KMS_PROVIDER_REQUIRED",
      "AWS KMS-backed Meta credential provider is required",
    );
  }
  const readiness = assertProductionMetaCredentialProviderReady(provider);
  if (readiness.provider_id !== "aws-kms") {
    throw fail(
      "META_CREDENTIAL_AWS_KMS_PROVIDER_REQUIRED",
      "AWS KMS-backed Meta credential provider is required",
    );
  }
  return readiness;
}

export async function bootstrapAwsKmsMetaCredentialKeyProvider(input: {
  config: AwsKmsMetaCredentialConfig;
  client: AwsKmsClientLike;
}): Promise<AwsKmsMetaCredentialKeyProvider> {
  const config = normalizeConfig(input.config);
  const cache = new Map<string, MetaCredentialKey>();
  let disposed = false;

  const cleanup = (): void => {
    if (disposed) return;
    disposed = true;
    for (const item of cache.values()) item.key.fill(0);
    cache.clear();
  };

  try {
    for (const [id, encoded] of Object.entries(config.wrappedDeks)) {
      const ciphertextBlob = decodeCiphertextBlob(encoded);
      let plaintext: Uint8Array | undefined;
      try {
        const output = await input.client.send(
          new DecryptCommand({
            CiphertextBlob: ciphertextBlob,
            KeyId: config.kmsKeyArn,
            EncryptionContext: FAWRI_META_KMS_ENCRYPTION_CONTEXT,
          }),
        );
        plaintext = output.Plaintext;
        if (text(output.KeyId) !== config.kmsKeyArn) {
          throw fail(
            "META_CREDENTIAL_AWS_KMS_KEY_ID_MISMATCH",
            "AWS KMS returned an unexpected key identity",
          );
        }
        if (!plaintext || plaintext.byteLength !== 32) {
          throw fail(
            "META_CREDENTIAL_AWS_KMS_PLAINTEXT_INVALID",
            "AWS KMS returned an invalid Meta credential data key",
          );
        }
        cache.set(id, { id, key: Buffer.from(plaintext) });
      } finally {
        plaintext?.fill(0);
        ciphertextBlob.fill(0);
      }
    }
  } catch (error) {
    cleanup();
    if (isAdapterError(error)) throw error;
    throw fail(
      "META_CREDENTIAL_AWS_KMS_BOOTSTRAP_FAILED",
      "AWS KMS Meta credential key bootstrap failed",
    );
  }

  const readiness = (): MetaCredentialProviderReadiness => ({
    provider: "external",
    provider_id: "aws-kms",
    available: !disposed,
    production_eligible: !disposed,
    current_key_id: config.currentDekId,
    decrypt_key_ids: [...cache.keys()],
  });

  const provider: AwsKmsMetaCredentialKeyProvider = {
    current() {
      if (disposed) {
        throw fail(
          "META_CREDENTIAL_EXTERNAL_PROVIDER_UNAVAILABLE",
          "AWS KMS Meta credential provider is disposed",
        );
      }
      const key = cache.get(config.currentDekId);
      if (!key) {
        throw fail(
          "META_CREDENTIAL_KEY_UNAVAILABLE",
          "AWS KMS current Meta credential data key is unavailable",
        );
      }
      return key;
    },
    resolve(keyId) {
      if (disposed) return null;
      return cache.get(text(keyId)) || null;
    },
    readiness,
    dispose: cleanup,
  };
  awsKmsBackedProviders.add(provider);
  return provider;
}

export async function bootstrapAwsKmsMetaCredentialKeyProviderFromEnvironment(input?: {
  env?: NodeJS.ProcessEnv;
  clientConfig?: Omit<KMSClientConfig, "region">;
}): Promise<AwsKmsMetaCredentialKeyProvider> {
  const config = readAwsKmsMetaCredentialConfigFromEnvironment(input?.env);
  const client = new KMSClient({ ...input?.clientConfig, region: config.region });
  try {
    return await bootstrapAwsKmsMetaCredentialKeyProvider({ config, client });
  } finally {
    client.destroy();
  }
}

export async function generateWrappedAwsKmsMetaCredentialDek(input: {
  client: AwsKmsClientLike;
  kmsKeyArn: string;
  logicalDekId: string;
}): Promise<{ logical_dek_id: string; ciphertext_blob_base64: string }> {
  const kmsKeyArn = assertKmsKeyArn(input.kmsKeyArn);
  const logicalDekId = assertLogicalDekId(input.logicalDekId);
  let plaintext: Uint8Array | undefined;
  try {
    const output = await input.client.send(
      new GenerateDataKeyCommand({
        KeyId: kmsKeyArn,
        KeySpec: "AES_256",
        EncryptionContext: FAWRI_META_KMS_ENCRYPTION_CONTEXT,
      }),
    );
    plaintext = output.Plaintext;
    if (text(output.KeyId) !== kmsKeyArn) {
      throw fail(
        "META_CREDENTIAL_AWS_KMS_KEY_ID_MISMATCH",
        "AWS KMS returned an unexpected key identity",
      );
    }
    if (!plaintext || plaintext.byteLength !== 32 || !output.CiphertextBlob?.byteLength) {
      throw fail(
        "META_CREDENTIAL_AWS_KMS_GENERATE_INVALID",
        "AWS KMS returned an invalid generated data key",
      );
    }
    return {
      logical_dek_id: logicalDekId,
      ciphertext_blob_base64: Buffer.from(output.CiphertextBlob).toString("base64"),
    };
  } catch (error) {
    if (isAdapterError(error)) throw error;
    throw fail(
      "META_CREDENTIAL_AWS_KMS_GENERATE_FAILED",
      "AWS KMS Meta credential data key generation failed",
    );
  } finally {
    plaintext?.fill(0);
  }
}
