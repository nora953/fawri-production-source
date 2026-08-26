import assert from 'node:assert/strict';
import test from 'node:test';
import {
  CashierCostEvidenceError,
  issueCashierCostEvidence,
  resolveCashierCostEvidence,
} from '../src/services/cashierCostEvidence';

const env = {
  NODE_ENV: 'test',
  FAWRI_CASHIER_COST_EVIDENCE_SECRET:
    'test-cashier-cost-evidence-secret-0123456789abcdef',
} as NodeJS.ProcessEnv;

test('cashier cost evidence is opaque and round-trips only for matching catalog identity', () => {
  const token = issueCashierCostEvidence({
    merchantId: 'merchant-1',
    productId: 'product-1',
    variantId: 'variant-1',
    catalogVersion: 9,
    unitCostMinor: 6000,
    now: new Date('2026-08-26T01:00:00.000Z'),
    env,
  });

  assert.match(token, /^cce1\./);
  assert.doesNotMatch(token, /6000|merchant-1|product-1|variant-1/);

  const resolved = resolveCashierCostEvidence({
    token,
    merchantId: 'merchant-1',
    productId: 'product-1',
    variantId: 'variant-1',
    catalogVersion: 9,
    now: new Date('2026-08-27T01:00:00.000Z'),
    env,
  });
  assert.equal(resolved.unit_cost_minor, 6000);
});

test('cashier cost evidence represents missing cost without revealing or inventing zero', () => {
  const token = issueCashierCostEvidence({
    merchantId: 'merchant-1',
    productId: 'product-2',
    catalogVersion: 3,
    now: new Date('2026-08-26T01:00:00.000Z'),
    env,
  });
  const resolved = resolveCashierCostEvidence({
    token,
    merchantId: 'merchant-1',
    productId: 'product-2',
    catalogVersion: 3,
    now: new Date('2026-08-27T01:00:00.000Z'),
    env,
  });
  assert.equal(resolved.unit_cost_minor, null);
});

test('cashier cost evidence rejects tampering, cross-item reuse, and expired evidence', () => {
  const issued = new Date('2026-08-26T01:00:00.000Z');
  const token = issueCashierCostEvidence({
    merchantId: 'merchant-1',
    productId: 'product-1',
    catalogVersion: 5,
    unitCostMinor: 2500,
    now: issued,
    env,
  });

  const tampered = `${token.slice(0, -1)}${token.endsWith('A') ? 'B' : 'A'}`;
  assert.throws(
    () =>
      resolveCashierCostEvidence({
        token: tampered,
        merchantId: 'merchant-1',
        productId: 'product-1',
        catalogVersion: 5,
        now: new Date('2026-08-27T01:00:00.000Z'),
        env,
      }),
    (error: unknown) =>
      error instanceof CashierCostEvidenceError &&
      error.code === 'CASHIER_COST_EVIDENCE_INVALID',
  );

  assert.throws(
    () =>
      resolveCashierCostEvidence({
        token,
        merchantId: 'merchant-1',
        productId: 'product-OTHER',
        catalogVersion: 5,
        now: new Date('2026-08-27T01:00:00.000Z'),
        env,
      }),
    (error: unknown) =>
      error instanceof CashierCostEvidenceError &&
      error.code === 'CASHIER_COST_EVIDENCE_MISMATCH',
  );

  assert.throws(
    () =>
      resolveCashierCostEvidence({
        token,
        merchantId: 'merchant-1',
        productId: 'product-1',
        catalogVersion: 5,
        now: new Date('2027-08-27T01:00:00.000Z'),
        env,
      }),
    (error: unknown) =>
      error instanceof CashierCostEvidenceError &&
      error.code === 'CASHIER_COST_EVIDENCE_EXPIRED',
  );
});

test('production cashier cost evidence fails closed without dedicated secret', () => {
  assert.throws(
    () =>
      issueCashierCostEvidence({
        merchantId: 'merchant-1',
        productId: 'product-1',
        catalogVersion: 1,
        unitCostMinor: 1,
        env: { NODE_ENV: 'production' } as NodeJS.ProcessEnv,
      }),
    (error: unknown) =>
      error instanceof CashierCostEvidenceError &&
      error.code === 'CASHIER_COST_EVIDENCE_SECRET_REQUIRED' &&
      error.status === 503,
  );
});
