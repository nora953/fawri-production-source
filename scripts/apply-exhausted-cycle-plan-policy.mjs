import fs from "node:fs";

const AUTH_PATH = "artifacts/api-server/src/routes/auth.ts";
const TEST_PATH = "artifacts/api-server/tests/subscription-lifecycle.integration.test.mjs";

function replaceExactly(source, before, after, label) {
  const first = source.indexOf(before);
  if (first < 0) throw new Error(`Could not find ${label}`);
  if (source.indexOf(before, first + before.length) >= 0) {
    throw new Error(`Found more than one ${label}`);
  }
  return source.slice(0, first) + after + source.slice(first + before.length);
}

let auth = fs.readFileSync(AUTH_PATH, "utf8");

auth = replaceExactly(
  auth,
  `  const existingExpired = existingNormalized
    ? new Date(existingNormalized.expires_at).getTime() <= currentDate.getTime()
    : true;
  const isEarlyRenewal = operation === "renew" && existingNormalized && !existingExpired;
  const billingAnchorDay = isEarlyRenewal
    ? existingNormalized.billing_anchor_day
    : getBaghdadDateParts(currentDate).day;
  const expirationBase = isEarlyRenewal
    ? new Date(existingNormalized.expires_at)
    : currentDate;
`,
  `  const billingAnchorDay = getBaghdadDateParts(currentDate).day;
  const expirationBase = currentDate;
`,
  "early-renewal timing block",
);

auth = replaceExactly(
  auth,
  `  const existingExpired = existing
    ? new Date(existing.expires_at).getTime() <= Date.now()
    : true;

  if (operation === "activate" && existing) {
    return sendError(res, 409, "merchant already has a subscription");
  }
  if ((operation === "change" || operation === "renew") && !existing) {
    return sendError(res, 409, "merchant does not have a subscription");
  }
  if (operation === "change" && existing && !existingExpired) {
    return sendError(res, 409, "active plan cannot be changed before expiration");
  }
  if (
    operation === "renew" &&
    existing &&
    !existingExpired &&
    existing.plan_name !== plan
  ) {
    return sendError(res, 409, "early renewal must keep the current plan");
  }
`,
  `  const existingExpired = existing
    ? new Date(existing.expires_at).getTime() <= Date.now()
    : true;
  const existingBaseExhausted = existing
    ? existing.base_replies_remaining <= 0
    : false;
  const canStartNewCycle = existingExpired || existingBaseExhausted;

  if (operation === "activate" && existing) {
    return sendError(res, 409, "merchant already has a subscription");
  }
  if ((operation === "change" || operation === "renew") && !existing) {
    return sendError(res, 409, "merchant does not have a subscription");
  }
  if (
    (operation === "change" || operation === "renew") &&
    existing &&
    !canStartNewCycle
  ) {
    return sendError(
      res,
      409,
      "a new subscription cycle requires exhausted base replies or an expired subscription",
      {
        code: "SUBSCRIPTION_CYCLE_STILL_ACTIVE",
        base_replies_remaining: existing.base_replies_remaining,
        expires_at: existing.expires_at,
      },
    );
  }
  if (operation === "renew" && existing && existing.plan_name !== plan) {
    return sendError(res, 409, "renewal must keep the current plan");
  }
`,
  "subscription replacement eligibility block",
);

auth = replaceExactly(
  auth,
  `  if (previousExpiresAt && previousExpiresAt !== subscription.expires_at) {
    merchant.last_subscription_ended_at = previousExpiresAt;
  }
`,
  `  if (previousExpiresAt && previousExpiresAt !== subscription.expires_at) {
    merchant.last_subscription_ended_at = existingExpired
      ? previousExpiresAt
      : subscription.start_date;
  }
`,
  "previous subscription end timestamp block",
);

auth = replaceExactly(
  auth,
  `        ...(operation === "renew" && emergencyDeduction > 0
          ? { emergency_deduction: emergencyDeduction }
          : {}),
`,
  `        ...(emergencyDeduction > 0
          ? { emergency_deduction: emergencyDeduction }
          : {}),
`,
  "emergency deduction log metadata block",
);

fs.writeFileSync(AUTH_PATH, auth);

let testFile = fs.readFileSync(TEST_PATH, "utf8");

testFile = replaceExactly(
  testFile,
  `test("calendar subscriptions, early renewal, add-ons and emergency debt", async (t) => {`,
  `test("calendar subscriptions, exhausted-cycle replacement, add-ons and emergency debt", async (t) => {`,
  "subscription lifecycle test title",
);

