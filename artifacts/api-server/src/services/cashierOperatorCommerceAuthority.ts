import crypto from "node:crypto";
import {
  CashierLocationInventoryError,
  mutateCashierLocationInventoryInTransaction,
  projectCashierCatalogForLocationAuthoritative,
} from "./cashierLocationInventoryAuthority";
import {
  issueCashierCostEvidence,
  resolveCashierCostEvidence,
} from "./cashierCostEvidence";
import {
  getMerchantCommerceContextAuthoritative,
} from "./postgresMerchantRegionalAuthority";
import { listCatalogProductsAuthoritative } from "./postgresCatalogAuthority";
import { listCommercePromotionsAuthoritative } from "./postgresCommercePromotionAuthority";
import {
  CashierSyncError,
  syncCashierSaleAuthoritative,
} from "./postgresCashierSyncAuthority";
import { syncCashierCompensationAuthoritative } from "./postgresCashierCompensationSyncAuthority";
import type { CashierOperatorContext } from "./postgresCashierStaffAuthority";
import {
  operationalQueryRows,
  withMerchantOperationalTransaction,
  type OperationalQueryTarget,
} from "./operationalPostgresAuthority";

export type CashierOperatorOperationKind =
  | "sale"
  | "return"
  | "void"
  | "inventory_adjustment";

type BundleIdentity = {
  cloudMerchantId: string;
  deviceId: string;
  operationId: string;
  deviceSequence: number;
  occurredAt: string;
};

type AttributionRow = {
  operation_id: string;
  sale_id: string | null;
  operation_kind: string;
  station_id: string;
  location_id: string;
  staff_id: string;
  shift_id: string;
  device_id: string;
  station_credential_id: string;
  operator_session_id: string;
  occurred_at: Date | string;
};

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function identifier(value: unknown, field: string, maxLength = 200): string {
  const normalized = String(value ?? "").normalize("NFKC").trim();
  if (
    !normalized ||
    normalized.length > maxLength ||
    /[\u0000-\u001f\u007f]/.test(normalized)
  ) {
    throw new CashierSyncError(
      "CASHIER_OPERATOR_SYNC_INVALID",
      `${field} is invalid`,
      400,
      { field },
    );
  }
  return normalized;
}

function positiveInteger(value: unknown, field: string): number {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    throw new CashierSyncError(
      "CASHIER_OPERATOR_SYNC_INVALID",
      `${field} is invalid`,
      400,
      { field },
    );
  }
  return parsed;
}

function instant(value: unknown, field: string): string {
  const parsed = new Date(String(value ?? ""));
  if (!Number.isFinite(parsed.getTime())) {
    throw new CashierSyncError(
      "CASHIER_OPERATOR_SYNC_INVALID",
      `${field} is invalid`,
      400,
      { field },
    );
  }
  return parsed.toISOString();
}

function sha256(value: string): string {
  return crypto.createHash("sha256").update(value, "utf8").digest("hex");
}

function primaryEnvelopeForKind(
  body: unknown,
  kind: CashierOperatorOperationKind,
): Record<string, unknown> {
  const raw = record(body);
  if (!Array.isArray(raw.envelopes)) {
    throw new CashierSyncError(
      "CASHIER_OPERATOR_SYNC_INVALID",
      "cashier sync envelopes are required",
      400,
    );
  }
  const envelopes = raw.envelopes.map(record);
  if (kind === "sale") {
    const sale = envelopes.filter(
      (item) => item.entity_type === "sale" && item.operation === "append",
    );
    if (sale.length !== 1) {
      throw new CashierSyncError(
        "CASHIER_OPERATOR_SYNC_INVALID",
        "operator sale sync requires one sale append envelope",
        400,
      );
    }
    return sale[0];
  }
  if (kind === "return") {
    const returns = envelopes.filter(
      (item) => item.entity_type === "return" && item.operation === "append",
    );
    if (returns.length !== 1) {
      throw new CashierSyncError(
        "CASHIER_OPERATOR_SYNC_KIND_MISMATCH",
        "operator return endpoint requires a return operation",
        403,
      );
    }
    return returns[0];
  }
  if (kind === "void") {
    const voids = envelopes.filter(
      (item) => item.entity_type === "sale" && item.operation === "void",
    );
    if (voids.length !== 1) {
      throw new CashierSyncError(
        "CASHIER_OPERATOR_SYNC_KIND_MISMATCH",
        "operator void endpoint requires a void operation",
        403,
      );
    }
    return voids[0];
  }

  const adjustments = envelopes.filter(
    (item) =>
      item.entity_type === "inventory_movement" &&
      item.operation === "append",
  );
  if (adjustments.length !== 1 || envelopes.length !== 1) {
    throw new CashierSyncError(
      "CASHIER_OPERATOR_SYNC_KIND_MISMATCH",
      "operator inventory adjustment requires one standalone inventory movement",
      403,
    );
  }
  return adjustments[0];
}

