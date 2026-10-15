import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const root = new URL('../', import.meta.url);

async function source(path) {
  return readFile(new URL(path, root), 'utf8');
}

test('cashier return authority writes versioned net refund pricing evidence', async () => {
  const authority = await source('src/lib/cashierCompensationAuthority.ts');

  assert.match(authority, /CASHIER_REFUND_PRICING_VERSION/);
  assert.match(authority, /cashierNetReturnRefundMinor/);
  assert.match(authority, /returnedRefundForLine/);
  assert.match(
    authority,
    /refund_pricing_version:\s*CASHIER_REFUND_PRICING_VERSION/,
  );
  assert.doesNotMatch(
    authority,
    /const refundMinor = safeMultiply\(\s*line\.effective_unit_price_minor,\s*requestLine\.quantity/,
  );
});

test('cashier return preview uses the same remaining-net refund helper', async () => {
  const history = await source('src/pages/CashierHistoryPage.tsx');

  assert.match(history, /cashierNetReturnRefundMinor/);
  assert.match(history, /returnedRefundMinor\(selectedSale, line\.line_id\)/);
  assert.match(history, /Math\.min\(\s*remaining,/);
  assert.doesNotMatch(
    history,
    /return total \+ quantity \* line\.effective_unit_price_minor/i,
  );
});
