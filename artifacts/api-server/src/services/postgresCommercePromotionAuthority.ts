import crypto from "node:crypto";

import {
  CommercePromotionError,
  commercePromotionLifecycleAt,
  type CommercePromotionEffect,
  type CommercePromotionLifecycle,
  type CommercePromotionRule,
  type CommercePromotionScope,
} from "./commercePromotionRuntime";
import {
  MerchantRegionalError,
  instantToMerchantLocalDateTime,
  merchantLocalDateTimeToInstant,
  normalizeMerchantCurrencyCode,
  normalizeMerchantTimezone,
} from "./merchantRegionalRuntime";
import {
  operationalPostgresAuthorityRequired,
  operationalQueryRows,
  withMerchantOperationalTransaction,
  type OperationalQueryTarget,
} from "./operationalPostgresAuthority";

export type CommercePromotionView = CommercePromotionRule & {
  lifecycle: CommercePromotionLifecycle;
  starts_local: string;
  ends_local: string;
};

export type CommercePromotionCreateResult = {
  promotion: CommercePromotionView;
  replayed: boolean;
};

type MerchantRegionRow = {
  id: string;
  country_code: string;
  timezone: string;
  currency_code: string;
};

type PromotionRow = {
  id: string;
  merchant_id: string;
  name: string;
  scope: CommercePromotionScope;
  effect: CommercePromotionEffect;
  product_id: string | null;
  variant_id: string | null;
  percentage_bps: number | null;
  amount_minor: number | null;
  currency_code: string;
  minimum_subtotal_minor: number | null;
  starts_at: Date;
  ends_at: Date;
  schedule_timezone: string;
  priority: number;
  enabled: boolean;
  version: number;
  metadata: Record<string, unknown> | null;
  created_at: Date;
  updated_at: Date;
};

type PromotionInput = {
  name: string;
  scope: CommercePromotionScope;
  effect: CommercePromotionEffect;
  product_id?: string;
  variant_id?: string;
  percentage_bps?: number;
  amount_minor?: number;
  minimum_subtotal_minor?: number;
  starts_at: string;
  ends_at: string;
  schedule_timezone: string;
  priority: number;
  enabled: boolean;
};

const SCOPES = new Set<CommercePromotionScope>(["catalog_item", "delivery"]);
const EFFECTS = new Set<CommercePromotionEffect>([
  "percentage_off",
  "fixed_amount_off",
  "fixed_price",
  "free_delivery",
]);

function text(value: unknown, maximum = 500): string {
  const normalized = String(value ?? "").normalize("NFKC").trim();
  if (normalized.length > maximum) {
    throw new CommercePromotionError(
      "COMMERCE_PROMOTION_FIELD_INVALID",
      "promotion text field is too long",
      400,
    );
  }
  return normalized;
}

function optionalText(value: unknown, maximum = 200): string | undefined {
  const normalized = text(value, maximum);
  return normalized || undefined;
}

function integer(
  value: unknown,
  field: string,
  minimum: number,
  maximum: number,
  fallback?: number,
): number {
  if ((value === undefined || value === null || value === "") && fallback !== undefined) {
    return fallback;
  }
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < minimum || parsed > maximum) {
    throw new CommercePromotionError(
      "COMMERCE_PROMOTION_FIELD_INVALID",
      `${field} is invalid`,
      400,
      { field, minimum, maximum },
    );
  }
  return parsed;
}

function optionalInteger(
  value: unknown,
  field: string,
  minimum: number,
  maximum: number,
): number | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  return integer(value, field, minimum, maximum);
}

function bool(value: unknown, fallback: boolean): boolean {
  if (value === undefined || value === null || value === "") return fallback;
  if (typeof value !== "boolean") {
    throw new CommercePromotionError(
      "COMMERCE_PROMOTION_FIELD_INVALID",
      "enabled must be boolean",
      400,
      { field: "enabled" },
    );
  }
  return value;
}

function scope(value: unknown, fallback?: CommercePromotionScope): CommercePromotionScope {
  const normalized = text(value || fallback, 40) as CommercePromotionScope;
  if (!SCOPES.has(normalized)) {
    throw new CommercePromotionError(
      "COMMERCE_PROMOTION_SCOPE_INVALID",
      "promotion scope is invalid",
      400,
    );
  }
  return normalized;
}