export function cashierOperatorBundleIdentity(
  body: unknown,
  kind: CashierOperatorOperationKind,
): BundleIdentity {
  const raw = record(body);
  const primary = primaryEnvelopeForKind(body, kind);
  return {
    cloudMerchantId: identifier(raw.cloud_merchant_id, "cloud_merchant_id"),
    deviceId: identifier(raw.device_id, "device_id"),
    operationId: identifier(raw.operation_id, "operation_id"),
    deviceSequence: positiveInteger(raw.device_sequence, "device_sequence"),
    occurredAt: instant(primary.occurred_at, "occurred_at"),
  };
}

function assertOperatorIdentity(
  context: CashierOperatorContext,
  identity: BundleIdentity,
): void {
  if (identity.cloudMerchantId !== context.merchant_id) {
    throw new CashierSyncError(
      "CASHIER_SYNC_TENANT_MISMATCH",
      "cashier operator merchant does not match operation binding",
      403,
    );
  }
  if (identity.deviceId !== context.device_id) {
    throw new CashierSyncError(
      "CASHIER_OPERATOR_DEVICE_MISMATCH",
      "cashier operation device does not match paired station credential",
      403,
    );
  }
}

function rawOptionalCost(value: unknown): number | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 0) {
    throw new CashierSyncError(
      "CASHIER_OPERATOR_CATALOG_COST_INVALID",
      "cashier catalog reporting cost is invalid",
      503,
    );
  }
  return parsed;
}

export function sanitizeCashierCatalogProduct(
  productValue: unknown,
  includeRawCost: boolean,
): Record<string, unknown> {
  const product = record(productValue);
  const productId = identifier(product.id, "product.id");
  const merchantId = identifier(product.merchant_id, "product.merchant_id");
  const catalogVersion = positiveInteger(product.version, "product.version");
  const productCost = rawOptionalCost(product.cost_iqd);
  const result: Record<string, unknown> = {
    ...product,
    cost_evidence: issueCashierCostEvidence({
      merchantId,
      productId,
      catalogVersion,
      unitCostMinor: productCost,
    }),
  };
  if (!includeRawCost) {
    delete result.cost_iqd;
    delete result.variant_costs_iqd;
  }
  if (Array.isArray(product.variants)) {
    result.variants = product.variants.map((value) => {
      const variant = { ...record(value) };
      const variantId = identifier(variant.id, "variant.id");
      const variantCost = rawOptionalCost(variant.cost_iqd) ?? productCost;
      variant.cost_evidence = issueCashierCostEvidence({
        merchantId,
        productId,
        variantId,
        catalogVersion,
        unitCostMinor: variantCost,
      });
      if (!includeRawCost) delete variant.cost_iqd;
      return variant;
    });
  }
  return result;
}

export async function getCashierOperatorCatalogSnapshotAuthoritative(
  context: CashierOperatorContext,
) {
  const [commerceContext, baseProducts, promotions] = await Promise.all([
    getMerchantCommerceContextAuthoritative(context.merchant_id),
    listCatalogProductsAuthoritative(context.merchant_id),
    listCommercePromotionsAuthoritative(context.merchant_id),
  ]);
  const projected = await projectCashierCatalogForLocationAuthoritative({
    merchantId: context.merchant_id,
    locationId: context.location_id,
    products: baseProducts,
  });
  const includeRawCost = context.permissions.includes("catalog.cost");
  return {
    merchant_id: context.merchant_id,
    station_id: context.station_id,
    location_id: context.location_id,
    staff_id: context.staff_id,
    shift_id: context.shift_id,
    permissions: context.permissions,
    cost_included: includeRawCost,
    context: commerceContext,
    products: projected.products.map((product) =>
      sanitizeCashierCatalogProduct(product, includeRawCost),
    ),
    promotions,
  };
}

