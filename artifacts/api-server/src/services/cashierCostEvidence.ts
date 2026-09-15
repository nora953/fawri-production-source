import crypto from "node:crypto";

const TOKEN_VERSION = "cce1";
const EVIDENCE_TTL_MS = 365 * 24 * 60 * 60 * 1000;
const IV_BYTES = 12;
const TAG_BYTES = 16;

type CostEvidencePayload = {
  merchant_id: string;
  product_id: string;
  variant_id?: string;
  catalog_version: number;
  unit_cost_minor: number | null;
  issued_at: string;
  expires_at: string;
};

export class CashierCostEvidenceError extends Error {
  readonly code: string;
  readonly status: number;

  constructor(code: string, message: string, status = 409) {
    super(message);
    this.name = "CashierCostEvidenceError";
    this.code = code;
    this.status = status;
  }
}

function identifier(value: unknown, field: string, maxLength = 200): string {
  const normalized = String(value ?? "").normalize("NFKC").trim();
  if (
    !normalized ||
    normalized.length > maxLength ||
    /[\u0000-\u001f\u007f]/.test(normalized)
  ) {
    throw new CashierCostEvidenceError(
      "CASHIER_COST_EVIDENCE_INPUT_INVALID",
      `${field} is invalid`,
      400,
    );
  }
  return normalized;
}

function positiveInteger(value: unknown, field: string): number {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    throw new CashierCostEvidenceError(
      "CASHIER_COST_EVIDENCE_INPUT_INVALID",
      `${field} is invalid`,
      400,
    );
  }
  return parsed;
}

function optionalCost(value: unknown): number | null {
  if (value === undefined || value === null || value === "") return null;
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 0) {
    throw new CashierCostEvidenceError(
      "CASHIER_COST_EVIDENCE_INPUT_INVALID",
      "unit_cost_minor is invalid",
      400,
    );
  }
  return parsed;
}

function evidenceSecret(env: NodeJS.ProcessEnv = process.env): string {
  const configured = String(env.FAWRI_CASHIER_COST_EVIDENCE_SECRET || "").trim();
  if (configured.length >= 32) return configured;
  if (env.NODE_ENV === "production") {
    throw new CashierCostEvidenceError(
      "CASHIER_COST_EVIDENCE_SECRET_REQUIRED",
      "cashier cost evidence secret is not configured",
      503,
    );
  }
  return "fawri-local-cashier-cost-evidence-development-only-secret";
}

function evidenceKey(env: NodeJS.ProcessEnv = process.env): Buffer {
  return crypto.createHash("sha256").update(evidenceSecret(env), "utf8").digest();
}

function encodeEnvelope(iv: Buffer, tag: Buffer, ciphertext: Buffer): string {
  return `${TOKEN_VERSION}.${Buffer.concat([iv, tag, ciphertext]).toString("base64url")}`;
}

function decodeEnvelope(tokenValue: unknown): {
  iv: Buffer;
  tag: Buffer;
  ciphertext: Buffer;
} {
  const token = String(tokenValue ?? "").trim();
  const [version, encoded, extra] = token.split(".");
  if (version !== TOKEN_VERSION || !encoded || extra !== undefined) {
    throw new CashierCostEvidenceError(
      "CASHIER_COST_EVIDENCE_INVALID",
      "cashier cost evidence is invalid",
      409,
    );
  }
  let bytes: Buffer;
  try {
    bytes = Buffer.from(encoded, "base64url");
  } catch {
    throw new CashierCostEvidenceError(
      "CASHIER_COST_EVIDENCE_INVALID",
      "cashier cost evidence is invalid",
      409,
    );
  }
  if (bytes.length <= IV_BYTES + TAG_BYTES) {
    throw new CashierCostEvidenceError(
      "CASHIER_COST_EVIDENCE_INVALID",
      "cashier cost evidence is invalid",
      409,
    );
  }
  return {
    iv: bytes.subarray(0, IV_BYTES),
    tag: bytes.subarray(IV_BYTES, IV_BYTES + TAG_BYTES),
    ciphertext: bytes.subarray(IV_BYTES + TAG_BYTES),
  };
}

