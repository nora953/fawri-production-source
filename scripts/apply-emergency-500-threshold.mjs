import fs from "node:fs";

const AUTH_PATH = "artifacts/api-server/src/routes/auth.ts";
const TEST_PATH = "artifacts/api-server/tests/subscription-lifecycle.integration.test.mjs";
const SUBSCRIPTION_PAGE_PATH = "artifacts/fawri/src/pages/dashboard/SubscriptionPage.tsx";
const SUBSCRIPTION_CARD_PATH = "artifacts/fawri/src/components/SubscriptionCard.tsx";
const EMERGENCY_CREDIT_PATH = "artifacts/fawri/src/components/EmergencyCredit.tsx";

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
  `  if (subscription.replies_remaining > 0) {
    return sendError(res, 409, "emergency credit requires zero remaining replies");
  }
`,
  `  const emergencyEligibilityThreshold = 500;
  if (subscription.base_replies_remaining > emergencyEligibilityThreshold) {
    return sendError(
      res,
      409,
      "emergency credit requires 500 or fewer base replies",
      {
        code: "EMERGENCY_BASE_THRESHOLD_NOT_REACHED",
        base_replies_remaining: subscription.base_replies_remaining,
        threshold: emergencyEligibilityThreshold,
      },
    );
  }
`,
  "backend emergency threshold block",
);
fs.writeFileSync(AUTH_PATH, auth);

let testFile = fs.readFileSync(TEST_PATH, "utf8");
testFile = replaceExactly(
  testFile,
  `      { ...baseMerchant, id: "merchant-a", phone: "07333333333", password: "Merchant1@" },
      { ...baseMerchant, id: "merchant-b", phone: "07444444444", password: "Merchant2@" },
`,
  `      { ...baseMerchant, id: "merchant-a", phone: "07333333333", password: "Merchant1@" },
      { ...baseMerchant, id: "merchant-b", phone: "07444444444", password: "Merchant2@" },
      { ...baseMerchant, id: "merchant-c", phone: "07555555555", password: "Merchant3@" },
`,
  "merchant C fixture",
);
testFile = replaceExactly(
  testFile,
  `  const merchantACookie = await merchantCookie("07333333333", "Merchant1@");
  const merchantBCookie = await merchantCookie("07444444444", "Merchant2@");
`,
  `  const merchantACookie = await merchantCookie("07333333333", "Merchant1@");
  const merchantBCookie = await merchantCookie("07444444444", "Merchant2@");
  const merchantCCookie = await merchantCookie("07555555555", "Merchant3@");
`,
  "merchant C session",
);
testFile = replaceExactly(
  testFile,
  `  assert.equal(changedWithDebt.body.subscription.base_replies_remaining, 7600);
  assert.equal(changedWithDebt.body.subscription.emergency_credit_activated, false);
});
`,
  `  assert.equal(changedWithDebt.body.subscription.base_replies_remaining, 7600);
  assert.equal(changedWithDebt.body.subscription.emergency_credit_activated, false);

  const activatedC = await planOperation("merchant-c", "activate", "silver");
  assert.equal(activatedC.response.status, 200);

  const aboveThreshold = await subscriptionAction("merchant-c", "deduct_replies", 3499);
  assert.equal(aboveThreshold.response.status, 200);
  assert.equal(aboveThreshold.body.subscription.base_replies_remaining, 501);

  const deniedAboveThreshold = await json(await fetch(baseUrl + "/api/auth/subscription/emergency", {
    method: "POST", headers: { Cookie: merchantCCookie, "Content-Type": "application/json" },
  }));
  assert.equal(deniedAboveThreshold.response.status, 409);
  assert.equal(deniedAboveThreshold.body.code, "EMERGENCY_BASE_THRESHOLD_NOT_REACHED");
  assert.equal(deniedAboveThreshold.body.base_replies_remaining, 501);
  assert.equal(deniedAboveThreshold.body.threshold, 500);

  const addonC = await subscriptionAction("merchant-c", "add_replies", 200);
  assert.equal(addonC.response.status, 200);
  assert.equal(addonC.body.subscription.addon_replies_remaining, 200);

  const atThreshold = await subscriptionAction("merchant-c", "deduct_replies", 1);
  assert.equal(atThreshold.response.status, 200);
  assert.equal(atThreshold.body.subscription.base_replies_remaining, 500);
  assert.equal(atThreshold.body.subscription.addon_replies_remaining, 200);

  const emergencyC = await json(await fetch(baseUrl + "/api/auth/subscription/emergency", {
    method: "POST", headers: { Cookie: merchantCCookie, "Content-Type": "application/json" },
  }));
  assert.equal(emergencyC.response.status, 200);
  assert.equal(emergencyC.body.subscription.base_replies_remaining, 500);
  assert.equal(emergencyC.body.subscription.addon_replies_remaining, 200);
  assert.equal(emergencyC.body.subscription.emergency_credit_remaining, 400);
  assert.equal(emergencyC.body.subscription.emergency_debt, 400);
  assert.equal(emergencyC.body.subscription.replies_remaining, 1100);
});
`,
  "500 reply emergency threshold assertions",
);
fs.writeFileSync(TEST_PATH, testFile);