function effect(value: unknown, fallback?: CommercePromotionEffect): CommercePromotionEffect {
  const normalized = text(value || fallback, 40) as CommercePromotionEffect;
  if (!EFFECTS.has(normalized)) {
    throw new CommercePromotionError(
      "COMMERCE_PROMOTION_EFFECT_INVALID",
      "promotion effect is invalid",
      400,
    );
  }
  return normalized;
}

function expectedVersion(value: unknown): number {
  return integer(value, "expected_version", 1, Number.MAX_SAFE_INTEGER);
}

function postgresRequired(): void {
  if (!operationalPostgresAuthorityRequired()) {
    throw new CommercePromotionError(
      "COMMERCE_PROMOTION_POSTGRES_REQUIRED",
      "commerce promotions require PostgreSQL authority",
      503,
    );
  }
}

function idempotencyKey(value: unknown): string {
  const key = text(value, 200);
  if (key.length < 8) {
    throw new CommercePromotionError(
      "COMMERCE_PROMOTION_IDEMPOTENCY_KEY_REQUIRED",
      "a stable Idempotency-Key of at least 8 characters is required",
      400,
    );
  }
  return key;
}

function sha256(value: string): string {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function promotionIdForKey(merchantId: string, key: string): string {
  return `promo_${sha256(`${merchantId}\0${key}`).slice(0, 32)}`;
}

function inputRequestHash(input: PromotionInput): string {
  return sha256(JSON.stringify(input));
}

async function merchantRegion(
  target: OperationalQueryTarget,
  merchantId: string,
  lock = false,
): Promise<MerchantRegionRow> {
  const rows = await operationalQueryRows<MerchantRegionRow>(
    target,
    `SELECT id, country_code, timezone, currency_code
       FROM merchants
      WHERE id = $1
      LIMIT 2${lock ? " FOR UPDATE" : ""}`,
    [merchantId],
  );
  if (rows.length !== 1) {
    throw new CommercePromotionError(
      "COMMERCE_PROMOTION_MERCHANT_NOT_FOUND",
      "merchant regional profile is unavailable",
      404,
    );
  }
  return {
    ...rows[0],
    timezone: normalizeMerchantTimezone(rows[0].timezone),
    currency_code: normalizeMerchantCurrencyCode(rows[0].currency_code),
  };
}

function rowToRule(row: PromotionRow): CommercePromotionRule {
  const rule: CommercePromotionRule = {
    id: text(row.id, 200),
    merchant_id: text(row.merchant_id, 200),
    name: text(row.name, 200),
    scope: scope(row.scope),
    effect: effect(row.effect),
    ...(row.product_id ? { product_id: text(row.product_id, 200) } : {}),
    ...(row.variant_id ? { variant_id: text(row.variant_id, 200) } : {}),
    ...(row.percentage_bps !== null
      ? { percentage_bps: integer(row.percentage_bps, "percentage_bps", 1, 10_000) }
      : {}),
    ...(row.amount_minor !== null
      ? { amount_minor: integer(row.amount_minor, "amount_minor", 0, Number.MAX_SAFE_INTEGER) }
      : {}),
    currency_code: normalizeMerchantCurrencyCode(row.currency_code),
    ...(row.minimum_subtotal_minor !== null
      ? {
          minimum_subtotal_minor: integer(
            row.minimum_subtotal_minor,
            "minimum_subtotal_minor",
            0,
            Number.MAX_SAFE_INTEGER,
          ),
        }
      : {}),
    starts_at: row.starts_at.toISOString(),
    ends_at: row.ends_at.toISOString(),
    schedule_timezone: normalizeMerchantTimezone(row.schedule_timezone),
    priority: integer(row.priority, "priority", 0, 1000),
    enabled: row.enabled,
    version: integer(row.version, "version", 1, Number.MAX_SAFE_INTEGER),
  };
  commercePromotionLifecycleAt(rule);
  return rule;
}

function viewOf(rule: CommercePromotionRule): CommercePromotionView {
  return {
    ...rule,
    lifecycle: commercePromotionLifecycleAt(rule),
    starts_local: instantToMerchantLocalDateTime(
      rule.starts_at,
      rule.schedule_timezone,
    ),
    ends_local: instantToMerchantLocalDateTime(
      rule.ends_at,
      rule.schedule_timezone,
    ),
  };
}

async function promotionRows(
  target: OperationalQueryTarget,
  merchantId: string,
  lock = false,
): Promise<PromotionRow[]> {
  return operationalQueryRows<PromotionRow>(
    target,
    `SELECT id, merchant_id, name, scope, effect, product_id, variant_id,
            percentage_bps, amount_minor, currency_code, minimum_subtotal_minor,
            starts_at, ends_at, schedule_timezone, priority, enabled, version,
            metadata, created_at, updated_at
       FROM commerce_promotions
      WHERE merchant_id = $1
      ORDER BY starts_at DESC, id ASC${lock ? " FOR UPDATE" : ""}`,
    [merchantId],
  );
}

function requirePromotion(rows: PromotionRow[], promotionId: string): PromotionRow {
  const found = rows.find((row) => row.id === promotionId);
  if (!found) {
    throw new CommercePromotionError(
      "COMMERCE_PROMOTION_NOT_FOUND",
      "promotion was not found",
      404,
    );
  }
  return found;
}

function normalizeInput(
  value: unknown,
  merchant: MerchantRegionRow,
  existing?: CommercePromotionRule,
): PromotionInput {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new CommercePromotionError(
      "COMMERCE_PROMOTION_INPUT_INVALID",
      "promotion input must be an object",
      400,
    );
  }
  const input = value as Record<string, unknown>;
  if (
    Object.prototype.hasOwnProperty.call(input, "merchant_id") ||
    Object.prototype.hasOwnProperty.call(input, "currency_code") ||
    Object.prototype.hasOwnProperty.call(input, "schedule_timezone") ||
    Object.prototype.hasOwnProperty.call(input, "starts_at") ||
    Object.prototype.hasOwnProperty.call(input, "ends_at")
  ) {
    throw new CommercePromotionError(
      "COMMERCE_PROMOTION_AUTHORITY_OVERRIDE_FORBIDDEN",
      "merchant, currency, timezone, and absolute schedule are server-authoritative",
      400,
    );
  }

  const resolvedScope = scope(input.scope, existing?.scope);
  const resolvedEffect = effect(input.effect, existing?.effect);
  const name = Object.prototype.hasOwnProperty.call(input, "name")
    ? text(input.name, 200)
    : existing?.name || "";
  if (!name) {
    throw new CommercePromotionError(
      "COMMERCE_PROMOTION_NAME_REQUIRED",
      "promotion name is required",
      400,
    );
  }

  const productId = Object.prototype.hasOwnProperty.call(input, "product_id")
    ? optionalText(input.product_id)
    : existing?.product_id;
  const variantId = Object.prototype.hasOwnProperty.call(input, "variant_id")
    ? optionalText(input.variant_id)
    : existing?.variant_id;
  const percentageBps = Object.prototype.hasOwnProperty.call(input, "percentage_bps")
    ? optionalInteger(input.percentage_bps, "percentage_bps", 1, 10_000)
    : existing?.percentage_bps;
  const amountMinor = Object.prototype.hasOwnProperty.call(input, "amount_minor")
    ? optionalInteger(input.amount_minor, "amount_minor", 0, Number.MAX_SAFE_INTEGER)
    : existing?.amount_minor;
  const minimumSubtotalMinor = Object.prototype.hasOwnProperty.call(
    input,
    "minimum_subtotal_minor",
  )
    ? optionalInteger(
        input.minimum_subtotal_minor,
        "minimum_subtotal_minor",
        0,
        Number.MAX_SAFE_INTEGER,
      )
    : existing?.minimum_subtotal_minor;

  const scheduleChanged =
    Object.prototype.hasOwnProperty.call(input, "starts_local") ||
    Object.prototype.hasOwnProperty.call(input, "ends_local");
  let startsAt = existing?.starts_at;
  let endsAt = existing?.ends_at;
  let scheduleTimezone = existing?.schedule_timezone || merchant.timezone;
  if (!existing || scheduleChanged) {
    if (
      !Object.prototype.hasOwnProperty.call(input, "starts_local") ||
      !Object.prototype.hasOwnProperty.call(input, "ends_local")
    ) {
      throw new CommercePromotionError(
        "COMMERCE_PROMOTION_SCHEDULE_REQUIRED",
        "starts_local and ends_local are required together",
        400,
      );
    }
    scheduleTimezone = merchant.timezone;
    startsAt = merchantLocalDateTimeToInstant(input.starts_local, scheduleTimezone);
    endsAt = merchantLocalDateTimeToInstant(input.ends_local, scheduleTimezone);
  }
  if (!startsAt || !endsAt) {
    throw new CommercePromotionError(
      "COMMERCE_PROMOTION_SCHEDULE_REQUIRED",
      "promotion schedule is required",
      400,
    );
  }

  const priority = Object.prototype.hasOwnProperty.call(input, "priority")
    ? integer(input.priority, "priority", 0, 1000)
    : existing?.priority ?? 0;
  const enabled = Object.prototype.hasOwnProperty.call(input, "enabled")
    ? bool(input.enabled, true)
    : existing?.enabled ?? true;

  const candidate: CommercePromotionRule = {
    id: existing?.id || "candidate",
    merchant_id: existing?.merchant_id || merchant.id,
    name,
    scope: resolvedScope,
    effect: resolvedEffect,
    ...(productId ? { product_id: productId } : {}),
    ...(variantId ? { variant_id: variantId } : {}),
    ...(percentageBps !== undefined ? { percentage_bps: percentageBps } : {}),
    ...(amountMinor !== undefined ? { amount_minor: amountMinor } : {}),
    currency_code: merchant.currency_code,
    ...(minimumSubtotalMinor !== undefined
      ? { minimum_subtotal_minor: minimumSubtotalMinor }
      : {}),
    starts_at: startsAt,
    ends_at: endsAt,
    schedule_timezone: scheduleTimezone,
    priority,
    enabled,
    version: existing?.version || 1,
  };
  commercePromotionLifecycleAt(candidate);

  return {
    name,
    scope: resolvedScope,
    effect: resolvedEffect,
    ...(productId ? { product_id: productId } : {}),
    ...(variantId ? { variant_id: variantId } : {}),
    ...(percentageBps !== undefined ? { percentage_bps: percentageBps } : {}),
    ...(amountMinor !== undefined ? { amount_minor: amountMinor } : {}),
    ...(minimumSubtotalMinor !== undefined
      ? { minimum_subtotal_minor: minimumSubtotalMinor }
      : {}),
    starts_at: startsAt,
    ends_at: endsAt,
    schedule_timezone: scheduleTimezone,
    priority,
    enabled,
  };
}

