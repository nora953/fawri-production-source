import assert from 'node:assert/strict';
import test from 'node:test';

import {
  catalogCurrencyStep,
  catalogMajorAmountToMinor,
  catalogMinorAmountToMajor,
  createCatalogPromotion,
  getCatalogCommerceContext,
  updateCatalogPromotion,
} from '../src/lib/catalogPromotionUiApi';

test('promotion money helpers convert IQD, USD, KWD, and localized digits exactly', () => {
  assert.equal(catalogMajorAmountToMinor('15000', 0), 15000);
  assert.equal(catalogMajorAmountToMinor('15000.5', 0), null);

  assert.equal(catalogMajorAmountToMinor('10.50', 2), 1050);
  assert.equal(catalogMajorAmountToMinor('١٠٫٥٠', 2), 1050);
  assert.equal(catalogMajorAmountToMinor('10.505', 2), null);

  assert.equal(catalogMajorAmountToMinor('1.234', 3), 1234);
  assert.equal(catalogMinorAmountToMajor(1234, 3), '1.234');
  assert.equal(catalogMinorAmountToMajor(1050, 2), '10.50');
  assert.equal(catalogMinorAmountToMajor(15000, 0), '15000');

  assert.equal(catalogCurrencyStep(0), '1');
  assert.equal(catalogCurrencyStep(2), '0.01');
  assert.equal(catalogCurrencyStep(3), '0.001');
});

test('promotion money helpers reject unsafe or malformed values instead of rounding', () => {
  assert.equal(catalogMajorAmountToMinor('-1', 2), null);
  assert.equal(catalogMajorAmountToMinor('1e3', 2), null);
  assert.equal(catalogMajorAmountToMinor('1,000.00', 2), null);
  assert.equal(catalogMajorAmountToMinor('', 2), null);
  assert.equal(catalogMajorAmountToMinor('1.00', 7), null);
  assert.equal(catalogMinorAmountToMajor(Number.MAX_SAFE_INTEGER + 1, 2), '');
});

test('catalog commerce context is loaded from the secure server authority', async () => {
  const calls: Array<{ input: RequestInfo | URL; init?: RequestInit }> = [];
  const fetcher = async (input: RequestInfo | URL, init?: RequestInit) => {
    calls.push({ input, init });
    return new Response(
      JSON.stringify({
        ok: true,
        context: {
          country_code: 'US',
          timezone: 'America/New_York',
          currency_code: 'USD',
          currency_fraction_digits: 2,
        },
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    );
  };

  const context = await getCatalogCommerceContext(fetcher);
  assert.deepEqual(context, {
    country_code: 'US',
    timezone: 'America/New_York',
    currency_code: 'USD',
    currency_fraction_digits: 2,
  });
  assert.equal(calls.length, 1);
  assert.equal(String(calls[0].input), '/api/catalog/context');
  assert.equal(calls[0].init?.credentials, 'include');
});

test('promotion create sends exact minor-unit values and a stable idempotency key', async () => {
  const calls: Array<{ input: RequestInfo | URL; init?: RequestInit }> = [];
  const fetcher = async (input: RequestInfo | URL, init?: RequestInit) => {
    calls.push({ input, init });
    return new Response(
      JSON.stringify({
        ok: true,
        replayed: false,
        promotion: {
          id: 'promo-1',
          merchant_id: 'merchant-1',
          name: 'USD offer',
          scope: 'catalog_item',
          effect: 'fixed_amount_off',
          product_id: 'product-1',
          amount_minor: 1050,
          currency_code: 'USD',
          starts_at: '2026-09-01T13:00:00.000Z',
          ends_at: '2026-09-01T14:00:00.000Z',
          schedule_timezone: 'America/New_York',
          starts_local: '2026-09-01T09:00',
          ends_local: '2026-09-01T10:00',
          priority: 0,
          enabled: true,
          version: 1,
          lifecycle: 'scheduled',
        },
      }),
      { status: 201, headers: { 'Content-Type': 'application/json' } },
    );
  };

  const amountMinor = catalogMajorAmountToMinor('10.50', 2);
  assert.equal(amountMinor, 1050);
  await createCatalogPromotion(
    {
      name: 'USD offer',
      scope: 'catalog_item',
      effect: 'fixed_amount_off',
      product_id: 'product-1',
      amount_minor: amountMinor,
      starts_local: '2026-09-01T09:00',
      ends_local: '2026-09-01T10:00',
      enabled: true,
    },
    'promotion-test-idempotency-key',
    fetcher,
  );

  assert.equal(calls.length, 1);
  assert.equal(String(calls[0].input), '/api/catalog/promotions');
  assert.equal(calls[0].init?.method, 'POST');
  const headers = calls[0].init?.headers as Record<string, string>;
  assert.equal(headers['Idempotency-Key'], 'promotion-test-idempotency-key');
  const body = JSON.parse(String(calls[0].init?.body));
  assert.equal(body.promotion.amount_minor, 1050);
  assert.equal(body.promotion.currency_code, undefined);
  assert.equal(body.promotion.schedule_timezone, undefined);
  assert.equal(body.promotion.starts_at, undefined);
  assert.equal(body.promotion.ends_at, undefined);
});

test('promotion update serializes explicit undefined targets as null so old targeting is cleared', async () => {
  const calls: Array<{ input: RequestInfo | URL; init?: RequestInit }> = [];
  const fetcher = async (input: RequestInfo | URL, init?: RequestInit) => {
    calls.push({ input, init });
    return new Response(
      JSON.stringify({
        ok: true,
        promotion: {
          id: 'promo-variant',
          merchant_id: 'merchant-1',
          name: 'Whole product offer',
          scope: 'catalog_item',
          effect: 'percentage_off',
          product_id: 'product-1',
          percentage_bps: 1000,
          currency_code: 'IQD',
          starts_at: '2026-09-01T06:00:00.000Z',
          ends_at: '2026-09-02T06:00:00.000Z',
          schedule_timezone: 'Asia/Baghdad',
          starts_local: '2026-09-01T09:00',
          ends_local: '2026-09-02T09:00',
          priority: 0,
          enabled: true,
          version: 2,
          lifecycle: 'scheduled',
        },
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    );
  };

  await updateCatalogPromotion(
    'promo-variant',
    1,
    {
      name: 'Whole product offer',
      scope: 'catalog_item',
      effect: 'percentage_off',
      product_id: 'product-1',
      variant_id: undefined,
      percentage_bps: 1000,
      amount_minor: null,
      minimum_subtotal_minor: null,
      starts_local: '2026-09-01T09:00',
      ends_local: '2026-09-02T09:00',
      priority: 0,
      enabled: true,
    },
    fetcher,
  );

  assert.equal(calls.length, 1);
  const body = JSON.parse(String(calls[0].init?.body));
  assert.equal(body.expected_version, 1);
  assert.equal(body.promotion.variant_id, null);
  assert.equal(body.promotion.amount_minor, null);
  assert.equal(body.promotion.minimum_subtotal_minor, null);
});
