import assert from "node:assert/strict";
import test from "node:test";
import { calculateGoogleTrialWindow, GOOGLE_TRIAL_WINDOW_MS } from "../src/services/googleTrialWindow";

const created = new Date("2026-11-28T11:00:00.000Z");

test("seven days start at the first successful account creation", () => {
  const w = calculateGoogleTrialWindow(created, created);
  assert.equal(w.startsAt, created.toISOString());
  assert.equal(w.expiresAt, "2026-12-05T11:00:00.000Z");
  assert.equal(w.remainingMs, GOOGLE_TRIAL_WINDOW_MS);
  assert.equal(w.expired, false);
  assert.equal(Object.isFrozen(w), true);
});

test("review time consumes trial time and subsequent login cannot reset the window", () => {
  const later = new Date(created.getTime() + 2 * 86400000);
  const w = calculateGoogleTrialWindow(created, later);
  assert.equal(w.expiresAt, "2026-12-05T11:00:00.000Z");
  assert.equal(w.remainingMs, 5 * 86400000);
});

test("expiry is exact, including an account never linked to a channel", () => {
  const end = created.getTime() + GOOGLE_TRIAL_WINDOW_MS;
  assert.equal(calculateGoogleTrialWindow(created, new Date(end - 1)).remainingMs, 1);
  assert.equal(calculateGoogleTrialWindow(created, new Date(end - 1)).expired, false);
  for (const now of [end, end + 86400000]) {
    const w = calculateGoogleTrialWindow(created, new Date(now));
    assert.equal(w.remainingMs, 0);
    assert.equal(w.expired, true);
  }
});

test("invalid or future account creation cannot produce a trial window", () => {
  assert.throws(() => calculateGoogleTrialWindow(new Date(NaN), created), /GOOGLE_TRIAL_CLOCK_INVALID/);
  assert.throws(() => calculateGoogleTrialWindow(created, new Date(NaN)), /GOOGLE_TRIAL_CLOCK_INVALID/);
  assert.throws(() => calculateGoogleTrialWindow(created, new Date(created.getTime() - 1)), /GOOGLE_TRIAL_CLOCK_INVALID/);
  assert.throws(() => calculateGoogleTrialWindow("2026-11-28" as unknown as Date, created), /GOOGLE_TRIAL_CLOCK_INVALID/);
});