function samePrecedenceTarget(
  left: CommercePromotionRule,
  right: PromotionInput,
): boolean {
  if (left.scope !== right.scope || left.priority !== right.priority) return false;
  if (left.scope === "delivery") return true;
  return (
    left.product_id === right.product_id &&
    (left.variant_id || undefined) === (right.variant_id || undefined)
  );
}

function windowsOverlap(
  left: CommercePromotionRule,
  right: PromotionInput,
): boolean {
  return (
    new Date(left.starts_at).getTime() < new Date(right.ends_at).getTime() &&
    new Date(left.ends_at).getTime() > new Date(right.starts_at).getTime()
  );
}

function assertNoPromotionConflict(
  rows: PromotionRow[],
  input: PromotionInput,
  excludedId?: string,
): void {
  if (!input.enabled) return;
  const conflict = rows
    .filter((row) => row.id !== excludedId)
    .map(rowToRule)
    .find(
      (rule) =>
        rule.enabled &&
        samePrecedenceTarget(rule, input) &&
        windowsOverlap(rule, input),
    );
  if (conflict) {
    throw new CommercePromotionError(
      "COMMERCE_PROMOTION_WINDOW_CONFLICT",
      "another enabled promotion with the same precedence overlaps this schedule",
      409,
      { conflicting_promotion_id: conflict.id },
    );
  }
}

