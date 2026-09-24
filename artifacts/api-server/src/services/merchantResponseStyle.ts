import {
  operationalDatabasePool,
  withMerchantOperationalTransaction,
  type OperationalQueryTarget,
} from "./operationalPostgresAuthority.js";
import type {
  MerchantResponseBrevity,
  MerchantResponseEmojiStyle,
  MerchantResponseStyle,
  MerchantResponseTone,
} from "./knowledge/types.js";

const METADATA_KEY = "fawri_response_style_v1";
const TONES = new Set<MerchantResponseTone>([
  "professional",
  "friendly",
  "warm",
  "direct",
]);
const BREVITY = new Set<MerchantResponseBrevity>([
  "concise",
  "balanced",
  "detailed",
]);
const EMOJI_STYLES = new Set<MerchantResponseEmojiStyle>([
  "none",
  "minimal",
  "expressive",
]);

export const DEFAULT_MERCHANT_RESPONSE_STYLE: MerchantResponseStyle = Object.freeze({
  version: 1,
  tone: "professional",
  brevity: "balanced",
  emojiStyle: "minimal",
  customInstructions: "",
  updatedAt: null,
});

export class MerchantResponseStyleError extends Error {
  readonly code: string;
  readonly status: number;
  readonly current?: MerchantResponseStyle;

  constructor(
    code: string,
    message: string,
    status = 400,
    current?: MerchantResponseStyle,
  ) {
    super(message);
    this.name = "MerchantResponseStyleError";
    this.code = code;
    this.status = status;
    this.current = current;
  }
}

function text(value: unknown, maxLength = 800): string {
  return String(value ?? "").trim().slice(0, maxLength);
}

function merchantId(value: unknown): string {
  const id = text(value, 200);
  if (!id) {
    throw new MerchantResponseStyleError(
      "MERCHANT_RESPONSE_STYLE_TENANT_INVALID",
      "merchant tenant is invalid",
      400,
    );
  }
  return id;
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function positiveVersion(value: unknown): number | null {
  const version = Number(value);
  return Number.isInteger(version) && version > 0 ? version : null;
}

function timestamp(value: unknown): string | null {
  if (typeof value !== "string" || !value.trim()) return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : null;
}

function cloneDefault(): MerchantResponseStyle {
  return { ...DEFAULT_MERCHANT_RESPONSE_STYLE };
}

export function responseStyleFromMerchantMetadata(
  value: unknown,
): MerchantResponseStyle {
  const metadata = record(value);
  if (!Object.prototype.hasOwnProperty.call(metadata, METADATA_KEY)) {
    return cloneDefault();
  }

  const style = record(metadata[METADATA_KEY]);
  const version = positiveVersion(style.version);
  const tone = style.tone;
  const brevity = style.brevity;
  const emojiStyle = style.emoji_style;
  const customInstructions =
    typeof style.custom_instructions === "string"
      ? style.custom_instructions.trim().slice(0, 800)
      : null;
  const updatedAt = timestamp(style.updated_at);

  if (
    version === null ||
    !TONES.has(tone as MerchantResponseTone) ||
    !BREVITY.has(brevity as MerchantResponseBrevity) ||
    !EMOJI_STYLES.has(emojiStyle as MerchantResponseEmojiStyle) ||
    customInstructions === null ||
    !updatedAt
  ) {
    // Style is presentation-only. A malformed optional style must not block
    // factual customer service; safely fall back to the canonical default.
    return cloneDefault();
  }

  return {
    version,
    tone: tone as MerchantResponseTone,
    brevity: brevity as MerchantResponseBrevity,
    emojiStyle: emojiStyle as MerchantResponseEmojiStyle,
    customInstructions,
    updatedAt,
  };
}

function normalizePatch(
  current: MerchantResponseStyle,
  value: unknown,
): Omit<MerchantResponseStyle, "version" | "updatedAt"> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new MerchantResponseStyleError(
      "MERCHANT_RESPONSE_STYLE_PATCH_INVALID",
      "response style patch must be an object",
      400,
    );
  }
  const patch = value as Record<string, unknown>;
  const allowed = new Set([
    "tone",
    "brevity",
    "emojiStyle",
    "customInstructions",
  ]);
  const unsupported = Object.keys(patch).filter((key) => !allowed.has(key));
  if (unsupported.length > 0) {
    throw new MerchantResponseStyleError(
      "MERCHANT_RESPONSE_STYLE_FIELD_UNSUPPORTED",
      "response style contains unsupported fields",
      400,
    );
  }

  const tone =
    patch.tone === undefined ? current.tone : patch.tone;
  const brevity =
    patch.brevity === undefined ? current.brevity : patch.brevity;
  const emojiStyle =
    patch.emojiStyle === undefined ? current.emojiStyle : patch.emojiStyle;

  if (!TONES.has(tone as MerchantResponseTone)) {
    throw new MerchantResponseStyleError(
      "MERCHANT_RESPONSE_STYLE_TONE_INVALID",
      "response tone is invalid",
      400,
    );
  }
  if (!BREVITY.has(brevity as MerchantResponseBrevity)) {
    throw new MerchantResponseStyleError(
      "MERCHANT_RESPONSE_STYLE_BREVITY_INVALID",
      "response brevity is invalid",
      400,
    );
  }
  if (!EMOJI_STYLES.has(emojiStyle as MerchantResponseEmojiStyle)) {
    throw new MerchantResponseStyleError(
      "MERCHANT_RESPONSE_STYLE_EMOJI_INVALID",
      "response emoji style is invalid",
      400,
    );
  }

  let customInstructions = current.customInstructions;
  if (patch.customInstructions !== undefined) {
    if (typeof patch.customInstructions !== "string") {
      throw new MerchantResponseStyleError(
        "MERCHANT_RESPONSE_STYLE_INSTRUCTIONS_INVALID",
        "response style instructions must be text",
        400,
      );
    }
    if (patch.customInstructions.length > 800) {
      throw new MerchantResponseStyleError(
        "MERCHANT_RESPONSE_STYLE_INSTRUCTIONS_TOO_LONG",
        "response style instructions are too long",
        400,
      );
    }
    customInstructions = patch.customInstructions.trim();
  }

  return {
    tone: tone as MerchantResponseTone,
    brevity: brevity as MerchantResponseBrevity,
    emojiStyle: emojiStyle as MerchantResponseEmojiStyle,
    customInstructions,
  };
}

