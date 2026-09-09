import assert from "node:assert/strict";
import test from "node:test";

import {
  currencyFractionDigits,
  formatMinorCurrencyNumber,
  majorCurrencyStringToMinorUnits,
  minorUnitsToMajorCurrencyString,
} from "../src/services/currencyMoneyRuntime";

test("currency scales follow runtime ISO currency metadata", () => {
  assert.equal(currencyFractionDigits("IQD"), 0);
  assert.equal(currencyFractionDigits("USD"), 2);
  assert.equal(currencyFractionDigits("JPY"), 0);
  assert.equal(currencyFractionDigits("KWD"), 3);
});

test("merchant-facing major amounts convert to exact minor units without floating point", () => {
  assert.equal(majorCurrencyStringToMinorUnits("50000", "IQD"), 50_000);
  assert.equal(majorCurrencyStringToMinorUnits("10.50", "USD"), 1_050);
  assert.equal(majorCurrencyStringToMinorUnits("10.500", "KWD"), 10_500);
  assert.equal(majorCurrencyStringToMinorUnits("١٠٫٥٠", "USD"), 1_050);
});

test("minor units round-trip to stable merchant-facing decimal strings", () => {
  assert.equal(minorUnitsToMajorCurrencyString(50_000, "IQD"), "50000");
  assert.equal(minorUnitsToMajorCurrencyString(1_050, "USD"), "10.50");
  assert.equal(minorUnitsToMajorCurrencyString(10_500, "KWD"), "10.500");
});

test("minor-unit number formatting respects each currency scale", () => {
  assert.equal(formatMinorCurrencyNumber(50_000, "IQD"), "50,000");
  assert.equal(formatMinorCurrencyNumber(1_999, "USD"), "19.99");
  assert.equal(formatMinorCurrencyNumber(1_234, "JOD"), "1.234");
});

test("unsupported fractional precision is rejected instead of rounded", () => {
  assert.throws(
    () => majorCurrencyStringToMinorUnits("10.5", "IQD"),
    (error: unknown) =>
      (error as { code?: string })?.code === "CURRENCY_AMOUNT_PRECISION_INVALID",
  );
  assert.throws(
    () => majorCurrencyStringToMinorUnits("10.999", "USD"),
    (error: unknown) =>
      (error as { code?: string })?.code === "CURRENCY_AMOUNT_PRECISION_INVALID",
  );
});
