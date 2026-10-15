import crypto from "node:crypto";

export type MetaCredentialEnvelope = {
  version: 1;
  algorithm: "aes-256-gcm";
  key_id: string;
  iv: string;
  ciphertext: string;
  auth_tag: string;
};

export type MetaCredentialKey = {
  id: string;
  key: Buffer;
};

export type MetaCredentialProviderReadiness = {
  provider: "environment" | "external";
  provider_id: string;
  available: boolean;
  production_eligible: boolean;
  current_key_id?: string;
  decrypt_key_ids?: string[];
};

/**
 * Production can bind this interface to KMS/HSM-backed data keys. The runtime
 * never needs to know how the key is stored, only how to resolve an identifier.
 *
 * A production provider must also expose readiness metadata. Environment-backed
 * keys intentionally never qualify as production KMS/HSM proof.
 */
export interface MetaCredentialKeyProvider {
  current(): MetaCredentialKey;
  resolve(keyId: string): MetaCredentialKey | null;
  readiness?(): MetaCredentialProviderReadiness;
}

function text(value: unknown): string {
  return String(value || "").trim();
}

function errorWithCode(message: string, code: string): Error & { code: string } {
  return Object.assign(new Error(message), { code });
}

function assertKey(candidate: MetaCredentialKey): MetaCredentialKey {
  const id = text(candidate.id);
  if (!id || !Buffer.isBuffer(candidate.key) || candidate.key.length !== 32) {
    throw errorWithCode(
      "Meta credential encryption key is invalid",
      "META_CREDENTIAL_KEY_INVALID",
    );
  }
  return { id, key: candidate.key };
}

function normalizedKeyIds(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map(text).filter(Boolean))];
}

export function assertProductionMetaCredentialProviderReady(
  provider: MetaCredentialKeyProvider,
): MetaCredentialProviderReadiness {
  const readiness = provider.readiness?.();
  if (
    !readiness ||
    readiness.provider !== "external" ||
    readiness.production_eligible !== true
  ) {
    throw errorWithCode(
      "Production Meta credential provider proof is required",
      "META_CREDENTIAL_PRODUCTION_PROVIDER_REQUIRED",
    );
  }

  if (!readiness.available) {
    throw errorWithCode(
      "External Meta credential provider is unavailable",
      "META_CREDENTIAL_EXTERNAL_PROVIDER_UNAVAILABLE",
    );
  }

  const providerId = text(readiness.provider_id);
  const currentKeyId = text(readiness.current_key_id);
  const decryptKeyIds = normalizedKeyIds(readiness.decrypt_key_ids);
  if (!providerId || !currentKeyId || !decryptKeyIds.includes(currentKeyId)) {
    throw errorWithCode(
      "Meta credential provider readiness proof is invalid",
      "META_CREDENTIAL_PROVIDER_PROOF_INVALID",
    );
  }

  const current = assertKey(provider.current());
  if (current.id !== currentKeyId) {
    throw errorWithCode(
      "Meta credential provider current key does not match readiness proof",
      "META_CREDENTIAL_KEY_ID_MISMATCH",
    );
  }

  const resolved = provider.resolve(currentKeyId);
  if (!resolved) {
    throw errorWithCode(
      "External Meta credential provider current key is unavailable",
      "META_CREDENTIAL_EXTERNAL_PROVIDER_UNAVAILABLE",
    );
  }
  const resolvedKey = assertKey(resolved);
  if (resolvedKey.id !== currentKeyId) {
    throw errorWithCode(
      "Meta credential provider resolved key id does not match requested key id",
      "META_CREDENTIAL_KEY_ID_MISMATCH",
    );
  }

  return {
    provider: "external",
    provider_id: providerId,
    available: true,
    production_eligible: true,
    current_key_id: currentKeyId,
    decrypt_key_ids: decryptKeyIds,
  };
}

export function createEnvironmentMetaCredentialKeyProvider(): MetaCredentialKeyProvider {
  const keyId = text(process.env.FAWRI_META_TOKEN_KEY_ID);
  const encoded = text(process.env.FAWRI_META_TOKEN_KEY_BASE64);

  const load = (): MetaCredentialKey => {
    if (!keyId || !encoded) {
      throw errorWithCode(
        "Meta credential encryption is not configured",
        "META_CREDENTIAL_KEY_UNAVAILABLE",
      );
    }
    let key: Buffer;
    try {
      key = Buffer.from(encoded, "base64");
    } catch {
      throw errorWithCode(
        "Meta credential encryption key is invalid",
        "META_CREDENTIAL_KEY_INVALID",
      );
    }
    return assertKey({ id: keyId, key });
  };

  return {
    current: load,
    resolve(requestedKeyId) {
      const key = load();
      return key.id === text(requestedKeyId) ? key : null;
    },
    readiness() {
      let available = false;
      try {
        load();
        available = true;
      } catch {
        available = false;
      }
      return {
        provider: "environment",
        provider_id: "environment",
        available,
        production_eligible: false,
        ...(keyId ? { current_key_id: keyId, decrypt_key_ids: [keyId] } : {}),
      };
    },
  };
}

export function encryptMetaCredential(
  plaintext: string,
  provider: MetaCredentialKeyProvider,
  associatedData = "fawri:meta-channel-token:v1",
): MetaCredentialEnvelope {
  const token = text(plaintext);
  if (!token) {
    throw errorWithCode(
      "Meta credential is required",
      "META_CREDENTIAL_REQUIRED",
    );
  }

  const key = assertKey(provider.current());
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key.key, iv);
  cipher.setAAD(Buffer.from(associatedData, "utf8"));
  const ciphertext = Buffer.concat([
    cipher.update(token, "utf8"),
    cipher.final(),
  ]);

  return {
    version: 1,
    algorithm: "aes-256-gcm",
    key_id: key.id,
    iv: iv.toString("base64"),
    ciphertext: ciphertext.toString("base64"),
    auth_tag: cipher.getAuthTag().toString("base64"),
  };
}

export function decryptMetaCredential(
  envelope: MetaCredentialEnvelope,
  provider: MetaCredentialKeyProvider,
  associatedData = "fawri:meta-channel-token:v1",
): string {
  if (
    !envelope ||
    envelope.version !== 1 ||
    envelope.algorithm !== "aes-256-gcm" ||
    !text(envelope.key_id)
  ) {
    throw errorWithCode(
      "Meta credential envelope is invalid",
      "META_CREDENTIAL_ENVELOPE_INVALID",
    );
  }

  const requestedKeyId = text(envelope.key_id);
  const resolved = provider.resolve(requestedKeyId);
  if (!resolved) {
    throw errorWithCode(
      "Meta credential key is unavailable",
      "META_CREDENTIAL_KEY_UNAVAILABLE",
    );
  }
  const key = assertKey(resolved);
  if (key.id !== requestedKeyId) {
    throw errorWithCode(
      "Meta credential provider resolved key id does not match requested key id",
      "META_CREDENTIAL_KEY_ID_MISMATCH",
    );
  }

  try {
    const decipher = crypto.createDecipheriv(
      "aes-256-gcm",
      key.key,
      Buffer.from(envelope.iv, "base64"),
    );
    decipher.setAAD(Buffer.from(associatedData, "utf8"));
    decipher.setAuthTag(Buffer.from(envelope.auth_tag, "base64"));
    return Buffer.concat([
      decipher.update(Buffer.from(envelope.ciphertext, "base64")),
      decipher.final(),
    ]).toString("utf8");
  } catch {
    throw errorWithCode(
      "Meta credential could not be decrypted",
      "META_CREDENTIAL_DECRYPT_FAILED",
    );
  }
}