async function loadRow(
  target: OperationalQueryTarget,
  id: string,
  lock = false,
): Promise<{ id: string; metadata: Record<string, unknown> } | null> {
  const result = await target.query<{
    id: string;
    metadata: Record<string, unknown>;
  }>(
    `SELECT id, metadata
       FROM merchants
      WHERE id = $1
      LIMIT 2${lock ? " FOR UPDATE" : ""}`,
    [id],
  );
  if (result.rows.length > 1) {
    throw new MerchantResponseStyleError(
      "MERCHANT_RESPONSE_STYLE_STATE_INVALID",
      "merchant response style state is invalid",
      503,
    );
  }
  const row = result.rows[0];
  if (!row) return null;
  if (row.id !== id) {
    throw new MerchantResponseStyleError(
      "MERCHANT_RESPONSE_STYLE_TENANT_MISMATCH",
      "merchant response style tenant boundary is invalid",
      503,
    );
  }
  return {
    id: row.id,
    metadata: record(row.metadata),
  };
}

export async function getMerchantResponseStyleAuthoritative(
  merchantIdValue: unknown,
): Promise<MerchantResponseStyle> {
  const id = merchantId(merchantIdValue);
  const pool = await operationalDatabasePool();
  const row = await loadRow(pool, id);
  if (!row) {
    throw new MerchantResponseStyleError(
      "MERCHANT_RESPONSE_STYLE_NOT_FOUND",
      "merchant response style is unavailable",
      404,
    );
  }
  return responseStyleFromMerchantMetadata(row.metadata);
}

export async function updateMerchantResponseStyleAuthoritative(input: {
  merchantId: unknown;
  expectedVersion: unknown;
  patch: unknown;
}): Promise<MerchantResponseStyle> {
  const id = merchantId(input.merchantId);
  const expectedVersion = positiveVersion(input.expectedVersion);
  if (expectedVersion === null) {
    throw new MerchantResponseStyleError(
      "MERCHANT_RESPONSE_STYLE_VERSION_REQUIRED",
      "a positive expected version is required",
      400,
    );
  }

  return withMerchantOperationalTransaction(id, async (client) => {
    const row = await loadRow(client, id, true);
    if (!row) {
      throw new MerchantResponseStyleError(
        "MERCHANT_RESPONSE_STYLE_NOT_FOUND",
        "merchant response style is unavailable",
        404,
      );
    }

    const current = responseStyleFromMerchantMetadata(row.metadata);
    if (current.version !== expectedVersion) {
      throw new MerchantResponseStyleError(
        "MERCHANT_RESPONSE_STYLE_VERSION_CONFLICT",
        "response style changed on another device",
        409,
        current,
      );
    }

    const patch = normalizePatch(current, input.patch);
    const now = new Date().toISOString();
    const next: MerchantResponseStyle = {
      version: current.version + 1,
      ...patch,
      updatedAt: now,
    };
    const metadata = {
      ...row.metadata,
      [METADATA_KEY]: {
        version: next.version,
        tone: next.tone,
        brevity: next.brevity,
        emoji_style: next.emojiStyle,
        custom_instructions: next.customInstructions,
        updated_at: next.updatedAt,
      },
    };

    const updated = await client.query<{ id: string }>(
      `UPDATE merchants
          SET metadata = $2::jsonb,
              updated_at = now()
        WHERE id = $1
      RETURNING id`,
      [id, JSON.stringify(metadata)],
    );
    if (updated.rows.length !== 1 || updated.rows[0]?.id !== id) {
      throw new MerchantResponseStyleError(
        "MERCHANT_RESPONSE_STYLE_UPDATE_FAILED",
        "merchant response style could not be saved",
        503,
      );
    }
    return next;
  });
}
