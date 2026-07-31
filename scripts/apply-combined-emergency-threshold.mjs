import fs from 'node:fs';

const files = {
  auth: 'artifacts/api-server/src/routes/auth.ts',
  test: 'artifacts/api-server/tests/subscription-lifecycle.integration.test.mjs',
  emergency: 'artifacts/fawri/src/components/EmergencyCredit.tsx',
  subscriptionCard: 'artifacts/fawri/src/components/SubscriptionCard.tsx',
  overview: 'artifacts/fawri/src/pages/dashboard/OverviewPage.tsx',
  ar: 'artifacts/fawri/src/lib/translations/ar.ts',
  en: 'artifacts/fawri/src/lib/translations/en.ts',
  ku: 'artifacts/fawri/src/lib/translations/ku.ts',
};

function replaceExactly(source, before, after, label) {
  const first = source.indexOf(before);
  if (first < 0) throw new Error(`Could not find ${label}`);
  if (source.indexOf(before, first + before.length) >= 0) {
    throw new Error(`Found more than one ${label}`);
  }
  return source.slice(0, first) + after + source.slice(first + before.length);
}

let auth = fs.readFileSync(files.auth, 'utf8');
auth = replaceExactly(
  auth,
  `  const emergencyEligibilityThreshold = 500;\n  if (subscription.base_replies_remaining > emergencyEligibilityThreshold) {\n    return sendError(\n      res,\n      409,\n      "emergency credit requires 500 or fewer base replies",\n      {\n        code: "EMERGENCY_BASE_THRESHOLD_NOT_REACHED",\n        base_replies_remaining: subscription.base_replies_remaining,\n        threshold: emergencyEligibilityThreshold,\n      },\n    );\n  }\n`,
  `  const emergencyEligibilityThreshold = 500;\n  const eligibleBalance =\n    subscription.base_replies_remaining +\n    subscription.addon_replies_remaining;\n  if (eligibleBalance > emergencyEligibilityThreshold) {\n    return sendError(\n      res,\n      409,\n      "emergency credit requires 500 or fewer combined base and add-on replies",\n      {\n        code: "EMERGENCY_COMBINED_THRESHOLD_NOT_REACHED",\n        base_replies_remaining: subscription.base_replies_remaining,\n        addon_replies_remaining: subscription.addon_replies_remaining,\n        eligible_balance: eligibleBalance,\n        threshold: emergencyEligibilityThreshold,\n      },\n    );\n  }\n`,
  'backend emergency eligibility block',
);
fs.writeFileSync(files.auth, auth);

let emergency = fs.readFileSync(files.emergency, 'utf8');
emergency = replaceExactly(
  emergency,
  `  const baseRepliesRemaining =\n    subscription.base_replies_remaining ?? subscription.replies_remaining;\n  const emergencyDebt =\n`,
  `  const baseRepliesRemaining =\n    subscription.base_replies_remaining ?? subscription.replies_remaining;\n  const addonRepliesRemaining = subscription.addon_replies_remaining ?? 0;\n  const eligibleBalance = baseRepliesRemaining + addonRepliesRemaining;\n  const emergencyDebt =\n`,
  'frontend combined balance variables',
);
emergency = replaceExactly(
  emergency,
  `    subscription.emergency_credit_amount > 0 &&\n    baseRepliesRemaining <= 500;\n`,
  `    subscription.emergency_credit_amount > 0 &&\n    eligibleBalance <= 500;\n`,
  'frontend emergency eligibility condition',
);
fs.writeFileSync(files.emergency, emergency);

for (const [path, label] of [
  [files.subscriptionCard, 'subscription card warning'],
  [files.overview, 'overview warning'],
]) {
  let text = fs.readFileSync(path, 'utf8');
  text = replaceExactly(
    text,
    `            <p className="text-sm font-semibold leading-5">\n              {t.subscription_base_remaining}:{' '}\n              <span className="tabular-nums" dir="ltr">\n                {baseRepliesRemaining.toLocaleString(locale)}\n              </span>{' '}\n              (≤ 15%)\n            </p>\n`,
    `            <p className="text-sm font-semibold leading-5">\n              {t.low_balance_purchase_warning}\n            </p>\n`,
    label,
  );
  fs.writeFileSync(path, text);
}

