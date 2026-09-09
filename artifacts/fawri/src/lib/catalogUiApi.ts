import type { ProductStatus } from '@/lib/types';

export type CatalogItemType = 'product' | 'service';
export type CatalogServicePriceType = 'fixed' | 'from' | 'free' | 'custom';
export type CatalogServiceLocationMode = 'merchant' | 'customer' | 'online' | 'flexible';

export type CatalogServiceDetails = {
  duration_minutes?: number;
  buffer_minutes: number;
  booking_required: boolean;
  price_type: CatalogServicePriceType;
  location_mode: CatalogServiceLocationMode;
};

export type CatalogImageReference = {
  id?: string;
  url?: string;
  storage_key?: string;
  alt?: string;
};

export type CatalogImageInput = string | CatalogImageReference;

export type CatalogPhysicalMeasurementInput = {
  weight_g?: number | null;
  length_mm?: number | null;
  width_mm?: number | null;
  height_mm?: number | null;
};

export type CatalogVariant = {
  id: string;
  name: string;
  sku?: string;
  barcode?: string;
  price_iqd?: number;
  /** Merchant-private cost used only for cashier profit reporting. */
  cost_iqd?: number;
  stock_quantity: number;
  weight_g?: number;
  length_mm?: number;
  width_mm?: number;
  height_mm?: number;
  options: Record<string, string>;
  image_refs: CatalogImageReference[];
  created_at?: string;
  updated_at?: string;
};

export type CatalogVariantInput = CatalogPhysicalMeasurementInput & {
  id?: string;
  name?: string;
  sku?: string;
  barcode?: string;
  price_iqd?: number | null;
  cost_iqd?: number | null;
  stock_quantity?: number;
  quantity?: number;
  options?: Record<string, string>;
  image_refs?: CatalogImageInput[];
};

export type CatalogProduct = {
  id: string;
  merchant_id: string;
  external_ref?: string;
  item_type: CatalogItemType;
  track_inventory: boolean;
  service_details?: CatalogServiceDetails;
  name: string;
  description?: string;
  category?: string;
  sku?: string;
  barcode?: string;
  price_iqd: number;
  /** Merchant-private cost used only for cashier profit reporting. */
  cost_iqd?: number;
  compare_at_price_iqd?: number;
  stock_quantity: number;
  low_stock_threshold: number;
  weight_g?: number;
  length_mm?: number;
  width_mm?: number;
  height_mm?: number;
  status: ProductStatus;
  allow_fawri_reply: boolean;
  image_refs: CatalogImageReference[];
  variants: CatalogVariant[];
  created_at: string;
  updated_at: string;
  version: number;
};

export type CatalogProductInput = CatalogPhysicalMeasurementInput & {
  external_ref?: string;
  item_type?: CatalogItemType;
  track_inventory?: boolean;
  service_details?: Partial<CatalogServiceDetails>;
  name: string;
  description?: string;
  category?: string;
  sku?: string;
  barcode?: string;
  price_iqd: number;
  cost_iqd?: number | null;
  compare_at_price_iqd?: number | null;
  stock_quantity?: number;
  low_stock_threshold?: number;
  status: ProductStatus;
  allow_fawri_reply: boolean;
  image_refs?: CatalogImageInput[];
  variants?: CatalogVariantInput[];
};

export type CatalogInventorySetInput = {
  productId: string;
  expectedVersion: number;
  quantity: number;
  variantId?: string;
};

export type CatalogInventoryAdjustInput = {
  productId: string;
  expectedVersion: number;
  delta: number;
  variantId?: string;
  reason?: string;
};

export type CatalogIdempotencyAttempt = {
  key: string;
  request_signature: string;
};

export type CatalogFetch = (
  input: RequestInfo | URL,
  init?: RequestInit,
) => Promise<Response>;

export class CatalogApiError extends Error {
  readonly code: string;
  readonly status: number;
  readonly details: Record<string, unknown>;

  constructor(
    code: string,
    message: string,
    status: number,
    details: Record<string, unknown> = {},
  ) {
    super(message);
    this.name = 'CatalogApiError';
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

function objectRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function stableValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stableValue);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, item]) => [key, stableValue(item)]),
    );
  }
  return value;
}

function requestSignature(value: unknown): string {
  return JSON.stringify(stableValue(value));
}

export function createStrongIdempotencyKey(scope: string): string {
  const cryptoObject = globalThis.crypto;
  if (!cryptoObject) {
    throw new Error('Secure browser crypto is required for catalog writes');
  }

  if (typeof cryptoObject.randomUUID === 'function') {
    return `${scope}-${cryptoObject.randomUUID()}`;
  }

  if (typeof cryptoObject.getRandomValues !== 'function') {
    throw new Error('Secure browser crypto is required for catalog writes');
  }

  const bytes = new Uint8Array(16);
  cryptoObject.getRandomValues(bytes);
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = [...bytes].map(byte => byte.toString(16).padStart(2, '0'));
  const uuid = `${hex.slice(0, 4).join('')}-${hex.slice(4, 6).join('')}-${hex.slice(6, 8).join('')}-${hex.slice(8, 10).join('')}-${hex.slice(10).join('')}`;
  return `${scope}-${uuid}`;
}

export function idempotencyAttemptForRequest(
  previous: CatalogIdempotencyAttempt | null,
  scope: string,
  request: unknown,
): CatalogIdempotencyAttempt {
  const signature = requestSignature(request);
  if (previous?.request_signature === signature) return previous;
  return {
    key: createStrongIdempotencyKey(scope),
    request_signature: signature,
  };
}

