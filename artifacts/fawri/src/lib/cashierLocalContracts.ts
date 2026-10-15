export const CASHIER_LOCAL_SCHEMA_VERSION = 1 as const;

export type CashierLocalAccess = 'available' | 'locked';
export type CashierCloudEntitlement = 'active' | 'inactive' | 'unknown';
export type CashierConnectivity = 'online' | 'offline';

export type CashierRuntimeState = {
  local_access: CashierLocalAccess;
  cloud_entitlement: CashierCloudEntitlement;
  connectivity: CashierConnectivity;
};

export type CashierCapabilityPolicy = {
  local_catalog_read: boolean;
  local_catalog_write: boolean;
  local_sale: boolean;
  local_inventory: boolean;
  local_history: boolean;
  local_outbox_write: boolean;
  cloud_sync: boolean;
  cloud_ai: boolean;
  cloud_channels: boolean;
  cloud_backup: boolean;
};

/**
 * Local cashier capability is intentionally independent from cloud subscription.
 * Cloud features fail closed unless entitlement is confirmed active and the
 * device is online.
 */
export function resolveCashierCapabilityPolicy(
  state: CashierRuntimeState,
): CashierCapabilityPolicy {
  const localEnabled = state.local_access === 'available';
  const cloudEnabled =
    localEnabled &&
    state.cloud_entitlement === 'active' &&
    state.connectivity === 'online';

  return {
    local_catalog_read: localEnabled,
    local_catalog_write: localEnabled,
    local_sale: localEnabled,
    local_inventory: localEnabled,
    local_history: localEnabled,
    local_outbox_write: localEnabled,
    cloud_sync: cloudEnabled,
    cloud_ai: cloudEnabled,
    cloud_channels: cloudEnabled,
    cloud_backup: cloudEnabled,
  };
}

export type CashierMoneyContext = {
  currency_code: string;
  currency_fraction_digits: number;
};

export type CashierPromotionEffect =
  | 'percentage_off'
  | 'fixed_amount_off'
  | 'fixed_price'
  | 'free_delivery';

export type CashierPromotionSnapshot = {
  promotion_id: string;
  promotion_name: string;
  effect: CashierPromotionEffect;
  promotion_version?: number;
  percentage_bps?: number;
  amount_minor?: number;
};

export type CashierSaleLineSnapshot = {
  line_id: string;
  product_id: string;
  variant_id?: string;
  product_name_snapshot: string;
  variant_name_snapshot?: string;
  sku_snapshot?: string;
  barcode_snapshot?: string;
  catalog_version?: number;
  quantity: number;
  base_unit_price_minor: number;
  effective_unit_price_minor: number;
  /** Legacy owner-only raw cost. Staff cashier cutover never writes this field. */
  unit_cost_minor?: number;
  /** Opaque server-issued evidence. It carries no readable merchant cost. */
  cost_evidence?: string;
  discount_minor: number;
  line_total_minor: number;
  promotion?: CashierPromotionSnapshot;
};

export type CashierPaymentMethod =
  | 'cash'
  | 'card'
  | 'electronic'
  | 'other';

export type CashierPaymentStatus = 'paid' | 'pending' | 'failed';
export type CashierSaleStatus = 'completed' | 'voided';
export type CashierManualDiscountKind = 'amount' | 'percentage';

export type CashierReturnLineSnapshot = {
  original_line_id: string;
  product_id: string;
  variant_id?: string;
  quantity: number;
  effective_unit_price_minor: number;
  refund_minor: number;
};

export type CashierReturnSnapshot = CashierMoneyContext & {
  /** v2 refunds use net sale value after sale-level manual discount allocation. */
  refund_pricing_version?: 2;
  return_id: string;
  operation_id: string;
  sale_id: string;
  local_merchant_id: string;
  cloud_merchant_id?: string;
  device_id: string;
  device_sequence: number;
  lines: CashierReturnLineSnapshot[];
  refund_total_minor: number;
  note?: string;
  occurred_at: string;
};

