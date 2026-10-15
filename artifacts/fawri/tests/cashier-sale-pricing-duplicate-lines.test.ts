import assert from 'node:assert/strict';
import test from 'node:test';

import {
  CashierSalePricingError,
  resolveCashierSalePricing,
} from '../src/lib/cashierSalePricingRuntime.ts';

test('cashier pricing rejects duplicate product/variant lines before sale writes', () => {
  assert.throws(
    () =>
      resolveCashierSalePricing({
        merchantId: 'merchant-cloud',
        catalog: [
          {
            product_id: 'product-1',
            variant_id: 'variant-1',
            product_name: 'Product',
            variant_name: 'Variant',
            currency_code: 'IQD',
            currency_fraction_digits: 0,
            base_unit_price_minor: 10_000,
            catalog_version: 1,
          },
        ],
        promotions: [],
        lines: [
          { product_id: 'product-1', variant_id: 'variant-1', quantity: 4 },
          { product_id: 'product-1', variant_id: 'variant-1', quantity: 4 },
        ],
        at: '2026-08-25T10:00:00.000Z',
      }),
    (error: unknown) => {
      assert.ok(error instanceof CashierSalePricingError);
      assert.equal(error.code, 'CASHIER_SALE_PRICING_DUPLICATE_LINE');
      return true;
    },
  );
});
