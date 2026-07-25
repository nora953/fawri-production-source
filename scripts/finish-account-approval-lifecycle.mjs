import fs from "node:fs";

const authPath = "artifacts/api-server/src/routes/auth.ts";
const typesPath = "artifacts/fawri/src/lib/types.ts";
const translationsPath = "artifacts/fawri/src/lib/admin-translations.ts";
const adminPagePath = "artifacts/fawri/src/pages/AdminPage.tsx";
const testPath = "artifacts/api-server/tests/admin-permissions.integration.test.mjs";

function requireMarker(source, marker, label) {
  if (!source.includes(marker)) throw new Error(`Missing ${label}`);
}

function replaceOnce(source, label, before, after) {
  if (source.includes(after)) return source;
  const index = source.indexOf(before);
  if (index === -1) throw new Error(`Could not find ${label}`);
  if (source.indexOf(before, index + before.length) !== -1) {
    throw new Error(`Found multiple matches for ${label}`);
  }
  return source.slice(0, index) + after + source.slice(index + before.length);
}

function replaceRegexOnce(source, label, pattern, replacement, doneMarker) {
  if (doneMarker && source.includes(doneMarker)) return source;
  const matches = source.match(pattern);
  if (!matches) throw new Error(`Could not find ${label}`);
  return source.replace(pattern, replacement);
}

const auth = fs.readFileSync(authPath, "utf8");
const types = fs.readFileSync(typesPath, "utf8");
const translations = fs.readFileSync(translationsPath, "utf8");
requireMarker(auth, "ACCOUNT_CHANNEL_ACTIVATION_DAYS = 10", "10-day activation window");
requireMarker(auth, 'account_status?: AccountStatus', "backend account lifecycle fields");
requireMarker(auth, 'merchant.onboarding_status = "awaiting_channel"', "approval onboarding transition");
requireMarker(types, "export type AccountStatus", "frontend account lifecycle types");
requireMarker(translations, "confirmApproveAccount", "approval translations");

let adminPage = fs.readFileSync(adminPagePath, "utf8");

adminPage = replaceOnce(
  adminPage,
  "approve confirmation type",
  `type ConfirmType =\n  | "reject"`,
  `type ConfirmType =\n  | "approve"\n  | "reject"`,
);

adminPage = replaceOnce(
  adminPage,
  "approve confirmation label",
  `  const labels: Record<ConfirmType, string> = {\n    reject:`,
  `  const labels: Record<ConfirmType, string> = {\n    approve: adminText.confirmApproveAccount,\n    reject:`,
);

adminPage = replaceOnce(
  adminPage,
  "remove activate plan mode",
  `  mode: "activate" | "change" | "renew";`,
  `  mode: "change" | "renew";`,
);

adminPage = replaceOnce(
  adminPage,
  "remove activate plan title",
  `  const modeLabel: Record<PlanModalState["mode"], string> = {\n    activate: adminText.planActivateTitle,\n    change: adminText.planChangeTitle,`,
  `  const modeLabel: Record<PlanModalState["mode"], string> = {\n    change: adminText.planChangeTitle,`,
);

adminPage = replaceRegexOnce(
  adminPage,
  "account-only approval action",
  /  const doApprove = async \(merchantId: string, plan: PlanKey\) => \{[\s\S]*?\n  \};\n\n  const doReject/,
  `  const doApprove = async (merchantId: string) => {\n    const m = merchants.find((x) => x.id === merchantId)!;\n\n    try {\n      const apiMerchant = await syncMerchantStatusToApi(merchantId, "approved");\n      updateMerchant(merchantId, apiMerchant);\n      logAction("approved", m, adminText.logMerchantApproved);\n      await refreshMerchantsFromApi();\n      toast.success(\n        formatAdminMessage(adminText.toastMerchantApproved, {\n          store: m.store_name,\n        }),\n      );\n      setConfirmDialog(null);\n    } catch (error) {\n      console.error("Approve merchant failed:", error);\n      const message = getStatusSyncErrorMessage(error);\n      if (message) toast.error(message);\n    }\n  };\n\n  const doReject`,
  `const doApprove = async (merchantId: string)`,
);

adminPage = replaceOnce(
  adminPage,
  "approve confirmation handler",
  `    if (type === "reject") doReject(merchantId, reason);`,
  `    if (type === "approve") doApprove(merchantId);\n    else if (type === "reject") doReject(merchantId, reason);`,
);

adminPage = adminPage.split('openPlan("activate", m)').join('openConfirm("approve", m)');

adminPage = replaceRegexOnce(
  adminPage,
  "mobile approval independent of subscription permission",
  /\{canManageSubscriptions && \(\n\s*<DropdownMenuItem\n\s*onClick=\{onApprove\}\n\s*className="text-green-600 focus:text-green-600"\n\s*>\n\s*<CheckCircle\n\s*className=\{`h-3\.5 w-3\.5 \$\{iconSpacingClass\}`\}\n\s*\/>\n\s*\{adminText\.actionApproveActivate\}\n\s*<\/DropdownMenuItem>\n\s*\)\}/,
  `<DropdownMenuItem\n                onClick={onApprove}\n                className="text-green-600 focus:text-green-600"\n              >\n                <CheckCircle\n                  className={\`h-3.5 w-3.5 \${iconSpacingClass}\`}\n                />\n                {adminText.actionApprove}\n              </DropdownMenuItem>`,
  `onClick={onApprove}\n                className="text-green-600 focus:text-green-600"`,
);