export type CashierSaleVoidSnapshot = CashierMoneyContext & {
  operation_id: string;
  sale_id: string;
  device_id: string;
  device_sequence: number;
  refund_total_minor: number;
  note?: string;
  occurred_at: string;
};

export type CashierSaleSnapshot = CashierMoneyContext & {
  sale_id: string;
  operation_id: string;
  local_merchant_id: string;
  cloud_merchant_id?: string;
  device_id: string;
  device_sequence: number;
  source: 'cashier';
  status: CashierSaleStatus;
  lines: CashierSaleLineSnapshot[];
  subtotal_minor: number;
  /** Automatic promotion discount resolved from immutable sale lines. */
  promotion_discount_minor?: number;
  /** Manual discount authority type selected by the cashier. */
  manual_discount_kind?: CashierManualDiscountKind;
  /** Merchant-authorized manual discount applied after automatic promotions. */
  manual_discount_minor?: number;
  manual_discount_reason?: string;
  /** Opaque server-issued manager approval bound to this sale operation. */
  manual_discount_override_approval_id?: string;
  /** Total discount = promotion discount + manual discount. */
  discount_minor: number;
  total_minor: number;
  payment_method: CashierPaymentMethod;
  payment_status: CashierPaymentStatus;
  /** Cash received from the customer. Present only for cash sales created after P1. */
  cash_tendered_minor?: number;
  /** Cash change returned to the customer. Present only for cash sales created after P1. */
  change_due_minor?: number;
  payment_provider?: string;
  payment_reference?: string;
  note?: string;
  occurred_at: string;
  /** Append-only compensation evidence; original sale pricing lines never change. */
  returns?: CashierReturnSnapshot[];
  /** Full void metadata. A void is forbidden after any partial/full return. */
  void?: CashierSaleVoidSnapshot;
};

export type CashierInventoryMovementReason =
  | 'sale'
  | 'return'
  | 'restock'
  | 'manual_adjustment'
  | 'sale_void';

export type CashierInventoryMovement = {
  movement_id: string;
  operation_id: string;
  local_merchant_id: string;
  cloud_merchant_id?: string;
  device_id: string;
  device_sequence: number;
  product_id: string;
  variant_id?: string;
  delta: number;
  reason: CashierInventoryMovementReason;
  related_sale_id?: string;
  note?: string;
  occurred_at: string;
};

export type CashierSyncEntityType =
  | 'sale'
  | 'return'
  | 'inventory_movement'
  | 'catalog_item'
  | 'promotion';

export type CashierSyncOperation = 'append' | 'upsert' | 'void';

export type CashierSyncEnvelope<TPayload = unknown> = {
  schema_version: typeof CASHIER_LOCAL_SCHEMA_VERSION;
  operation_id: string;
  device_id: string;
  device_sequence: number;
  entity_type: CashierSyncEntityType;
  entity_id: string;
  operation: CashierSyncOperation;
  occurred_at: string;
  base_version?: number;
  payload: TPayload;
};

export type CashierCatalogLookup = CashierMoneyContext & {
  product_id: string;
  variant_id?: string;
  item_type: 'product' | 'service';
  name: string;
  variant_name?: string;
  sku?: string;
  barcode?: string;
  track_inventory: boolean;
  stock_quantity?: number;
  base_unit_price_minor: number;
  /** Legacy owner-only raw cost. Staff cashier projections must omit it. */
  unit_cost_minor?: number;
  /** Opaque cost evidence copied into immutable sale evidence for offline sync. */
  cost_evidence?: string;
  /**
   * Legacy/display projection only. Sale commit must resolve effective price
   * from base price + the current local promotion snapshot at sale time.
   */
  effective_unit_price_minor?: number;
  /** Legacy/display projection only; immutable sale evidence is captured anew. */
  promotion?: CashierPromotionSnapshot;
  catalog_version: number;
};

export type CashierSaleLineInput = {
  product_id: string;
  variant_id?: string;
  quantity: number;
};