testFile = replaceExactly(
  testFile,
  `  const forbiddenChange = await planOperation("merchant-a", "change", "gold");
  assert.equal(forbiddenChange.response.status, 409);

  const exhaustedA = await subscriptionAction("merchant-a", "deduct_replies", 4000);
`,
  `  const forbiddenChange = await planOperation("merchant-a", "change", "gold");
  assert.equal(forbiddenChange.response.status, 409);
  assert.equal(forbiddenChange.body.code, "SUBSCRIPTION_CYCLE_STILL_ACTIVE");
  assert.equal(forbiddenChange.body.base_replies_remaining, 4000);

  const forbiddenEarlyRenewal = await planOperation("merchant-a", "renew", "silver");
  assert.equal(forbiddenEarlyRenewal.response.status, 409);
  assert.equal(forbiddenEarlyRenewal.body.code, "SUBSCRIPTION_CYCLE_STILL_ACTIVE");

  const exhaustedA = await subscriptionAction("merchant-a", "deduct_replies", 4000);
`,
  "active-cycle rejection assertions",
);

testFile = replaceExactly(
  testFile,
  `  const oldExpiry = new Date(debtAndAddon.body.subscription.expires_at);
  const earlyRenewal = await planOperation("merchant-a", "renew", "silver");
  assert.equal(earlyRenewal.response.status, 200);
  assert.equal(earlyRenewal.body.subscription.base_replies_remaining, 4000);
  assert.equal(earlyRenewal.body.subscription.addon_replies_remaining, 200);
  assert.ok(new Date(earlyRenewal.body.subscription.expires_at) > oldExpiry);
  const oldExpiryParts = baghdadParts(oldExpiry);
  const renewedExpiryParts = baghdadParts(earlyRenewal.body.subscription.expires_at);
  assert.equal(renewedExpiryParts.day, oldExpiryParts.day);
  assert.equal((renewedExpiryParts.month - oldExpiryParts.month + 12) % 12, 1);

  const activatedB = await planOperation("merchant-b", "activate", "silver");
`,
  `  const oldExpiry = new Date(debtAndAddon.body.subscription.expires_at);
  const renewedAfterExhaustion = await planOperation("merchant-a", "renew", "silver");
  assert.equal(renewedAfterExhaustion.response.status, 200);
  assert.equal(renewedAfterExhaustion.body.subscription.plan_name, "silver");
  assert.equal(renewedAfterExhaustion.body.subscription.base_replies_remaining, 4000);
  assert.equal(renewedAfterExhaustion.body.subscription.addon_replies_remaining, 200);
  assert.ok(new Date(renewedAfterExhaustion.body.subscription.start_date) < oldExpiry);
  const renewedStartParts = baghdadParts(renewedAfterExhaustion.body.subscription.start_date);
  const renewedExpiryParts = baghdadParts(renewedAfterExhaustion.body.subscription.expires_at);
  assert.equal(renewedExpiryParts.day, renewedStartParts.day);
  assert.equal((renewedExpiryParts.month - renewedStartParts.month + 12) % 12, 1);

  const activatedB = await planOperation("merchant-b", "activate", "silver");
`,
  "exhausted same-plan renewal assertions",
);

testFile = replaceExactly(
  testFile,
  `  const renewedWithDebt = await planOperation("merchant-b", "renew", "silver");
  assert.equal(renewedWithDebt.response.status, 200);
  assert.equal(renewedWithDebt.body.subscription.emergency_debt, 0);
  assert.equal(renewedWithDebt.body.subscription.base_replies_used, 400);
  assert.equal(renewedWithDebt.body.subscription.base_replies_remaining, 3600);
  assert.equal(renewedWithDebt.body.subscription.emergency_credit_activated, false);
`,
  `  const changedWithDebt = await planOperation("merchant-b", "change", "gold");
  assert.equal(changedWithDebt.response.status, 200);
  assert.equal(changedWithDebt.body.subscription.plan_name, "gold");
  assert.equal(changedWithDebt.body.subscription.emergency_debt, 0);
  assert.equal(changedWithDebt.body.subscription.base_replies_used, 400);
  assert.equal(changedWithDebt.body.subscription.base_replies_remaining, 7600);
  assert.equal(changedWithDebt.body.subscription.emergency_credit_activated, false);
`,
  "exhausted plan change with debt assertions",
);

fs.writeFileSync(TEST_PATH, testFile);
console.log("Applied exhausted-cycle subscription policy changes.");
