import fs from 'node:fs';

const files = {
  auth: 'artifacts/api-server/src/routes/auth.ts',
  test: 'artifacts/api-server/tests/subscription-lifecycle.integration.test.mjs',
  types: 'artifacts/fawri/src/lib/types.ts',
  emergency: 'artifacts/fawri/src/components/EmergencyCredit.tsx',
  card: 'artifacts/fawri/src/components/SubscriptionCard.tsx',
  overview: 'artifacts/fawri/src/pages/dashboard/OverviewPage.tsx',
  admin: 'artifacts/fawri/src/pages/AdminPage.tsx',
  notifications: 'artifacts/fawri/src/pages/dashboard/NotificationsPage.tsx',
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

function replaceAllExpected(source, before, after, expectedCount, label) {
  const count = source.split(before).length - 1;
  if (count !== expectedCount) {
    throw new Error(`Expected ${expectedCount} ${label}, found ${count}`);
  }
  return source.split(before).join(after);
}

let auth = fs.readFileSync(files.auth, 'utf8');
auth = replaceExactly(
  auth,
  `type AddonReplyBatch = {\n  id: string;\n  purchased_at: string;\n  expires_at: string;\n  amount: number;\n  remaining: number;\n};\n`,
  `type AddonReplyBatch = {\n  id: string;\n  source: "purchase" | "emergency";\n  purchased_at: string;\n  expires_at: string;\n  amount: number;\n  remaining: number;\n};\n`,
  'add-on batch type',
);
auth = replaceExactly(
  auth,
  `      const remaining = Math.min(normalizeNonNegativeInteger(record.remaining), amount);\n      const id = String(record.id || "").trim();\n`,
  `      const remaining = Math.min(normalizeNonNegativeInteger(record.remaining), amount);\n      const id = String(record.id || "").trim();\n      const source = record.source === "emergency" ? "emergency" : "purchase";\n`,
  'add-on source normalization',
);
auth = replaceExactly(
  auth,
  `      return {\n        id,\n        purchased_at: purchasedAt.toISOString(),\n        expires_at: expiresAt.toISOString(),\n        amount,\n        remaining,\n      };\n`,
  `      return {\n        id,\n        source,\n        purchased_at: purchasedAt.toISOString(),\n        expires_at: expiresAt.toISOString(),\n        amount,\n        remaining,\n      };\n`,
  'normalized add-on return',
);
auth = replaceExactly(
  auth,
  `  subscription.emergency_credit_remaining = subscription.emergency_credit_activated\n    ? Math.min(\n        subscription.emergency_credit_amount,\n        Math.max(0, subscription.emergency_credit_remaining),\n      )\n    : 0;\n  subscription.emergency_credit_used = subscription.emergency_credit_activated\n    ? subscription.emergency_credit_amount - subscription.emergency_credit_remaining\n    : 0;\n  subscription.emergency_debt = Math.max(0, subscription.emergency_debt);\n  subscription.pending_next_cycle_deduction = subscription.emergency_debt;\n  subscription.replies_used =\n    subscription.base_replies_used +\n    subscription.addon_reply_batches.reduce(\n      (total, batch) => total + (batch.amount - batch.remaining),\n      0,\n    ) +\n    subscription.emergency_credit_used;\n  subscription.replies_remaining =\n    subscription.base_replies_remaining +\n    subscription.addon_replies_remaining +\n    subscription.emergency_credit_remaining;\n`,
  `  subscription.emergency_credit_remaining = 0;\n  subscription.emergency_credit_used = subscription.emergency_credit_activated\n    ? subscription.emergency_credit_amount\n    : 0;\n  subscription.emergency_debt = Math.max(0, subscription.emergency_debt);\n  subscription.pending_next_cycle_deduction = subscription.emergency_debt;\n  subscription.replies_used =\n    subscription.base_replies_used +\n    subscription.addon_reply_batches.reduce(\n      (total, batch) => total + (batch.amount - batch.remaining),\n      0,\n    );\n  subscription.replies_remaining =\n    subscription.base_replies_remaining +\n    subscription.addon_replies_remaining;\n`,
  'subscription total calculation',
);
auth = replaceExactly(
  auth,
  `\n  if (remainingToConsume > 0) {\n    const fromEmergency = Math.min(\n      subscription.emergency_credit_remaining,\n      remainingToConsume,\n    );\n    subscription.emergency_credit_remaining -= fromEmergency;\n    remainingToConsume -= fromEmergency;\n  }\n`,
  `\n`,
  'separate emergency consumption',
);
auth = replaceExactly(
  auth,
  `    subscription.addon_reply_batches.push({\n      id: makeId("addon-replies"),\n      purchased_at: purchasedAt.toISOString(),\n`,
  `    subscription.addon_reply_batches.push({\n      id: makeId("addon-replies"),\n      source: "purchase",\n      purchased_at: purchasedAt.toISOString(),\n`,
  'purchased add-on source',
);
auth = replaceExactly(
  auth,
  `  const billingAnchorDay = Math.min(\n    31,\n    Math.max(\n      1,\n      normalizeNonNegativeInteger(record.billing_anchor_day) ||\n        getBaghdadDateParts(startDate).day,\n    ),\n  );\n\n  return recalculateSubscriptionTotals({\n`,
  `  const billingAnchorDay = Math.min(\n    31,\n    Math.max(\n      1,\n      normalizeNonNegativeInteger(record.billing_anchor_day) ||\n        getBaghdadDateParts(startDate).day,\n    ),\n  );\n  const addonReplyBatches = normalizeAddonReplyBatches(record.addon_reply_batches);\n\n  if (\n    emergencyRemaining > 0 &&\n    !addonReplyBatches.some((batch) => batch.source === "emergency")\n  ) {\n    const migratedAt = new Date();\n    const migratedAnchorDay = getBaghdadDateParts(migratedAt).day;\n    addonReplyBatches.push({\n      id: `legacy-emergency-${id}`,\n      source: "emergency",\n      purchased_at: migratedAt.toISOString(),\n      expires_at: addBaghdadCalendarMonths(\n        migratedAt,\n        3,\n        migratedAnchorDay,\n      ).toISOString(),\n      amount: emergencyRemaining,\n      remaining: emergencyRemaining,\n    });\n  }\n\n  return recalculateSubscriptionTotals({\n`,
  'legacy emergency migration',
);
auth = replaceExactly(
  auth,
  `    addon_reply_batches: normalizeAddonReplyBatches(record.addon_reply_batches),\n`,
  `    addon_reply_batches: addonReplyBatches,\n`,
  'normalized add-on batches assignment',
);
auth = replaceExactly(
  auth,
  `  const emergencyDeduction = Math.min(\n    existingNormalized?.emergency_debt || 0,\n    config.reply_limit,\n  );\n`,
  `  const existingEmergencyDebt = existingNormalized?.emergency_debt || 0;\n  const emergencyDeduction = Math.min(\n    existingEmergencyDebt,\n    config.reply_limit,\n  );\n  const remainingEmergencyDebt = Math.max(\n    0,\n    existingEmergencyDebt - emergencyDeduction,\n  );\n`,
  'renewal emergency debt calculation',
);
auth = replaceExactly(
  auth,
  `    emergency_credit_activated: false,\n    emergency_debt: 0,\n    pending_next_cycle_deduction: 0,\n`,
  `    emergency_credit_activated: false,\n    emergency_debt: remainingEmergencyDebt,\n    pending_next_cycle_deduction: remainingEmergencyDebt,\n`,
  'renewal remaining emergency debt',
);
auth = replaceExactly(
  auth,
  `  subscription.emergency_credit_activated = true;\n  subscription.emergency_credit_remaining = subscription.emergency_credit_amount;\n  subscription.emergency_credit_used = 0;\n  subscription.emergency_debt = subscription.emergency_credit_amount;\n  subscription.pending_next_cycle_deduction = subscription.emergency_debt;\n  subscription.status = "active";\n  subscription.auto_reply_enabled = true;\n  recalculateSubscriptionTotals(subscription);\n`,
  `  const activatedAt = new Date();\n  const emergencyAmount = subscription.emergency_credit_amount;\n  const anchorDay = getBaghdadDateParts(activatedAt).day;\n  subscription.addon_reply_batches.push({\n    id: makeId("emergency-replies"),\n    source: "emergency",\n    purchased_at: activatedAt.toISOString(),\n    expires_at: addBaghdadCalendarMonths(\n      activatedAt,\n      3,\n      anchorDay,\n    ).toISOString(),\n    amount: emergencyAmount,\n    remaining: emergencyAmount,\n  });\n  subscription.emergency_credit_activated = true;\n  subscription.emergency_credit_remaining = 0;\n  subscription.emergency_credit_used = emergencyAmount;\n  subscription.emergency_debt = emergencyAmount;\n  subscription.pending_next_cycle_deduction = subscription.emergency_debt;\n  subscription.status = "active";\n  subscription.auto_reply_enabled = true;\n  recalculateSubscriptionTotals(subscription, activatedAt);\n`,
  'emergency activation as add-on batch',
);
fs.writeFileSync(files.auth, auth);

let testSource = fs.readFileSync(files.test, 'utf8');
testSource = replaceExactly(
  testSource,
  `  assert.equal(emergencyA.body.subscription.emergency_debt, 400);\n  assert.equal(emergencyA.body.subscription.replies_remaining, 400);\n`,
  `  assert.equal(emergencyA.body.subscription.emergency_debt, 400);\n  assert.equal(emergencyA.body.subscription.emergency_credit_remaining, 0);\n  assert.equal(emergencyA.body.subscription.addon_replies_remaining, 400);\n  assert.equal(emergencyA.body.subscription.addon_reply_batches.length, 1);\n  assert.equal(emergencyA.body.subscription.addon_reply_batches[0].source, "emergency");\n  assert.equal(emergencyA.body.subscription.replies_remaining, 400);\n`,
  'merchant A emergency assertions',
);
testSource = replaceExactly(
  testSource,
  `  assert.equal(partialDebtPayment.body.subscription.addon_replies_remaining, 0);\n`,
  `  assert.equal(partialDebtPayment.body.subscription.addon_replies_remaining, 400);\n`,
  'partial debt payment balance',
);
testSource = replaceExactly(
  testSource,
  `  assert.equal(debtAndAddon.body.subscription.addon_replies_remaining, 200);\n  assert.equal(debtAndAddon.body.subscription.addon_reply_batches.length, 1);\n`,
  `  assert.equal(debtAndAddon.body.subscription.addon_replies_remaining, 600);\n  assert.equal(debtAndAddon.body.subscription.addon_reply_batches.length, 2);\n  assert.deepEqual(\n    debtAndAddon.body.subscription.addon_reply_batches.map((batch) => batch.source).sort(),\n    ["emergency", "purchase"],\n  );\n`,
  'debt and add-on balances',
);
testSource = replaceExactly(
  testSource,
  `  assert.equal(splitRealtime.subscription.addon_replies_remaining, 200);\n`,
  `  assert.equal(splitRealtime.subscription.addon_replies_remaining, 600);\n`,
  'realtime combined add-on balance',
);
testSource = replaceExactly(
  testSource,
  `  assert.equal(renewedAfterExhaustion.body.subscription.addon_replies_remaining, 200);\n`,
  `  assert.equal(renewedAfterExhaustion.body.subscription.addon_replies_remaining, 600);\n`,
  'renewal preserved emergency add-on balance',
);
testSource = replaceExactly(
  testSource,
  `  assert.equal(changedWithDebt.body.subscription.base_replies_remaining, 7600);\n  assert.equal(changedWithDebt.body.subscription.emergency_credit_activated, false);\n`,
  `  assert.equal(changedWithDebt.body.subscription.base_replies_remaining, 7600);\n  assert.equal(changedWithDebt.body.subscription.addon_replies_remaining, 400);\n  assert.equal(changedWithDebt.body.subscription.replies_remaining, 8000);\n  assert.equal(changedWithDebt.body.subscription.addon_reply_batches[0].source, "emergency");\n  assert.equal(changedWithDebt.body.subscription.emergency_credit_activated, false);\n`,
  'plan change preserves emergency add-on balance',
);
testSource = replaceExactly(
  testSource,
  `  assert.equal(emergencyC.body.subscription.addon_replies_remaining, 200);\n  assert.equal(emergencyC.body.subscription.emergency_credit_remaining, 400);\n  assert.equal(emergencyC.body.subscription.emergency_debt, 400);\n  assert.equal(emergencyC.body.subscription.replies_remaining, 900);\n`,
  `  assert.equal(emergencyC.body.subscription.addon_replies_remaining, 600);\n  assert.equal(emergencyC.body.subscription.emergency_credit_remaining, 0);\n  assert.equal(emergencyC.body.subscription.emergency_debt, 400);\n  assert.equal(emergencyC.body.subscription.addon_reply_batches.length, 2);\n  assert.equal(\n    emergencyC.body.subscription.addon_reply_batches.filter((batch) => batch.source === "emergency").length,\n    1,\n  );\n  assert.equal(emergencyC.body.subscription.replies_remaining, 900);\n`,
  'merchant C emergency add-on assertions',
);
fs.writeFileSync(files.test, testSource);

let types = fs.readFileSync(files.types, 'utf8');
types = replaceExactly(
  types,
  `  addon_reply_batches?: Array<{\n    id: string;\n    purchased_at: string;\n`,
  `  addon_reply_batches?: Array<{\n    id: string;\n    source?: 'purchase' | 'emergency';\n    purchased_at: string;\n`,
  'frontend add-on batch source',
);
fs.writeFileSync(files.types, types);

let emergency = fs.readFileSync(files.emergency, 'utf8');
emergency = replaceExactly(
  emergency,
  `    subscription.emergency_credit_amount > 0 &&\n    eligibleBalance <= 500;\n`,
  `    subscription.emergency_credit_amount > 0 &&\n    emergencyDebt <= 0 &&\n    eligibleBalance <= 500;\n`,
  'frontend debt eligibility',
);
fs.writeFileSync(files.emergency, emergency);

let card = fs.readFileSync(files.card, 'utf8');
card = replaceExactly(
  card,
  `  const emergencyRepliesRemaining = subscription.emergency_credit_remaining ?? 0;\n  const addonRepliesRemaining = subscription.addon_replies_remaining ?? 0;\n  const totalRepliesAvailable =\n    baseRepliesRemaining + emergencyRepliesRemaining + addonRepliesRemaining;\n`,
  `  const addonRepliesRemaining = subscription.addon_replies_remaining ?? 0;\n  const totalRepliesAvailable =\n    baseRepliesRemaining + addonRepliesRemaining;\n`,
  'subscription card totals',
);
card = replaceExactly(
  card,
  `        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">\n          {[\n            [t.subscription_emergency_balance, emergencyRepliesRemaining],\n            [t.subscription_addon_balance, addonRepliesRemaining],\n            [t.subscription_total_available, totalRepliesAvailable],\n`,
  `        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">\n          {[\n            [t.subscription_addon_balance, addonRepliesRemaining],\n            [t.subscription_total_available, totalRepliesAvailable],\n`,
  'subscription card balance cards',
);
fs.writeFileSync(files.card, card);

let overview = fs.readFileSync(files.overview, 'utf8');
overview = replaceExactly(
  overview,
  `  const emergencyRepliesRemaining = sub?.emergency_credit_remaining ?? 0;\n  const addonRepliesRemaining = sub?.addon_replies_remaining ?? 0;\n  const totalRepliesAvailable =\n    baseRepliesRemaining + emergencyRepliesRemaining + addonRepliesRemaining;\n`,
  `  const addonRepliesRemaining = sub?.addon_replies_remaining ?? 0;\n  const totalRepliesAvailable =\n    baseRepliesRemaining + addonRepliesRemaining;\n`,
  'overview totals',
);
overview = replaceExactly(
  overview,
  `              <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">\n                {[\n                  [t.subscription_base_remaining, baseRepliesRemaining],\n                  [t.subscription_emergency_balance, emergencyRepliesRemaining],\n                  [t.subscription_addon_balance, addonRepliesRemaining],\n                  [t.subscription_total_available, totalRepliesAvailable],\n`,
  `              <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">\n                {[\n                  [t.subscription_base_remaining, baseRepliesRemaining],\n                  [t.subscription_addon_balance, addonRepliesRemaining],\n                  [t.subscription_total_available, totalRepliesAvailable],\n`,
  'overview balance cards',
);
fs.writeFileSync(files.overview, overview);

let admin = fs.readFileSync(files.admin, 'utf8');
admin = replaceAllExpected(admin, `  emergencyBalanceLabel,\n`, ``, 1, 'admin emergency balance parameter');
admin = replaceAllExpected(admin, `  emergencyBalanceLabel: string;\n`, ``, 1, 'admin emergency balance parameter type');
admin = replaceExactly(
  admin,
  `  const emergencyRepliesRemaining = subscription.emergency_credit_remaining ?? 0;\n  const addonRepliesRemaining = subscription.addon_replies_remaining ?? 0;\n  const totalRepliesAvailable =\n    baseRepliesRemaining + emergencyRepliesRemaining + addonRepliesRemaining;\n`,
  `  const addonRepliesRemaining = subscription.addon_replies_remaining ?? 0;\n  const totalRepliesAvailable =\n    baseRepliesRemaining + addonRepliesRemaining;\n`,
  'admin summary totals',
);
admin = replaceExactly(
  admin,
  `  const balanceItems = [\n    [emergencyBalanceLabel, emergencyRepliesRemaining],\n    [addonBalanceLabel, addonRepliesRemaining],\n    [totalAvailableLabel, totalRepliesAvailable],\n  ] as const;\n`,
  `  const balanceItems = [\n    [addonBalanceLabel, addonRepliesRemaining],\n    [totalAvailableLabel, totalRepliesAvailable],\n  ] as const;\n`,
  'admin balance items',
);
admin = replaceExactly(
  admin,
  `      <div className={compact ? "grid grid-cols-2 gap-1.5" : "grid grid-cols-3 gap-2"}>\n        {balanceItems.map(([label, value], index) => (\n`,
  `      <div className="grid grid-cols-2 gap-1.5">\n        {balanceItems.map(([label, value]) => (\n`,
  'admin balance grid',
);
admin = replaceExactly(
  admin,
  `            className={\n              "flex min-h-[54px] flex-col items-center justify-center rounded-lg border border-border/60 bg-background px-1.5 py-2 text-center " +\n              (compact && index === 2 ? "col-span-2" : "")\n            }\n`,
  `            className="flex min-h-[54px] flex-col items-center justify-center rounded-lg border border-border/60 bg-background px-1.5 py-2 text-center"\n`,
  'admin balance card class',
);
admin = replaceExactly(
  admin,
  `  const emergencyRepliesRemaining = sub\n    ? sub.emergency_credit_remaining ??\n      Math.max(0, sub.emergency_credit_amount - sub.emergency_credit_used)\n    : 0;\n  const addonRepliesRemaining = sub?.addon_replies_remaining ?? 0;\n  const totalRepliesAvailable =\n    baseRepliesRemaining + emergencyRepliesRemaining + addonRepliesRemaining;\n`,
  `  const addonRepliesRemaining = sub?.addon_replies_remaining ?? 0;\n  const totalRepliesAvailable =\n    baseRepliesRemaining + addonRepliesRemaining;\n`,
  'admin details totals',
);
admin = replaceExactly(
  admin,
  `                      [\n                        adminText.detailsEmergencyBalance,\n                        emergencyRepliesRemaining.toLocaleString(locale),\n                      ],\n                      [\n                        adminText.detailsEmergencyCreditUsed,\n                        sub.emergency_credit_used.toLocaleString(locale),\n                      ],\n`,
  ``,
  'admin emergency available and used rows',
);
admin = replaceAllExpected(
  admin,
  `                                emergencyBalanceLabel={adminText.detailsEmergencyBalance}\n`,
  ``,
  2,
  'admin emergency balance props',
);
fs.writeFileSync(files.admin, admin);

let notifications = fs.readFileSync(files.notifications, 'utf8');
notifications = replaceExactly(
  notifications,
  `      base: notification.base_replies_remaining.toLocaleString(locale),\n      emergency: notification.emergency_replies_remaining.toLocaleString(locale),\n      addon: notification.addon_replies_remaining.toLocaleString(locale),\n`,
  `      base: notification.base_replies_remaining.toLocaleString(locale),\n      addon: notification.addon_replies_remaining.toLocaleString(locale),\n`,
  'notification balance summary values',
);
fs.writeFileSync(files.notifications, notifications);

const translationReplacements = [
  [files.ar,
    `  balance_notification_summary: "رصيدك الحالي: {base} أساسي + {emergency} طوارئ + {addon} إضافي = {total} رد متاح.",\n`,
    `  balance_notification_summary: "رصيدك الحالي: {base} أساسي + {addon} إضافي = {total} رد متاح.",\n`],
  [files.en,
    `  balance_notification_summary: "Current balance: {base} base + {emergency} emergency + {addon} add-on = {total} replies available.",\n`,
    `  balance_notification_summary: "Current balance: {base} base + {addon} add-on = {total} replies available.",\n`],
  [files.ku,
    `  balance_notification_summary: "کرێدیتی ئێستات: {base} سەرەکی + {emergency} فریاکەوتن + {addon} زیادە = {total} وەڵامی بەردەست.",\n`,
    `  balance_notification_summary: "کرێدیتی ئێستات: {base} سەرەکی + {addon} زیادە = {total} وەڵامی بەردەست.",\n`],
];
for (const [file, before, after] of translationReplacements) {
  const source = fs.readFileSync(file, 'utf8');
  fs.writeFileSync(file, replaceExactly(source, before, after, `translation ${file}`));
}

console.log('Emergency credit now creates a three-month add-on batch and survives plan renewal or change.');