let subscriptionPage = fs.readFileSync(SUBSCRIPTION_PAGE_PATH, "utf8");
subscriptionPage = replaceExactly(
  subscriptionPage,
  `  const handleActivateEmergency = async () => {
    if (!merchantId || !subscription || subscription.status !== 'active') return;
`,
  `  const handleActivateEmergency = async () => {
    const canRequestEmergency =
      subscription?.status === 'active' ||
      subscription?.status === 'replies_exhausted';

    if (!merchantId || !subscription || !canRequestEmergency) return;
`,
  "subscription page emergency status guard",
);
fs.writeFileSync(SUBSCRIPTION_PAGE_PATH, subscriptionPage);

let subscriptionCard = fs.readFileSync(SUBSCRIPTION_CARD_PATH, "utf8");
subscriptionCard = replaceExactly(
  subscriptionCard,
  `  const isActive = subscription.status === 'active';
`,
  `  const isActive = subscription.status === 'active';
  const canShowEmergency =
    isActive || subscription.status === 'replies_exhausted';
`,
  "subscription card emergency visibility state",
);
subscriptionCard = replaceExactly(
  subscriptionCard,
  `        {isActive && (
          <EmergencyCredit subscription={subscription} onActivate={onEmergencyActivate} />
        )}
`,
  `        {canShowEmergency && (
          <EmergencyCredit subscription={subscription} onActivate={onEmergencyActivate} />
        )}
`,
  "subscription card emergency rendering",
);
fs.writeFileSync(SUBSCRIPTION_CARD_PATH, subscriptionCard);

let emergencyCredit = fs.readFileSync(EMERGENCY_CREDIT_PATH, "utf8");
emergencyCredit = replaceExactly(
  emergencyCredit,
  `  const isEligible =
    subscription.status === 'active' &&
    !subscription.emergency_credit_activated &&
    subscription.emergency_credit_amount > 0 &&
    subscription.replies_remaining <= subscription.reply_limit * 0.1;
`,
  `  const baseRepliesRemaining =
    subscription.base_replies_remaining ?? subscription.replies_remaining;
  const canRequestEmergency =
    subscription.status === 'active' ||
    subscription.status === 'replies_exhausted';
  const isEligible =
    canRequestEmergency &&
    !subscription.emergency_credit_activated &&
    subscription.emergency_credit_amount > 0 &&
    baseRepliesRemaining <= 500;
`,
  "emergency credit frontend eligibility",
);
fs.writeFileSync(EMERGENCY_CREDIT_PATH, emergencyCredit);

console.log("Applied the 500-base-reply emergency eligibility rule.");