function parsePayload(value: unknown): CostEvidencePayload {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new CashierCostEvidenceError(
      "CASHIER_COST_EVIDENCE_INVALID",
      "cashier cost evidence payload is invalid",
      409,
    );
  }
  const raw = value as Record<string, unknown>;
  const issuedAt = new Date(String(raw.issued_at || ""));
  const expiresAt = new Date(String(raw.expires_at || ""));
  if (
    !Number.isFinite(issuedAt.getTime()) ||
    !Number.isFinite(expiresAt.getTime()) ||
    expiresAt.getTime() <= issuedAt.getTime()
  ) {
    throw new CashierCostEvidenceError(
      "CASHIER_COST_EVIDENCE_INVALID",
      "cashier cost evidence timestamps are invalid",
      409,
    );
  }
  return {
    merchant_id: identifier(raw.merchant_id, "merchant_id"),
    product_id: identifier(raw.product_id, "product_id"),
    ...(raw.variant_id
      ? { variant_id: identifier(raw.variant_id, "variant_id") }
      : {}),
    catalog_version: positiveInteger(raw.catalog_version, "catalog_version"),
    unit_cost_minor: optionalCost(raw.unit_cost_minor),
    issued_at: issuedAt.toISOString(),
    expires_at: expiresAt.toISOString(),
  };
}

export function issueCashierCostEvidence(input: {
  merchantId: unknown;
  productId: unknown;
  variantId?: unknown;
  catalogVersion: unknown;
  unitCostMinor?: unknown;
  now?: Date;
  env?: NodeJS.ProcessEnv;
}): string {
  const now = input.now || new Date();
  if (!Number.isFinite(now.getTime())) {
    throw new CashierCostEvidenceError(
      "CASHIER_COST_EVIDENCE_INPUT_INVALID",
      "cashier cost evidence time is invalid",
      400,
    );
  }
  const payload: CostEvidencePayload = {
    merchant_id: identifier(input.merchantId, "merchant_id"),
    product_id: identifier(input.productId, "product_id"),
    ...(input.variantId
      ? { variant_id: identifier(input.variantId, "variant_id") }
      : {}),
    catalog_version: positiveInteger(input.catalogVersion, "catalog_version"),
    unit_cost_minor: optionalCost(input.unitCostMinor),
    issued_at: now.toISOString(),
    expires_at: new Date(now.getTime() + EVIDENCE_TTL_MS).toISOString(),
  };
  const iv = crypto.randomBytes(IV_BYTES);
  const cipher = crypto.createCipheriv("aes-256-gcm", evidenceKey(input.env), iv);
  cipher.setAAD(Buffer.from(TOKEN_VERSION, "utf8"));
  const ciphertext = Buffer.concat([
    cipher.update(JSON.stringify(payload), "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  return encodeEnvelope(iv, tag, ciphertext);
}

export function resolveCashierCostEvidence(input: {
  token: unknown;
  merchantId: unknown;
  productId: unknown;
  variantId?: unknown;
  catalogVersion: unknown;
  now?: Date;
  env?: NodeJS.ProcessEnv;
}): { unit_cost_minor: number | null; expires_at: string } {
  const envelope = decodeEnvelope(input.token);
  let decoded: unknown;
  try {
    const decipher = crypto.createDecipheriv(
      "aes-256-gcm",
      evidenceKey(input.env),
      envelope.iv,
    );
    decipher.setAAD(Buffer.from(TOKEN_VERSION, "utf8"));
    decipher.setAuthTag(envelope.tag);
    const plaintext = Buffer.concat([
      decipher.update(envelope.ciphertext),
      decipher.final(),
    ]).toString("utf8");
    decoded = JSON.parse(plaintext);
  } catch {
    throw new CashierCostEvidenceError(
      "CASHIER_COST_EVIDENCE_INVALID",
      "cashier cost evidence is invalid",
      409,
    );
  }
  const payload = parsePayload(decoded);
  const expectedMerchantId = identifier(input.merchantId, "merchant_id");
  const expectedProductId = identifier(input.productId, "product_id");
  const expectedVariantId = input.variantId
    ? identifier(input.variantId, "variant_id")
    : undefined;
  const expectedCatalogVersion = positiveInteger(
    input.catalogVersion,
    "catalog_version",
  );
  if (
    payload.merchant_id !== expectedMerchantId ||
    payload.product_id !== expectedProductId ||
    payload.variant_id !== expectedVariantId ||
    payload.catalog_version !== expectedCatalogVersion
  ) {
    throw new CashierCostEvidenceError(
      "CASHIER_COST_EVIDENCE_MISMATCH",
      "cashier cost evidence does not match sale line identity",
      409,
    );
  }
  const now = input.now || new Date();
  if (!Number.isFinite(now.getTime()) || new Date(payload.expires_at).getTime() <= now.getTime()) {
    throw new CashierCostEvidenceError(
      "CASHIER_COST_EVIDENCE_EXPIRED",
      "cashier cost evidence has expired",
      409,
    );
  }
  return {
    unit_cost_minor: payload.unit_cost_minor,
    expires_at: payload.expires_at,
  };
}