adminPage = replaceRegexOnce(
  adminPage,
  "desktop approval independent of subscription permission",
  /\{canManageSubscriptions && \(\n\s*<Button\n\s*size="sm"\n\s*className="h-7 bg-green-600 px-2 text-xs text-white hover:bg-green-700"\n\s*onClick=\{onApprove\}\n\s*>\n\s*\{adminText\.actionApprove\}\n\s*<\/Button>\n\s*\)\}/,
  `<Button\n            size="sm"\n            className="h-7 bg-green-600 px-2 text-xs text-white hover:bg-green-700"\n            onClick={onApprove}\n          >\n            {adminText.actionApprove}\n          </Button>`,
  `className="h-7 bg-green-600 px-2 text-xs text-white hover:bg-green-700"\n            onClick={onApprove}`,
);

adminPage = replaceOnce(
  adminPage,
  "mobile quick approval permission",
  `                            {canManageMerchants && canManageSubscriptions && m.status === "pending_activation" && (`,
  `                            {canManageMerchants && m.status === "pending_activation" && (`,
);

adminPage = adminPage.split("{adminText.actionApproveActivate}").join("{adminText.actionApprove}");

adminPage = replaceOnce(
  adminPage,
  "plan modal confirmation routing",
  `          onConfirm={(plan) => {\n            if (planModal.mode === "activate")\n              doApprove(planModal.merchantId, plan);\n            else if (planModal.mode === "change")\n              doChangePlan(planModal.merchantId, plan);\n            else doRenewPlan(planModal.merchantId, plan);\n          }}`,
  `          onConfirm={(plan) => {\n            if (planModal.mode === "change")\n              doChangePlan(planModal.merchantId, plan);\n            else doRenewPlan(planModal.merchantId, plan);\n          }}`,
);

if (adminPage.includes('openPlan("activate", m)')) {
  throw new Error("An activation-plan approval path still exists");
}
if (adminPage.includes('mode === "activate"')) {
  throw new Error("The plan modal still handles account activation");
}

fs.writeFileSync(adminPagePath, adminPage, "utf8");

let testSource = fs.readFileSync(testPath, "utf8");

testSource = replaceOnce(
  testSource,
  "pending lifecycle assertions",
  `  assert.deepEqual(\n    merchantList.body.merchants.map((merchant) => merchant.id),\n    ["merchant-a"],\n  );\n\n  const unverifiedLogin =`,
  `  assert.deepEqual(\n    merchantList.body.merchants.map((merchant) => merchant.id),\n    ["merchant-a"],\n  );\n  assert.equal(merchantList.body.merchants[0].account_status, "pending_review");\n  assert.equal(merchantList.body.merchants[0].onboarding_status, "pending_review");\n  assert.equal(merchantList.body.merchants[0].trial_status, "eligible");\n  assert.equal(merchantList.body.merchants[0].signup_source, "direct");\n  assert.equal(merchantList.body.merchants[0].requested_plan, null);\n\n  const unverifiedLogin =`,
);

testSource = replaceOnce(
  testSource,
  "approval lifecycle integration assertions",
  `  const statusUpdate = await fetch(\`${baseUrl}/api/auth/merchants/merchant-a/status\`, {\n    method: "PATCH",\n    headers: { ...assistantHeaders, "Content-Type": "application/json" },\n    body: JSON.stringify({ status: "suspended", reason: "test" }),\n  });\n  assert.equal(statusUpdate.status, 200);`,
  `  const approval = await json(await fetch(\n    \`${baseUrl}/api/auth/merchants/merchant-a/status\`,\n    {\n      method: "PATCH",\n      headers: { ...assistantHeaders, "Content-Type": "application/json" },\n      body: JSON.stringify({ status: "approved" }),\n    },\n  ));\n  assert.equal(approval.response.status, 200);\n  assert.equal(approval.body.merchant.status, "approved");\n  assert.equal(approval.body.merchant.account_status, "approved");\n  assert.equal(approval.body.merchant.onboarding_status, "awaiting_channel");\n  assert.equal(approval.body.merchant.trial_status, "not_started");\n  assert.equal(approval.body.merchant.subscription_started_at, undefined);\n  assert.equal(approval.body.merchant.subscription_expires_at, undefined);\n  assert.ok(Number.isFinite(new Date(approval.body.merchant.approved_at).getTime()));\n  assert.ok(Number.isFinite(new Date(approval.body.merchant.channel_activation_deadline).getTime()));\n  assert.equal(\n    new Date(approval.body.merchant.channel_activation_deadline).getTime() -\n      new Date(approval.body.merchant.approved_at).getTime(),\n    10 * 24 * 60 * 60 * 1000,\n  );\n\n  const statusUpdate = await fetch(\`${baseUrl}/api/auth/merchants/merchant-a/status\`, {\n    method: "PATCH",\n    headers: { ...assistantHeaders, "Content-Type": "application/json" },\n    body: JSON.stringify({ status: "suspended", reason: "test" }),\n  });\n  assert.equal(statusUpdate.status, 200);`,
);

fs.writeFileSync(testPath, testSource, "utf8");
console.log("Account approval lifecycle finishing changes applied.");
