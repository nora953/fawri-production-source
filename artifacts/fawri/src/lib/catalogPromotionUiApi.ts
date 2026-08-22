import { createStrongIdempotencyKey } from '@/lib/catalogUiApi';

export type CatalogPromotionScope = 'catalog_item' | 'delivery';
export type CatalogPromotionEffect =
  | 'percentage_off'
  | 'fixed_amount_off'
  | 'fixed_price'
  | 'free_delivery';
export type CatalogPromotionLifecycle =
  | 'disabled'
  | 'scheduled'
  | 'active'
  | 'expired';

export type CatalogPromotion = {
  id: string;
  merchant_id: string;
  name: string;
  scope: CatalogPromotionScope;
  effect: CatalogPromotionEffect;
  product_id?: string;
  variant_id?: string;
  percentage_bps?: number;
  amount_minor?: number;
  currency_code: string;
  minimum_subtotal_minor?: number;
  starts_at: string;
  ends_at: string;
  schedule_timezone: string;
  starts_local: string;
  ends_local: string;
  priority: number;
  enabled: boolean;
  version: number;
  lifecycle: CatalogPromotionLifecycle;
};

export type CatalogPromotionInput = {
  name: string;
  scope: CatalogPromotionScope;
  effect: CatalogPromotionEffect;
  product_id?: string;
  variant_id?: string;
  percentage_bps?: number | null;
  amount_minor?: number | null;
  minimum_subtotal_minor?: number | null;
  starts_local: string;
  ends_local: string;
  priority?: number;
  enabled?: boolean;
};

export class CatalogPromotionApiError extends Error {
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
    this.name = 'CatalogPromotionApiError';
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

type CatalogPromotionFetch = (
  input: RequestInfo | URL,
  init?: RequestInit,
) => Promise<Response>;

function objectRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

async function request<T extends Record<string, unknown>>(
  path: string,
  init: RequestInit = {},
  fetcher: CatalogPromotionFetch = globalThis.fetch.bind(globalThis),
): Promise<T> {
  let response: Response;
  try {
    response = await fetcher(path, {
      credentials: 'include',
      ...init,
      headers: {
        ...(init.body ? { 'Content-Type': 'application/json' } : {}),
        ...(init.headers || {}),
      },
    });
  } catch {
    throw new CatalogPromotionApiError(
      'CATALOG_PROMOTION_NETWORK_ERROR',
      'Could not reach the promotion service',
      0,
    );
  }

  let payload: Record<string, unknown> = {};
  try {
    payload = objectRecord(await response.json());
  } catch {
    payload = {};
  }
  if (!response.ok || payload.ok !== true) {
    const code = String(payload.code || 'CATALOG_PROMOTION_REQUEST_FAILED');
    const message = String(payload.error || 'Promotion request failed');
    const { ok: _ok, code: _code, error: _error, ...details } = payload;
    throw new CatalogPromotionApiError(code, message, response.status, details);
  }
  return payload as T;
}

export async function listCatalogPromotions(
  fetcher?: CatalogPromotionFetch,
): Promise<CatalogPromotion[]> {
  const response = await request<{
    ok: true;
    promotions: CatalogPromotion[];
  }>('/api/catalog/promotions', {}, fetcher);
  return Array.isArray(response.promotions) ? response.promotions : [];
}

export async function createCatalogPromotion(
  promotion: CatalogPromotionInput,
  idempotencyKey = createStrongIdempotencyKey('catalog-promotion-create'),
  fetcher?: CatalogPromotionFetch,
): Promise<{ promotion: CatalogPromotion; replayed: boolean }> {
  const response = await request<{
    ok: true;
    promotion: CatalogPromotion;
    replayed?: boolean;
  }>(
    '/api/catalog/promotions',
    {
      method: 'POST',
      headers: { 'Idempotency-Key': idempotencyKey },
      body: JSON.stringify({ promotion }),
    },
    fetcher,
  );
  return { promotion: response.promotion, replayed: response.replayed === true };
}

export async function updateCatalogPromotion(
  promotionId: string,
  expectedVersion: number,
  promotion: Partial<CatalogPromotionInput>,
  fetcher?: CatalogPromotionFetch,
): Promise<CatalogPromotion> {
  const response = await request<{
    ok: true;
    promotion: CatalogPromotion;
  }>(
    `/api/catalog/promotions/${encodeURIComponent(promotionId)}`,
    {
      method: 'PATCH',
      body: JSON.stringify({ expected_version: expectedVersion, promotion }),
    },
    fetcher,
  );
  return response.promotion;
}

export async function deleteCatalogPromotion(
  promotionId: string,
  expectedVersion: number,
  fetcher?: CatalogPromotionFetch,
): Promise<void> {
  await request<{ ok: true }>(
    `/api/catalog/promotions/${encodeURIComponent(promotionId)}?expected_version=${encodeURIComponent(String(expectedVersion))}`,
    { method: 'DELETE' },
    fetcher,
  );
}