const translations = [
  [files.ar, '  usage_80_warning: "استخدمت 80% من حد الردود.",\n', '  usage_80_warning: "استخدمت 80% من حد الردود.",\n  low_balance_purchase_warning: "لتجنب توقف الردود نتيجة نفاد الرصيد، يمكنك الآن شراء رصيد إضافي.",\n'],
  [files.en, '  usage_80_warning: "You\'ve used 80% of your reply limit.",\n', '  usage_80_warning: "You\'ve used 80% of your reply limit.",\n  low_balance_purchase_warning: "To avoid auto-replies stopping when your balance runs out, you can now purchase additional replies.",\n'],
  [files.ku, '  usage_80_warning: "80% ی سنووری وەڵامت بەکارهاتووە.",\n', '  usage_80_warning: "80% ی سنووری وەڵامت بەکارهاتووە.",\n  low_balance_purchase_warning: "بۆ ئەوەی وەڵامدانەوەکان بەهۆی تەواوبوونی باڵانسەوە نەوەستن، ئێستا دەتوانیت وەڵامی زیادە بکڕیت.",\n'],
];
for (const [path, before, after] of translations) {
  const text = fs.readFileSync(path, 'utf8');
  fs.writeFileSync(path, replaceExactly(text, before, after, `translation ${path}`));
}

let testFile = fs.readFileSync(files.test, 'utf8');
testFile = replaceExactly(
  testFile,
  `  assert.equal(deniedAboveThreshold.body.code, "EMERGENCY_BASE_THRESHOLD_NOT_REACHED");\n  assert.equal(deniedAboveThreshold.body.base_replies_remaining, 501);\n  assert.equal(deniedAboveThreshold.body.threshold, 500);\n`,
  `  assert.equal(deniedAboveThreshold.body.code, "EMERGENCY_COMBINED_THRESHOLD_NOT_REACHED");\n  assert.equal(deniedAboveThreshold.body.base_replies_remaining, 501);\n  assert.equal(deniedAboveThreshold.body.addon_replies_remaining, 0);\n  assert.equal(deniedAboveThreshold.body.eligible_balance, 501);\n  assert.equal(deniedAboveThreshold.body.threshold, 500);\n`,
  'above-threshold assertions',
);
testFile = replaceExactly(
  testFile,
  `  const atThreshold = await subscriptionAction("merchant-c", "deduct_replies", 1);\n  assert.equal(atThreshold.response.status, 200);\n  assert.equal(atThreshold.body.subscription.base_replies_remaining, 500);\n  assert.equal(atThreshold.body.subscription.addon_replies_remaining, 200);\n\n  const emergencyC = await json(await fetch(baseUrl + "/api/auth/subscription/emergency", {\n`,
  `  const baseAtThresholdWithAddon = await subscriptionAction("merchant-c", "deduct_replies", 1);\n  assert.equal(baseAtThresholdWithAddon.response.status, 200);\n  assert.equal(baseAtThresholdWithAddon.body.subscription.base_replies_remaining, 500);\n  assert.equal(baseAtThresholdWithAddon.body.subscription.addon_replies_remaining, 200);\n\n  const deniedBecauseAddonRaisesTotal = await json(await fetch(baseUrl + "/api/auth/subscription/emergency", {\n    method: "POST", headers: { Cookie: merchantCCookie, "Content-Type": "application/json" },\n  }));\n  assert.equal(deniedBecauseAddonRaisesTotal.response.status, 409);\n  assert.equal(deniedBecauseAddonRaisesTotal.body.code, "EMERGENCY_COMBINED_THRESHOLD_NOT_REACHED");\n  assert.equal(deniedBecauseAddonRaisesTotal.body.eligible_balance, 700);\n\n  const combinedAtThreshold = await subscriptionAction("merchant-c", "deduct_replies", 200);\n  assert.equal(combinedAtThreshold.response.status, 200);\n  assert.equal(combinedAtThreshold.body.subscription.base_replies_remaining, 300);\n  assert.equal(combinedAtThreshold.body.subscription.addon_replies_remaining, 200);\n\n  const emergencyC = await json(await fetch(baseUrl + "/api/auth/subscription/emergency", {\n`,
  'combined threshold test setup',
);
testFile = replaceExactly(
  testFile,
  `  assert.equal(emergencyC.body.subscription.base_replies_remaining, 500);\n  assert.equal(emergencyC.body.subscription.addon_replies_remaining, 200);\n  assert.equal(emergencyC.body.subscription.emergency_credit_remaining, 400);\n  assert.equal(emergencyC.body.subscription.emergency_debt, 400);\n  assert.equal(emergencyC.body.subscription.replies_remaining, 1100);\n`,
  `  assert.equal(emergencyC.body.subscription.base_replies_remaining, 300);\n  assert.equal(emergencyC.body.subscription.addon_replies_remaining, 200);\n  assert.equal(emergencyC.body.subscription.emergency_credit_remaining, 400);\n  assert.equal(emergencyC.body.subscription.emergency_debt, 400);\n  assert.equal(emergencyC.body.subscription.replies_remaining, 900);\n`,
  'combined threshold emergency assertions',
);
fs.writeFileSync(files.test, testFile);

console.log('Applied combined base plus add-on emergency eligibility and localized low-balance warning.');
