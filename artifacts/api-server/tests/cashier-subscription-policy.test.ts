import assert from "node:assert/strict";
import test from "node:test";
import {
  CASHIER_DEFAULT_GRACE_SECONDS,
  CASHIER_DEFAULT_SEAT_PRICE_IQD,
  CashierEntitlementError,
  addCashierBillingMonth,
  calculateCashierProrationIqd,
  evaluateCashierEntitlement,
  type CashierSubscriptionRow,
} from "../src/services/cashierEntitlementAuthority";

function subscription(overrides: Partial<CashierSubscriptionRow> = {}): CashierSubscriptionRow {
  return {
    id: "cashier-subscription-1",
    merchant_id: "merchant-1",
    status: "active",
    licensed_seats: 2,
    price_per_seat_iqd: CASHIER_DEFAULT_SEAT_PRICE_IQD,
    billing_period_start: "2026-10-01T00:00:00.000Z",
    billing_period_end: "2026-11-01T00:00:00.000Z",
    grace_duration_seconds: CASHIER_DEFAULT_GRACE_SECONDS,
    scheduled_licensed_seats: null,
    scheduled_change_at: null,
    version: 4,
    ...overrides,
  };
}

test("cashier lifecycle changes from active to exact seven-day grace to restricted", () => {
  assert.equal(
    evaluateCashierEntitlement(
      subscription(),
      new Date("2026-10-31T23:59:59.999Z"),
    )?.state,
    "active",
  );
  const grace = evaluateCashierEntitlement(
    subscription(),
    new Date("2026-11-01T00:00:00.000Z"),
  );
  assert.equal(grace?.state, "grace");
  assert.equal(grace?.grace_until, "2026-11-08T00:00:00.000Z");
  assert.equal(
    evaluateCashierEntitlement(
      subscription(),
      new Date("2026-11-07T23:59:59.999Z"),
    )?.state,
    "grace",
  );
  assert.equal(
    evaluateCashierEntitlement(
      subscription(),
      new Date("2026-11-08T00:00:00.000Z"),
    )?.state,
    "restricted",
  );
});

test("suspended cashier subscription never receives grace authority", () => {
  const value = evaluateCashierEntitlement(
    subscription({ status: "suspended" }),
    new Date("2026-10-15T00:00:00.000Z"),
  );
  assert.equal(value?.state, "suspended");
  assert.equal(value?.grace_until, undefined);
});

test("proration uses actual billing-period duration and whole-IQD half-up rounding", () => {
  const amount = calculateCashierProrationIqd({
    unitPriceIqd: 3900,
    additionalSeats: 1,
    billingPeriodStart: new Date("2026-10-01T00:00:00.000Z"),
    billingPeriodEnd: new Date("2026-11-01T00:00:00.000Z"),
    effectiveAt: new Date("2026-10-10T00:00:00.000Z"),
  });
  assert.equal(amount, 2768);

  const twoSeats = calculateCashierProrationIqd({
    unitPriceIqd: 3900,
    additionalSeats: 2,
    billingPeriodStart: new Date("2026-10-01T00:00:00.000Z"),
    billingPeriodEnd: new Date("2026-11-01T00:00:00.000Z"),
    effectiveAt: new Date("2026-10-10T00:00:00.000Z"),
  });
  assert.equal(twoSeats, 5535);
});

test("proration is calendar-cycle based rather than assuming a 30-day month", () => {
  assert.equal(
    calculateCashierProrationIqd({
      unitPriceIqd: 3900,
      additionalSeats: 1,
      billingPeriodStart: new Date("2026-11-01T00:00:00.000Z"),
      billingPeriodEnd: new Date("2026-12-01T00:00:00.000Z"),
      effectiveAt: new Date("2026-11-15T00:00:00.000Z"),
    }),
    2080,
  );
});

test("calendar-month renewal clamps month-end safely including leap years", () => {
  assert.equal(
    addCashierBillingMonth(new Date("2027-01-31T12:30:00.000Z")).toISOString(),
    "2027-02-28T12:30:00.000Z",
  );
  assert.equal(
    addCashierBillingMonth(new Date("2028-01-31T12:30:00.000Z")).toISOString(),
    "2028-02-29T12:30:00.000Z",
  );
});

test("seat addition cannot be prorated after the authoritative period end", () => {
  assert.throws(
    () =>
      calculateCashierProrationIqd({
        unitPriceIqd: 3900,
        additionalSeats: 1,
        billingPeriodStart: new Date("2026-10-01T00:00:00.000Z"),
        billingPeriodEnd: new Date("2026-11-01T00:00:00.000Z"),
        effectiveAt: new Date("2026-11-01T00:00:00.000Z"),
      }),
    (error: unknown) =>
      error instanceof CashierEntitlementError &&
      error.code === "CASHIER_BILLING_PERIOD_ENDED",
  );
});

test("scheduled downgrade remains visible without reducing paid seats early", () => {
  const value = evaluateCashierEntitlement(
    subscription({
      licensed_seats: 6,
      scheduled_licensed_seats: 3,
      scheduled_change_at: "2026-11-01T00:00:00.000Z",
    }),
    new Date("2026-10-20T00:00:00.000Z"),
  );
  assert.equal(value?.licensed_seats, 6);
  assert.equal(value?.scheduled_licensed_seats, 3);
  assert.equal(value?.scheduled_change_at, "2026-11-01T00:00:00.000Z");
});