async function assertTargetExists(
  target: OperationalQueryTarget,
  merchantId: string,
  input: PromotionInput,
): Promise<void> {
  if (input.scope !== "catalog_item") return;
  const productRows = await operationalQueryRows<{ id: string }>(
    target,
    `SELECT id FROM products
      WHERE merchant_id = $1 AND id = $2 AND deleted_at IS NULL
      LIMIT 2`,
    [merchantId, input.product_id],
  );
  if (productRows.length !== 1) {
    throw new CommercePromotionError(
      "COMMERCE_PROMOTION_TARGET_NOT_FOUND",
      "promotion product target was not found",
      404,
    );
  }
  if (!input.variant_id) return;
  const variantRows = await operationalQueryRows<{ id: string }>(
    target,
    `SELECT id FROM product_variants
      WHERE merchant_id = $1 AND product_id = $2 AND id = $3
      LIMIT 2`,
    [merchantId, input.product_id, input.variant_id],
  );
  if (variantRows.length !== 1) {
    throw new CommercePromotionError(
      "COMMERCE_PROMOTION_TARGET_NOT_FOUND",
      "promotion variant target was not found",
      404,
    );
  }
}

export async function listCommercePromotionsAuthoritative(
  merchantIdValue: unknown,
): Promise<CommercePromotionView[]> {
  postgresRequired();
  const merchantId = text(merchantIdValue, 200);
  if (!merchantId) {
    throw new CommercePromotionError(
      "COMMERCE_PROMOTION_MERCHANT_INVALID",
      "merchant is required",
      400,
    );
  }
  return withMerchantOperationalTransaction(merchantId, async (client) => {
    await merchantRegion(client, merchantId);
    return (await promotionRows(client, merchantId)).map(rowToRule).map(viewOf);
  });
}

