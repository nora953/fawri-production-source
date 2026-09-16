export type MerchantRegionalContext = {
  country_code: string;
  timezone: string;
  currency_code: string;
  currency_fraction_digits: number;
};

export class MerchantRegionalApiError extends Error {
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
    this.name = 'MerchantRegionalApiError';
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

type RegionalFetch = (
  input: RequestInfo | URL,
  init?: RequestInit,
) => Promise<Response>;

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

async function request(
  init: RequestInit = {},
  fetcher: RegionalFetch = globalThis.fetch.bind(globalThis),
): Promise<Record<string, unknown>> {
  let response: Response;
  try {
    response = await fetcher('/api/merchant/regional', {
      credentials: 'include',
      ...init,
      headers: {
        ...(init.body ? { 'Content-Type': 'application/json' } : {}),
        ...(init.headers || {}),
      },
    });
  } catch {
    throw new MerchantRegionalApiError(
      'MERCHANT_REGIONAL_NETWORK_ERROR',
      'Could not reach the merchant regional service',
      0,
    );
  }

  let payload: Record<string, unknown> = {};
  try {
    payload = record(await response.json());
  } catch {
    payload = {};
  }
  if (!response.ok || payload.ok !== true) {
    const { ok: _ok, code: _code, error: _error, ...details } = payload;
    throw new MerchantRegionalApiError(
      String(payload.code || 'MERCHANT_REGIONAL_REQUEST_FAILED'),
      String(payload.error || 'Merchant regional request failed'),
      response.status,
      details,
    );
  }
  return payload;
}

export async function getMerchantRegionalContext(
  fetcher?: RegionalFetch,
): Promise<MerchantRegionalContext> {
  const payload = await request({}, fetcher);
  return payload.context as MerchantRegionalContext;
}

export async function updateMerchantCurrency(
  currencyCode: string,
  fetcher?: RegionalFetch,
): Promise<{ context: MerchantRegionalContext; changed: boolean }> {
  const payload = await request(
    {
      method: 'PATCH',
      body: JSON.stringify({ currency_code: currencyCode }),
    },
    fetcher,
  );
  return {
    context: payload.context as MerchantRegionalContext,
    changed: payload.changed === true,
  };
}
