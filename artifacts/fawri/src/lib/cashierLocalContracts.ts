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
  quantity: number;
  base_unit_price_minor: number;
  effective_unit_price_minor: number;
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
  discount_minor: number;
  total_minor: number;
  payment_method: CashierPaymentMethod;
  payment_status: CashierPaymentStatus;
  payment_provider?: string;
  payment_reference?: string;
  note?: string;
  occurred_at: string;
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
  effective_unit_price_minor: number;
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

/**
 * Provider-neutral contract. Implementations may use IndexedDB, SQLite, or a
 * future durable local provider, but callers must not depend on provider details.
 *
 * `commitSale` must be atomic across the sale snapshot, inventory movements,
 * inventory projection, and sync outbox append.
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
