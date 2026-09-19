import crypto from "node:crypto";
import {
  issueCashierCostEvidence,
  resolveCashierCostEvidence,
} from "./cashierCostEvidence";
import {
  getMerchantCommerceContextAuthoritative,
} from "./postgresMerchantRegionalAuthority";
import { listCatalogProductsAuthoritative } from "./postgresCatalogAuthority";
import { projectCashierCatalogProductsToLocation } from "./cashierLocationCatalogProjection";
import { listLocationInventoryLevelsAuthoritative } from "./postgresLocationInventoryAuthority";
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

export type CashierOperatorOperationKind = "sale" | "return" | "void";

type BundleIdentity = {
  cloudMerchantId: string;
  deviceId: string;
  operationId: string;
  deviceSequence: number;
  occurredAt: string;
};

type AttributionRow = {
  operation_id: string;
  sale_id: string;
  operation_kind: string;
  station_id: string;
  location_id: string | null;
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
  const [commerceContext, products, promotions, locationInventory] =
    await Promise.all([
      getMerchantCommerceContextAuthoritative(context.merchant_id),
      listCatalogProductsAuthoritative(context.merchant_id),
      listCommercePromotionsAuthoritative(context.merchant_id),
      listLocationInventoryLevelsAuthoritative({
        merchantId: context.merchant_id,
        locationId: context.location_id,
      }),
    ]);
  const locationProducts = projectCashierCatalogProductsToLocation(
    products,
    locationInventory,
  );
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
    products: locationProducts.map((product) =>
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
    saleId: string;
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
      saleId,
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
    row.sale_id === saleId &&
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
  saleId: string;
  kind: CashierOperatorOperationKind;
}): Promise<void> {
  await withMerchantOperationalTransaction(input.context.merchant_id, (client) =>
    recordAttribution(client, input),
  );
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