function prepareOperatorSaleBody(
  context: CashierOperatorContext,
  body: unknown,
): Record<string, unknown> {
  const raw = record(body);
  if (!Array.isArray(raw.envelopes)) {
    throw new CashierSyncError(
      "CASHIER_OPERATOR_SYNC_INVALID",
      "cashier sync envelopes are required",
      400,
    );
  }
  const envelopes = raw.envelopes.map((value) => {
    const envelope = { ...record(value) };
    if (envelope.entity_type !== "sale" || envelope.operation !== "append") {
      return envelope;
    }
    const payload = { ...record(envelope.payload) };
    if (!Array.isArray(payload.lines)) {
      throw new CashierSyncError(
        "CASHIER_OPERATOR_SYNC_INVALID",
        "operator sale lines are required",
        400,
      );
    }
    payload.lines = payload.lines.map((value) => {
      const line = { ...record(value) };
      const productId = identifier(line.product_id, "line.product_id");
      const variantId = line.variant_id
        ? identifier(line.variant_id, "line.variant_id")
        : undefined;
      const catalogVersion = positiveInteger(
        line.catalog_version,
        "line.catalog_version",
      );
      const token = identifier(
        line.cost_evidence,
        "line.cost_evidence",
        4096,
      );
      const resolved = resolveCashierCostEvidence({
        token,
        merchantId: context.merchant_id,
        productId,
        ...(variantId ? { variantId } : {}),
        catalogVersion,
      });
      delete line.unit_cost_minor;
      delete line.cost_evidence;
      if (resolved.unit_cost_minor !== null) {
        line.unit_cost_minor = resolved.unit_cost_minor;
      }
      return line;
    });
    envelope.payload = payload;
    return envelope;
  });
  return { ...raw, envelopes };
}

async function recordAttribution(
  target: OperationalQueryTarget,
  input: {
    context: CashierOperatorContext;
    identity: BundleIdentity;
    saleId?: string;
    kind: CashierOperatorOperationKind;
  },
): Promise<void> {
  const { context, identity, saleId, kind } = input;
  const attributionId = `cashattr_${sha256(
    `${context.merchant_id}\0${identity.operationId}`,
  ).slice(0, 40)}`;
  await target.query(
    `INSERT INTO cashier_operation_attribution (
       id, merchant_id, operation_id, sale_id, operation_kind,
       station_id, location_id, staff_id, shift_id, device_id,
       station_credential_id, operator_session_id, occurred_at, created_at
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,now())
     ON CONFLICT (merchant_id, operation_id) DO NOTHING`,
    [
      attributionId,
      context.merchant_id,
      identity.operationId,
      saleId || null,
      kind,
      context.station_id,
      context.location_id,
      context.staff_id,
      context.shift_id,
      context.device_id,
      context.credential_id,
      context.operator_session_id,
      new Date(identity.occurredAt),
    ],
  );
  const rows = await operationalQueryRows<AttributionRow>(
    target,
    `SELECT operation_id, sale_id, operation_kind, station_id, location_id, staff_id,
            shift_id, device_id, station_credential_id, operator_session_id,
            occurred_at
       FROM cashier_operation_attribution
      WHERE merchant_id = $1 AND operation_id = $2
      LIMIT 1`,
    [context.merchant_id, identity.operationId],
  );
  const row = rows[0];
  if (!row) {
    throw new CashierSyncError(
      "CASHIER_OPERATOR_ATTRIBUTION_FAILED",
      "cashier operator attribution could not be persisted",
      500,
    );
  }
  const same =
    row.sale_id === (saleId || null) &&
    row.operation_kind === kind &&
    row.station_id === context.station_id &&
    row.location_id === context.location_id &&
    row.staff_id === context.staff_id &&
    row.shift_id === context.shift_id &&
    row.device_id === context.device_id &&
    row.station_credential_id === context.credential_id &&
    row.operator_session_id === context.operator_session_id &&
    new Date(row.occurred_at).toISOString() === identity.occurredAt;
  if (!same) {
    throw new CashierSyncError(
      "CASHIER_OPERATOR_ATTRIBUTION_CONFLICT",
      "cashier operation is already attributed to a different operator context",
      409,
    );
  }
}