export type CashierCommitSaleInput = {
  operation_id: string;
  payment_method: CashierPaymentMethod;
  payment_status: CashierPaymentStatus;
  /** Required whenever a new manual discount is greater than zero. */
  manual_discount_kind?: CashierManualDiscountKind;
  /** Optional merchant-authorized manual discount applied after promotions. */
  manual_discount_minor?: number;
  /** Required whenever manual_discount_minor is greater than zero. */
  manual_discount_reason?: string;
  /** Opaque manager approval proof when the manual discount exceeds employee authority. */
  manual_discount_override_approval_id?: string;
  /** Required for new cash sales; must be >= the authoritative computed total. */
  cash_tendered_minor?: number;
  /** Required for new cash sales; must equal cash_tendered_minor - computed total. */
  change_due_minor?: number;
  payment_provider?: string;
  payment_reference?: string;
  note?: string;
  lines: CashierSaleLineInput[];
};

export type CashierCommitSaleResult = {
  sale: CashierSaleSnapshot;
  inventory_movements: CashierInventoryMovement[];
  outbox: CashierSyncEnvelope[];
};

export type CashierInventoryAdjustmentInput = {
  operation_id: string;
  product_id: string;
  variant_id?: string;
  delta: number;
  reason: Exclude<CashierInventoryMovementReason, 'sale'>;
  related_sale_id?: string;
  note?: string;
};

export type CashierReturnSaleInput = {
  operation_id: string;
  sale_id: string;
  lines: Array<{
    original_line_id: string;
    quantity: number;
  }>;
  note?: string;
};

export type CashierReturnSaleResult = {
  sale: CashierSaleSnapshot;
  return_snapshot: CashierReturnSnapshot;
  inventory_movements: CashierInventoryMovement[];
  outbox: CashierSyncEnvelope[];
};

export type CashierVoidSaleInput = {
  operation_id: string;
  sale_id: string;
  note?: string;
};

export type CashierVoidSaleResult = {
  sale: CashierSaleSnapshot;
  void_snapshot: CashierSaleVoidSnapshot;
  inventory_movements: CashierInventoryMovement[];
  outbox: CashierSyncEnvelope[];
};

/**
 * Provider-neutral contract. Implementations may use IndexedDB, SQLite, or a
 * future durable local provider, but callers must not depend on provider details.
 *
 * `commitSale` must be atomic across sale-time pricing evidence, the sale
 * snapshot, inventory movements/projection, and sync outbox append.
 */
export interface CashierLocalAuthority {
  lookupByBarcode(barcode: string): Promise<CashierCatalogLookup | null>;
  lookupBySku(sku: string): Promise<CashierCatalogLookup | null>;
  getCatalogItem(
    productId: string,
    variantId?: string,
  ): Promise<CashierCatalogLookup | null>;
  commitSale(input: CashierCommitSaleInput): Promise<CashierCommitSaleResult>;
  adjustInventory(
    input: CashierInventoryAdjustmentInput,
  ): Promise<CashierInventoryMovement>;
  getSale(saleId: string): Promise<CashierSaleSnapshot | null>;
  listSales(limit?: number): Promise<CashierSaleSnapshot[]>;
  listPendingSync(limit?: number): Promise<CashierSyncEnvelope[]>;
  acknowledgeSynced(operationIds: string[]): Promise<void>;
}

/**
 * Compensation is intentionally a separate provider-neutral capability while
 * P1D is validated. Implementations must transact against the same local sale,
 * inventory, and outbox authority as the original sale.
 */
export interface CashierSaleCompensationAuthority {
  returnSale(input: CashierReturnSaleInput): Promise<CashierReturnSaleResult>;
  voidSale(input: CashierVoidSaleInput): Promise<CashierVoidSaleResult>;
}

export function isNonNegativeSafeInteger(value: number): boolean {
  return Number.isSafeInteger(value) && value >= 0;
}

export function isPositiveSafeInteger(value: number): boolean {
  return Number.isSafeInteger(value) && value > 0;
}

export function isValidCashierMoneyContext(
  value: CashierMoneyContext,
): boolean {
  return (
    /^[A-Z]{3}$/.test(value.currency_code) &&
    Number.isInteger(value.currency_fraction_digits) &&
    value.currency_fraction_digits >= 0 &&
    value.currency_fraction_digits <= 6
  );
}