async function requestCatalog<T extends Record<string, unknown>>(
  path: string,
  init: RequestInit = {},
  fetcher: CatalogFetch = globalThis.fetch.bind(globalThis),
): Promise<T> {
  let response: Response;
  try {
    response = await fetcher(path, init);
  } catch (cause) {
    throw new CatalogApiError(
      'CATALOG_NETWORK_FAILED',
      'catalog request failed',
      0,
      { cause },
    );
  }

  const parsed = await response.json().catch(() => null);
  const data = objectRecord(parsed);
  if (!response.ok || data.ok !== true) {
    throw new CatalogApiError(
      typeof data.code === 'string' ? data.code : 'CATALOG_REQUEST_FAILED',
      typeof data.error === 'string' ? data.error : 'catalog request failed',
      response.status,
      data,
    );
  }
  return data as T;
}

function catalogHeaders(extra?: Record<string, string>): HeadersInit {
  return {
    'Content-Type': 'application/json',
    ...extra,
  };
}

export async function listCatalogProducts(
  fetcher?: CatalogFetch,
): Promise<CatalogProduct[]> {
  const data = await requestCatalog<{
    ok: true;
    products: CatalogProduct[];
  }>('/api/catalog/products', {}, fetcher);
  return Array.isArray(data.products) ? data.products : [];
}

export async function getCatalogProduct(
  productId: string,
  fetcher?: CatalogFetch,
): Promise<CatalogProduct> {
  const data = await requestCatalog<{
    ok: true;
    product: CatalogProduct;
  }>(`/api/catalog/products/${encodeURIComponent(productId)}`, {}, fetcher);
  return data.product;
}

export async function createCatalogProduct(
  input: CatalogProductInput,
  idempotencyKey: string,
  fetcher?: CatalogFetch,
): Promise<CatalogProduct> {
  const data = await requestCatalog<{
    ok: true;
    replayed: boolean;
    product: CatalogProduct;
  }>(
    '/api/catalog/products',
    {
      method: 'POST',
      headers: catalogHeaders({ 'Idempotency-Key': idempotencyKey }),
      body: JSON.stringify(input),
    },
    fetcher,
  );
  return data.product;
}

export async function updateCatalogProduct(
  productId: string,
  expectedVersion: number,
  input: CatalogProductInput,
  fetcher?: CatalogFetch,
): Promise<CatalogProduct> {
  const data = await requestCatalog<{
    ok: true;
    product: CatalogProduct;
  }>(
    `/api/catalog/products/${encodeURIComponent(productId)}`,
    {
      method: 'PATCH',
      headers: catalogHeaders(),
      body: JSON.stringify({ ...input, expected_version: expectedVersion }),
    },
    fetcher,
  );
  return data.product;
}

export async function deleteCatalogProduct(
  productId: string,
  expectedVersion: number,
  fetcher?: CatalogFetch,
): Promise<void> {
  await requestCatalog<{
    ok: true;
    deleted_product_id: string;
    deleted_version: number;
  }>(
    `/api/catalog/products/${encodeURIComponent(productId)}`,
    {
      method: 'DELETE',
      headers: catalogHeaders(),
      body: JSON.stringify({ expected_version: expectedVersion }),
    },
    fetcher,
  );
}

export async function importCatalogProducts(
  products: CatalogProductInput[],
  idempotencyKey: string,
  fetcher?: CatalogFetch,
): Promise<CatalogProduct[]> {
  const data = await requestCatalog<{
    ok: true;
    replayed: boolean;
    created_count: number;
    products: CatalogProduct[];
  }>(
    '/api/catalog/products/import',
    {
      method: 'POST',
      headers: catalogHeaders({ 'Idempotency-Key': idempotencyKey }),
      body: JSON.stringify({ products }),
    },
    fetcher,
  );
  return Array.isArray(data.products) ? data.products : [];
}

export async function setCatalogInventory(
  input: CatalogInventorySetInput,
  fetcher?: CatalogFetch,
): Promise<CatalogProduct> {
  const data = await requestCatalog<{
    ok: true;
    product: CatalogProduct;
  }>(
    `/api/inventory/products/${encodeURIComponent(input.productId)}/set`,
    {
      method: 'POST',
      headers: catalogHeaders(),
      body: JSON.stringify({
        expected_version: input.expectedVersion,
        quantity: input.quantity,
        ...(input.variantId ? { variant_id: input.variantId } : {}),
      }),
    },
    fetcher,
  );
  return data.product;
}

export async function adjustCatalogInventory(
  input: CatalogInventoryAdjustInput,
  idempotencyKey: string,
  fetcher?: CatalogFetch,
): Promise<CatalogProduct> {
  const data = await requestCatalog<{
    ok: true;
    replayed: boolean;
    product: CatalogProduct;
  }>(
    `/api/inventory/products/${encodeURIComponent(input.productId)}/adjust`,
    {
      method: 'POST',
      headers: catalogHeaders({ 'Idempotency-Key': idempotencyKey }),
      body: JSON.stringify({
        expected_version: input.expectedVersion,
        delta: input.delta,
        ...(input.variantId ? { variant_id: input.variantId } : {}),
        ...(input.reason ? { reason: input.reason } : {}),
      }),
    },
    fetcher,
  );
  return data.product;
}

export function currentProductFromConflict(error: unknown): CatalogProduct | null {
  if (!(error instanceof CatalogApiError) || error.code !== 'CATALOG_VERSION_CONFLICT') {
    return null;
  }
  const current = error.details.current_product;
  return current && typeof current === 'object' && !Array.isArray(current)
    ? (current as CatalogProduct)
    : null;
}