export async function createCommercePromotionAuthoritative(params: {
  merchantId: unknown;
  idempotencyKey: unknown;
  input: unknown;
}): Promise<CommercePromotionCreateResult> {
  postgresRequired();
  const merchantId = text(params.merchantId, 200);
  const key = idempotencyKey(params.idempotencyKey);
  if (!merchantId) {
    throw new CommercePromotionError(
      "COMMERCE_PROMOTION_MERCHANT_INVALID",
      "merchant is required",
      400,
    );
  }
  return withMerchantOperationalTransaction(merchantId, async (client) => {
    const merchant = await merchantRegion(client, merchantId, true);
    const input = normalizeInput(params.input, merchant);
    const requestHash = inputRequestHash(input);
    const id = promotionIdForKey(merchantId, key);
    const rows = await promotionRows(client, merchantId, true);
    const replay = rows.find((row) => row.id === id);
    if (replay) {
      const storedHash = text(replay.metadata?.create_request_hash, 128);
      if (!storedHash || storedHash !== requestHash) {
        throw new CommercePromotionError(
          "COMMERCE_PROMOTION_IDEMPOTENCY_CONFLICT",
          "Idempotency-Key was already used with different promotion data",
          409,
        );
      }
      return { promotion: viewOf(rowToRule(replay)), replayed: true };
    }

    await assertTargetExists(client, merchantId, input);
    assertNoPromotionConflict(rows, input);
    const inserted = await operationalQueryRows<PromotionRow>(
      client,
      `INSERT INTO commerce_promotions (
         id, merchant_id, name, scope, effect, product_id, variant_id,
         percentage_bps, amount_minor, currency_code, minimum_subtotal_minor,
         starts_at, ends_at, schedule_timezone, priority, enabled, version,
         metadata
       ) VALUES (
         $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,1,$17::jsonb
       )
       RETURNING id, merchant_id, name, scope, effect, product_id, variant_id,
                 percentage_bps, amount_minor, currency_code,
                 minimum_subtotal_minor, starts_at, ends_at,
                 schedule_timezone, priority, enabled, version, metadata,
                 created_at, updated_at`,
      [
        id,
        merchantId,
        input.name,
        input.scope,
        input.effect,
        input.product_id || null,
        input.variant_id || null,
        input.percentage_bps ?? null,
        input.amount_minor ?? null,
        merchant.currency_code,
        input.minimum_subtotal_minor ?? null,
        new Date(input.starts_at),
        new Date(input.ends_at),
        input.schedule_timezone,
        input.priority,
        input.enabled,
        JSON.stringify({ create_request_hash: requestHash }),
      ],
    );
    if (inserted.length !== 1) {
      throw new CommercePromotionError(
        "COMMERCE_PROMOTION_WRITE_FAILED",
        "promotion creation failed",
        503,
      );
    }
    return { promotion: viewOf(rowToRule(inserted[0])), replayed: false };
  });
}

