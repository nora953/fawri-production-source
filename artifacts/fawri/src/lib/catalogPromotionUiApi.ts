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

export type CatalogCommerceContext = {
  country_code: string;
  timezone: string;
  currency_code: string;
  currency_fraction_digits: number;
};

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

function normalizeDecimalDigits(value: string): string {
  return value
    .normalize('NFKC')
    .replace(/[٠-٩]/g, digit => String('٠١٢٣٤٥٦٧٨٩'.indexOf(digit)))
    .replace(/[۰-۹]/g, digit => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(digit)))
    .replace(/٫/g, '.')
    .replace(/٬/g, '')
    .trim();
}

export function catalogMajorAmountToMinor(
  value: string,
  fractionDigits: number,
): number | null {
  if (!Number.isInteger(fractionDigits) || fractionDigits < 0 || fractionDigits > 6) {
    return null;
  }
  const normalized = normalizeDecimalDigits(value);
  if (!/^\d+(?:\.\d+)?$/.test(normalized)) return null;
  const [wholeRaw, fractionRaw = ''] = normalized.split('.');
  if (fractionRaw.length > fractionDigits) return null;
  if (fractionDigits === 0 && fractionRaw.length > 0) return null;

  try {
    const scale = 10n ** BigInt(fractionDigits);
    const whole = BigInt(wholeRaw);
    const fraction = fractionDigits
      ? BigInt(fractionRaw.padEnd(fractionDigits, '0') || '0')
      : 0n;
    const minor = whole * scale + fraction;
    if (minor > BigInt(Number.MAX_SAFE_INTEGER)) return null;
    return Number(minor);
  } catch {
    return null;
  }
}

export function catalogMinorAmountToMajor(
  value: number,
  fractionDigits: number,
): string {
  if (!Number.isSafeInteger(value) || value < 0) return '';
  if (!Number.isInteger(fractionDigits) || fractionDigits < 0 || fractionDigits > 6) {
    return '';
  }
  if (fractionDigits === 0) return String(value);
  const scale = 10n ** BigInt(fractionDigits);
  const minor = BigInt(value);
  const whole = minor / scale;
  const fraction = (minor % scale).toString().padStart(fractionDigits, '0');
  return `${whole.toString()}.${fraction}`;
}

export function catalogCurrencyStep(fractionDigits: number): string {
  if (!Number.isInteger(fractionDigits) || fractionDigits <= 0) return '1';
  return `0.${'0'.repeat(Math.max(0, fractionDigits - 1))}1`;
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

export async function getCatalogCommerceContext(
  fetcher?: CatalogPromotionFetch,
): Promise<CatalogCommerceContext> {
  const response = await request<{
    ok: true;
    context: CatalogCommerceContext;
  }>('/api/catalog/context', {}, fetcher);
  return response.context;
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