async function persistOperatorAttribution(input: {
  context: CashierOperatorContext;
  identity: BundleIdentity;
  saleId?: string;
  kind: CashierOperatorOperationKind;
}): Promise<void> {
  await withMerchantOperationalTransaction(input.context.merchant_id, (client) =>
    recordAttribution(client, input),
  );
}

type CashierOperatorInventoryAdjustment = {
  localMerchantId: string;
  movementId: string;
  productId: string;
  variantId?: string;
  delta: number;
  reason: "restock" | "manual_adjustment";
  note?: string;
  occurredAt: string;
};

function signedInteger(value: unknown, field: string): number {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed === 0) {
    throw new CashierSyncError(
      "CASHIER_OPERATOR_SYNC_INVALID",
      `${field} must be a non-zero safe integer`,
      400,
      { field },
    );
  }
  return parsed;
}

function parseOperatorInventoryAdjustment(
  context: CashierOperatorContext,
  body: unknown,
  identity: BundleIdentity,
): CashierOperatorInventoryAdjustment {
  const raw = record(body);
  const localMerchantId = identifier(
    raw.local_merchant_id,
    "local_merchant_id",
  );
  if (!Array.isArray(raw.envelopes) || raw.envelopes.length !== 1) {
    throw new CashierSyncError(
      "CASHIER_OPERATOR_SYNC_INVALID",
      "inventory adjustment requires exactly one envelope",
      400,
    );
  }
  const envelope = record(raw.envelopes[0]);
  if (
    Number(envelope.schema_version) !== 1 ||
    envelope.entity_type !== "inventory_movement" ||
    envelope.operation !== "append"
  ) {
    throw new CashierSyncError(
      "CASHIER_OPERATOR_SYNC_INVALID",
      "inventory adjustment envelope is invalid",
      400,
    );
  }
  if (
    identifier(envelope.operation_id, "envelope.operation_id") !==
      identity.operationId ||
    identifier(envelope.device_id, "envelope.device_id") !==
      identity.deviceId ||
    positiveInteger(envelope.device_sequence, "envelope.device_sequence") !==
      identity.deviceSequence
  ) {
    throw new CashierSyncError(
      "CASHIER_OPERATOR_SYNC_INVALID",
      "inventory adjustment envelope identity mismatch",
      400,
    );
  }

  const movement = record(envelope.payload);
  const reason = identifier(movement.reason, "movement.reason", 64);
  if (reason !== "restock" && reason !== "manual_adjustment") {
    throw new CashierSyncError(
      "CASHIER_OPERATOR_ADJUSTMENT_REASON_INVALID",
      "standalone inventory adjustment reason is not allowed",
      409,
      { reason },
    );
  }
  const occurredAt = instant(movement.occurred_at, "movement.occurred_at");
  const envelopeOccurredAt = instant(
    envelope.occurred_at,
    "envelope.occurred_at",
  );
  const movementId = identifier(movement.movement_id, "movement.movement_id");
  if (
    movementId !== identifier(envelope.entity_id, "envelope.entity_id") ||
    identifier(movement.operation_id, "movement.operation_id") !==
      identity.operationId ||
    identifier(movement.local_merchant_id, "movement.local_merchant_id") !==
      localMerchantId ||
    (movement.cloud_merchant_id &&
      identifier(movement.cloud_merchant_id, "movement.cloud_merchant_id") !==
        context.merchant_id) ||
    identifier(movement.device_id, "movement.device_id") !==
      context.device_id ||
    positiveInteger(movement.device_sequence, "movement.device_sequence") !==
      identity.deviceSequence ||
    occurredAt !== identity.occurredAt ||
    envelopeOccurredAt !== identity.occurredAt ||
    movement.related_sale_id
  ) {
    throw new CashierSyncError(
      "CASHIER_OPERATOR_SYNC_INVALID",
      "inventory adjustment movement identity mismatch",
      400,
    );
  }

  return {
    localMerchantId,
    movementId,
    productId: identifier(movement.product_id, "movement.product_id"),
    ...(movement.variant_id
      ? { variantId: identifier(movement.variant_id, "movement.variant_id") }
      : {}),
    delta: signedInteger(movement.delta, "movement.delta"),
    reason,
    ...(movement.note
      ? { note: identifier(movement.note, "movement.note", 500) }
      : {}),
    occurredAt,
  };
}

