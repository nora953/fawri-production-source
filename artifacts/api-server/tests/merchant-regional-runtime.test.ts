import assert from "node:assert/strict";
import test from "node:test";

import {
  defaultMerchantRegionalProfileForCountry,
  instantToMerchantLocalDateTime,
  merchantLocalDateTimeToInstant,
  normalizeMerchantRegionalProfile,
} from "../src/services/merchantRegionalRuntime";

test("Iraq signup defaults to Baghdad timezone and IQD", () => {
  assert.deepEqual(defaultMerchantRegionalProfileForCountry("iq"), {
    country_code: "IQ",
    timezone: "Asia/Baghdad",
    currency_code: "IQD",
  });
  assert.deepEqual(normalizeMerchantRegionalProfile({ country_code: "IQ" }), {
    country_code: "IQ",
    timezone: "Asia/Baghdad",
    currency_code: "IQD",
  });
});

test("Baghdad merchant local time converts to UTC without using server timezone", () => {
  assert.equal(
    merchantLocalDateTimeToInstant("2026-09-01T09:00", "Asia/Baghdad"),
    "2026-09-01T06:00:00.000Z",
  );
  assert.equal(
    instantToMerchantLocalDateTime(
      "2026-09-01T06:00:00.000Z",
      "Asia/Baghdad",
    ),
    "2026-09-01T09:00:00",
  );
});

test("New York merchant schedule observes daylight saving time", () => {
  const profile = normalizeMerchantRegionalProfile({
    country_code: "US",
    timezone: "America/New_York",
    currency_code: "USD",
  });
  assert.equal(profile.timezone, "America/New_York");
  assert.equal(
    merchantLocalDateTimeToInstant("2026-07-01T09:00", profile.timezone),
    "2026-07-01T13:00:00.000Z",
  );
});

test("country without a safe default requires explicit timezone", () => {
  assert.throws(
    () => normalizeMerchantRegionalProfile({ country_code: "US", currency_code: "USD" }),
    (error: unknown) =>
      (error as { code?: string })?.code === "MERCHANT_TIMEZONE_REQUIRED",
  );
});

test("nonexistent DST wall clock time is rejected instead of shifted silently", () => {
  assert.throws(
    () => merchantLocalDateTimeToInstant("2026-03-08T02:30", "America/New_York"),
    (error: unknown) =>
      (error as { code?: string })?.code === "MERCHANT_LOCAL_TIME_NONEXISTENT",
  );
});

test("ambiguous DST wall clock time is rejected instead of guessed", () => {
  assert.throws(
    () => merchantLocalDateTimeToInstant("2026-11-01T01:30", "America/New_York"),
    (error: unknown) =>
      (error as { code?: string })?.code === "MERCHANT_LOCAL_TIME_AMBIGUOUS",
  );
});
