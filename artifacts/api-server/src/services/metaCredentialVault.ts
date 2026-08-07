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

/**
 * Production can bind this interface to KMS/HSM-backed data keys. The runtime
 * never needs to know how the key is stored, only how to resolve an identifier.
 */
export interface MetaCredentialKeyProvider {
  current(): MetaCredentialKey;
  resolve(keyId: string): MetaCredentialKey | null;
}

function text(value: unknown): string {
  return String(value || "").trim();
}

function assertKey(candidate: MetaCredentialKey): MetaCredentialKey {
  const id = text(candidate.id);
  if (!id || !Buffer.isBuffer(candidate.key) || candidate.key.length !== 32) {
    throw Object.assign(new Error("Meta credential encryption key is invalid"), {
      code: "META_CREDENTIAL_KEY_INVALID",
    });
  }
  return { id, key: candidate.key };
}

export function createEnvironmentMetaCredentialKeyProvider(): MetaCredentialKeyProvider {
  const keyId = text(process.env.FAWRI_META_TOKEN_KEY_ID);
  const encoded = text(process.env.FAWRI_META_TOKEN_KEY_BASE64);

  const load = (): MetaCredentialKey => {
    if (!keyId || !encoded) {
      throw Object.assign(new Error("Meta credential encryption is not configured"), {
        code: "META_CREDENTIAL_KEY_UNAVAILABLE",
      });
    }
    let key: Buffer;
    try {
      key = Buffer.from(encoded, "base64");
    } catch {
      throw Object.assign(new Error("Meta credential encryption key is invalid"), {
        code: "META_CREDENTIAL_KEY_INVALID",
      });
    }
    return assertKey({ id: keyId, key });
  };

  return {
    current: load,
    resolve(requestedKeyId) {
      const key = load();
      return key.id === text(requestedKeyId) ? key : null;
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
    throw Object.assign(new Error("Meta credential is required"), {
      code: "META_CREDENTIAL_REQUIRED",
    });
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
    throw Object.assign(new Error("Meta credential envelope is invalid"), {
      code: "META_CREDENTIAL_ENVELOPE_INVALID",
    });
  }

  const resolved = provider.resolve(envelope.key_id);
  if (!resolved) {
    throw Object.assign(new Error("Meta credential key is unavailable"), {
      code: "META_CREDENTIAL_KEY_UNAVAILABLE",
    });
  }
  const key = assertKey(resolved);

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
    throw Object.assign(new Error("Meta credential could not be decrypted"), {
      code: "META_CREDENTIAL_DECRYPT_FAILED",
    });
  }
}