export async function syncCashierOperatorInventoryAdjustmentAuthoritative(input: {
  context: CashierOperatorContext;
  body: unknown;
}) {
  const identity = cashierOperatorBundleIdentity(
    input.body,
    "inventory_adjustment",
  );
  assertOperatorIdentity(input.context, identity);
  const adjustment = parseOperatorInventoryAdjustment(
    input.context,
    input.body,
    identity,
  );
  const requestHash = sha256(
    JSON.stringify({
      merchant_id: input.context.merchant_id,
      location_id: input.context.location_id,
      local_merchant_id: adjustment.localMerchantId,
      device_id: input.context.device_id,
      device_sequence: identity.deviceSequence,
      operation_id: identity.operationId,
      movement_id: adjustment.movementId,
      product_id: adjustment.productId,
      variant_id: adjustment.variantId || null,
      delta: adjustment.delta,
      reason: adjustment.reason,
      note: adjustment.note || null,
      occurred_at: adjustment.occurredAt,
    }),
  );
  const keyHash = sha256(
    `cashier-adjust:${input.context.merchant_id}:${identity.operationId}:${adjustment.movementId}`,
  );

  const result = await withMerchantOperationalTransaction(
    input.context.merchant_id,
    async (client) => {
      await client.query(
        "SELECT pg_advisory_xact_lock(hashtextextended($1, 0))",
        [
          `cashier-device:${input.context.merchant_id}:${input.context.device_id}`,
        ],
      );

      const existing = await operationalQueryRows<{
        id: string;
        location_id: string;
        product_id: string;
        variant_id: string | null;
        request_hash: string;
      }>(
        client,
        `SELECT id, location_id, product_id, variant_id, request_hash
           FROM location_inventory_mutations
          WHERE merchant_id = $1
            AND operation_id = $2
            AND reason_code = 'cashier_inventory_adjustment_sync'
          LIMIT 2
          FOR UPDATE`,
        [input.context.merchant_id, identity.operationId],
      );
      if (existing.length > 1) {
        throw new CashierSyncError(
          "CASHIER_OPERATOR_ADJUSTMENT_STATE_INVALID",
          "inventory adjustment operation evidence is duplicated",
          500,
        );
      }
      if (existing[0]) {
        const same =
          existing[0].location_id === input.context.location_id &&
          existing[0].product_id === adjustment.productId &&
          (existing[0].variant_id || undefined) === adjustment.variantId &&
          existing[0].request_hash === requestHash;
        if (!same) {
          throw new CashierSyncError(
            "CASHIER_SYNC_IDEMPOTENCY_CONFLICT",
            "inventory adjustment operation id was already used with different content",
            409,
          );
        }
        await recordAttribution(client, {
          context: input.context,
          identity,
          kind: "inventory_adjustment",
        });
        return {
          operation_id: identity.operationId,
          device_sequence: identity.deviceSequence,
          replayed: true,
          inventory_mutation_count: 0,
          accepted_entity_ids: [adjustment.movementId],
        };
      }

      let mutation;
      try {
        mutation = await mutateCashierLocationInventoryInTransaction(client, {
          merchantId: input.context.merchant_id,
          locationId: input.context.location_id,
          productId: adjustment.productId,
          ...(adjustment.variantId
            ? { variantId: adjustment.variantId }
            : {}),
          delta: adjustment.delta,
        });
      } catch (error) {
        if (error instanceof CashierLocationInventoryError) {
          throw new CashierSyncError(
            error.code,
            error.message,
            error.status,
            error.details,
          );
        }
        throw error;
      }
      if (!mutation.tracked) {
        throw new CashierSyncError(
          "CASHIER_INVENTORY_NOT_TRACKED",
          "this catalog item does not track inventory",
          409,
          { product_id: adjustment.productId },
        );
      }

      await client.query(
        `INSERT INTO location_inventory_mutations (
           id, merchant_id, location_id, product_id, variant_id, mutation_type,
           before_on_hand_quantity, after_on_hand_quantity,
           before_reserved_quantity, after_reserved_quantity,
           expected_version, resulting_version, actor_type, actor_account_id,
           operation_id, reason_code, idempotency_key_hash, request_hash,
           occurred_at, created_at
         ) VALUES (
           $1,$2,$3,$4,$5,'adjust',$6,$7,$8,$9,$10,$11,
           'cashier_operator',NULL,$12,'cashier_inventory_adjustment_sync',
           $13,$14,$15,now()
         )`,
        [
          `cashier_loc_adj_${keyHash.slice(0, 37)}`,
          input.context.merchant_id,
          input.context.location_id,
          adjustment.productId,
          adjustment.variantId || null,
          mutation.before_on_hand_quantity,
          mutation.after_on_hand_quantity,
          mutation.before_reserved_quantity,
          mutation.after_reserved_quantity,
          mutation.location_expected_version,
          mutation.location_resulting_version,
          identity.operationId,
          keyHash,
          requestHash,
          new Date(adjustment.occurredAt),
        ],
      );
      await client.query(
        `INSERT INTO inventory_mutations (
           id, merchant_id, product_id, variant_id, mutation_type,
           before_quantity, after_quantity, expected_version, resulting_version,
           actor_type, actor_account_id, reason_code, idempotency_key_hash,
           request_hash, created_at
         ) VALUES (
           $1,$2,$3,$4,'adjust',$5,$6,$7,$8,'merchant',$2,
           'cashier_inventory_adjustment_sync',$9,$10,$11
         )`,
        [
          `cashier_adj_${keyHash.slice(0, 40)}`,
          input.context.merchant_id,
          adjustment.productId,
          adjustment.variantId || null,
          mutation.legacy_before_quantity,
          mutation.legacy_after_quantity,
          mutation.product_expected_version,
          mutation.product_resulting_version,
          keyHash,
          requestHash,
          new Date(adjustment.occurredAt),
        ],
      );
      await recordAttribution(client, {
        context: input.context,
        identity,
        kind: "inventory_adjustment",
      });

      return {
        operation_id: identity.operationId,
        device_sequence: identity.deviceSequence,
        replayed: false,
        inventory_mutation_count: 1,
        accepted_entity_ids: [adjustment.movementId],
      };
    },
  );
  return result;
}