export async function updateCommercePromotionAuthoritative(params: {
  merchantId: unknown;
  promotionId: unknown;
  expectedVersion: unknown;
  input: unknown;
}): Promise<CommercePromotionView> {
  postgresRequired();
  const merchantId = text(params.merchantId, 200);
  const promotionId = text(params.promotionId, 200);
  const version = expectedVersion(params.expectedVersion);
  if (!merchantId || !promotionId) {
    throw new CommercePromotionError(
      "COMMERCE_PROMOTION_ID_INVALID",
      "merchant and promotion identifiers are required",
      400,
    );
  }
  return withMerchantOperationalTransaction(merchantId, async (client) => {
    const merchant = await merchantRegion(client, merchantId, true);
    const rows = await promotionRows(client, merchantId, true);
    const currentRow = requirePromotion(rows, promotionId);
    const current = rowToRule(currentRow);
    if (current.version !== version) {
      throw new CommercePromotionError(
        "COMMERCE_PROMOTION_VERSION_CONFLICT",
        "promotion was changed by another request",
        409,
        { expected_version: version, current_version: current.version },
      );
    }
    const input = normalizeInput(params.input, merchant, current);
    await assertTargetExists(client, merchantId, input);
    assertNoPromotionConflict(rows, input, promotionId);
    const updated = await operationalQueryRows<PromotionRow>(
      client,
      `UPDATE commerce_promotions
          SET name = $3,
              scope = $4,
              effect = $5,
              product_id = $6,
              variant_id = $7,
              percentage_bps = $8,
              amount_minor = $9,
              currency_code = $10,
              minimum_subtotal_minor = $11,
              starts_at = $12,
              ends_at = $13,
              schedule_timezone = $14,
              priority = $15,
              enabled = $16,
              version = version + 1,
              updated_at = now()
        WHERE merchant_id = $1 AND id = $2 AND version = $17
        RETURNING id, merchant_id, name, scope, effect, product_id, variant_id,
                  percentage_bps, amount_minor, currency_code,
                  minimum_subtotal_minor, starts_at, ends_at,
                  schedule_timezone, priority, enabled, version, metadata,
                  created_at, updated_at`,
      [
        merchantId,
        promotionId,
        input.name,
        input.scope,
        input.effect,
        input.product_id || null,
        input.variant_id || null,
        input.percentage_bps ?? null,
        input.amount_minor ?? null,
        merchant.currency_code,
        input.minimum_subtotal_minor ?? null,
        new Date(input.starts_at),
        new Date(input.ends_at),
        input.schedule_timezone,
        input.priority,
        input.enabled,
        version,
      ],
    );
    if (updated.length !== 1) {
      throw new CommercePromotionError(
        "COMMERCE_PROMOTION_VERSION_CONFLICT",
        "promotion was changed by another request",
        409,
        { expected_version: version },
      );
    }
    return viewOf(rowToRule(updated[0]));
  });
}

export async function deleteCommercePromotionAuthoritative(params: {
  merchantId: unknown;
  promotionId: unknown;
  expectedVersion: unknown;
}): Promise<{ deleted_promotion_id: string; deleted_version: number }> {
  postgresRequired();
  const merchantId = text(params.merchantId, 200);
  const promotionId = text(params.promotionId, 200);
  const version = expectedVersion(params.expectedVersion);
  if (!merchantId || !promotionId) {
    throw new CommercePromotionError(
      "COMMERCE_PROMOTION_ID_INVALID",
      "merchant and promotion identifiers are required",
      400,
    );
  }
  return withMerchantOperationalTransaction(merchantId, async (client) => {
    await merchantRegion(client, merchantId, true);
    const rows = await operationalQueryRows<{ id: string }>(
      client,
      `DELETE FROM commerce_promotions
        WHERE merchant_id = $1 AND id = $2 AND version = $3
        RETURNING id`,
      [merchantId, promotionId, version],
    );
    if (rows.length !== 1) {
      const existing = await promotionRows(client, merchantId);
      const current = existing.find((row) => row.id === promotionId);
      if (!current) {
        throw new CommercePromotionError(
          "COMMERCE_PROMOTION_NOT_FOUND",
          "promotion was not found",
          404,
        );
      }
      throw new CommercePromotionError(
        "COMMERCE_PROMOTION_VERSION_CONFLICT",
        "promotion was changed by another request",
        409,
        { expected_version: version, current_version: current.version },
      );
    }
    return { deleted_promotion_id: promotionId, deleted_version: version };
  });
}

export async function activeCommercePromotionsForPricing(params: {
  sql: OperationalQueryTarget;
  merchantId: string;
  at?: Date;
}): Promise<CommercePromotionRule[]> {
  postgresRequired();
  const at = params.at || new Date();
  const rows = await operationalQueryRows<PromotionRow>(
    params.sql,
    `SELECT id, merchant_id, name, scope, effect, product_id, variant_id,
            percentage_bps, amount_minor, currency_code, minimum_subtotal_minor,
            starts_at, ends_at, schedule_timezone, priority, enabled, version,
            metadata, created_at, updated_at
       FROM commerce_promotions
      WHERE merchant_id = $1
        AND enabled = TRUE
        AND starts_at <= $2
        AND ends_at > $2
      ORDER BY priority DESC, id ASC`,
    [params.merchantId, at],
  );
  return rows.map(rowToRule);
}

export function isMerchantRegionalError(error: unknown): error is MerchantRegionalError {
  return error instanceof MerchantRegionalError;
}