export async function syncCashierOperatorSaleAuthoritative(input: {
  context: CashierOperatorContext;
  body: unknown;
}) {
  const identity = cashierOperatorBundleIdentity(input.body, "sale");
  assertOperatorIdentity(input.context, identity);
  const verifiedBody = prepareOperatorSaleBody(input.context, input.body);
  const result = await syncCashierSaleAuthoritative({
    merchantId: input.context.merchant_id,
    locationId: input.context.location_id,
    body: verifiedBody,
  });
  // Attribution is deliberately idempotent and repairable. If this write fails
  // after the core sale transaction commits, the client receives no success and
  // keeps its outbox. A retry replays the sale and repairs the missing attribution.
  await persistOperatorAttribution({
    context: input.context,
    identity,
    saleId: result.order_id,
    kind: "sale",
  });
  return result;
}

export async function syncCashierOperatorCompensationAuthoritative(input: {
  context: CashierOperatorContext;
  body: unknown;
  kind: "return" | "void";
}) {
  const identity = cashierOperatorBundleIdentity(input.body, input.kind);
  assertOperatorIdentity(input.context, identity);
  const result = await syncCashierCompensationAuthoritative({
    merchantId: input.context.merchant_id,
    locationId: input.context.location_id,
    body: input.body,
  });
  if (result.compensation_kind !== input.kind) {
    throw new CashierSyncError(
      "CASHIER_OPERATOR_SYNC_KIND_MISMATCH",
      "cashier compensation kind does not match authorized endpoint",
      403,
    );
  }
  await persistOperatorAttribution({
    context: input.context,
    identity,
    saleId: result.order_id,
    kind: input.kind,
  });
  return result;
}
