import fs from "node:fs";

const authPath = "artifacts/api-server/src/routes/auth.ts";
const typesPath = "artifacts/fawri/src/lib/types.ts";
const adminPagePath = "artifacts/fawri/src/pages/AdminPage.tsx";
const translationsPath = "artifacts/fawri/src/lib/admin-translations.ts";
const testPath = "artifacts/api-server/tests/admin-permissions.integration.test.mjs";

function replaceOnce(source, label, before, after) {
  if (source.includes(after)) return source;
  const first = source.indexOf(before);
  if (first === -1) throw new Error(`Could not find ${label}`);
  if (source.indexOf(before, first + before.length) !== -1) {
    throw new Error(`Found multiple matches for ${label}`);
  }
  return source.slice(0, first) + after + source.slice(first + before.length);
}

function replaceAllExact(source, label, before, after, expectedCount) {
  const count = source.split(before).length - 1;
  if (count === 0 && source.includes(after)) return source;
  if (count !== expectedCount) {
    throw new Error(`Expected ${expectedCount} matches for ${label}, found ${count}`);
  }
  return source.split(before).join(after);
}

let auth = fs.readFileSync(authPath, "utf8");

auth = replaceOnce(
  auth,
  "merchant lifecycle type declarations",
  `type MerchantStatus = "pending_activation" | "approved" | "rejected" | "suspended";\ntype AdminRole = "owner_admin" | "assistant_admin";`,
  `type MerchantStatus = "pending_activation" | "approved" | "rejected" | "suspended";\ntype AccountStatus = "pending_review" | "approved" | "rejected" | "suspended";\ntype OnboardingStatus =\n  | "pending_review"\n  | "awaiting_channel"\n  | "channel_connected"\n  | "activation_expired";\ntype TrialStatus =\n  | "eligible"\n  | "not_started"\n  | "active"\n  | "expired"\n  | "already_used"\n  | "ineligible";\ntype SignupSource = "landing_trial" | "landing_plan" | "login" | "direct";\ntype RequestedPlan = "silver" | "gold" | "diamond";\ntype AdminRole = "owner_admin" | "assistant_admin";`,
);

auth = replaceOnce(
  auth,
  "merchant lifecycle fields",
  `  otp_verified?: boolean;\n  subscription_started_at?: string;`,
  `  otp_verified?: boolean;\n  account_status?: AccountStatus;\n  onboarding_status?: OnboardingStatus;\n  trial_status?: TrialStatus;\n  signup_source?: SignupSource;\n  requested_plan?: RequestedPlan | null;\n  approved_at?: string;\n  channel_activation_deadline?: string;\n  first_channel_connected_at?: string;\n  trial_started_at?: string;\n  trial_expires_at?: string;\n  subscription_started_at?: string;`,
);

auth = replaceOnce(
  auth,
  "activation window constant",
  `const OTP_RESEND_COOLDOWN_SECONDS = Number(\n  process.env.AUTH_OTP_RESEND_COOLDOWN_SECONDS || 60,\n);`,
  `const OTP_RESEND_COOLDOWN_SECONDS = Number(\n  process.env.AUTH_OTP_RESEND_COOLDOWN_SECONDS || 60,\n);\nconst ACCOUNT_CHANNEL_ACTIVATION_DAYS = 10;\nconst ACCOUNT_CHANNEL_ACTIVATION_MS =\n  ACCOUNT_CHANNEL_ACTIVATION_DAYS * 24 * 60 * 60 * 1000;`,
);

auth = replaceOnce(
  auth,
  "merchant lifecycle normalization helpers",
  `function publicMerchant(merchant: Merchant): SafeMerchant {\n  const { password, ...safeMerchant } = merchant;\n  void password;\n  return safeMerchant;\n}`,
  `function isAccountStatus(value: unknown): value is AccountStatus {\n  return ["pending_review", "approved", "rejected", "suspended"].includes(\n    String(value),\n  );\n}\n\nfunction isOnboardingStatus(value: unknown): value is OnboardingStatus {\n  return [\n    "pending_review",\n    "awaiting_channel",\n    "channel_connected",\n    "activation_expired",\n  ].includes(String(value));\n}\n\nfunction isTrialStatus(value: unknown): value is TrialStatus {\n  return [\n    "eligible",\n    "not_started",\n    "active",\n    "expired",\n    "already_used",\n    "ineligible",\n  ].includes(String(value));\n}\n\nfunction isSignupSource(value: unknown): value is SignupSource {\n  return ["landing_trial", "landing_plan", "login", "direct"].includes(\n    String(value),\n  );\n}\n\nfunction isRequestedPlan(value: unknown): value is RequestedPlan {\n  return ["silver", "gold", "diamond"].includes(String(value));\n}\n\nfunction deriveAccountStatus(status: MerchantStatus): AccountStatus {\n  if (status === "pending_activation") return "pending_review";\n  return status;\n}\n\nfunction normalizeMerchantLifecycle(merchant: Merchant): Merchant {\n  if (merchant.is_admin === true) return merchant;\n\n  const accountStatus = isAccountStatus(merchant.account_status)\n    ? merchant.account_status\n    : deriveAccountStatus(merchant.status);\n  const hasLegacySubscription = Boolean(\n    merchant.subscription_started_at || merchant.subscription_expires_at,\n  );\n  const onboardingStatus = isOnboardingStatus(merchant.onboarding_status)\n    ? merchant.onboarding_status\n    : accountStatus === "approved" && hasLegacySubscription\n      ? "channel_connected"\n      : accountStatus === "approved"\n        ? "awaiting_channel"\n        : "pending_review";\n  const trialStatus = isTrialStatus(merchant.trial_status)\n    ? merchant.trial_status\n    : hasLegacySubscription\n      ? "ineligible"\n      : merchant.trial_started_at\n        ? new Date(merchant.trial_expires_at || 0).getTime() > Date.now()\n          ? "active"\n          : "expired"\n        : accountStatus === "approved"\n          ? "not_started"\n          : "eligible";\n\n  return {\n    ...merchant,\n    account_status: accountStatus,\n    onboarding_status: onboardingStatus,\n    trial_status: trialStatus,\n    signup_source: isSignupSource(merchant.signup_source)\n      ? merchant.signup_source\n      : "direct",\n    requested_plan:\n      merchant.requested_plan === null || isRequestedPlan(merchant.requested_plan)\n        ? merchant.requested_plan ?? null\n        : null,\n  };\n}\n\nfunction publicMerchant(merchant: Merchant): SafeMerchant {\n  const { password, ...safeMerchant } = normalizeMerchantLifecycle(merchant);\n  void password;\n  return safeMerchant;\n}`,
);

auth = replaceOnce(
  auth,
  "database lifecycle normalization",
  `          })))\n        : [],`,
  `          }))).map(normalizeMerchantLifecycle)\n        : [],`,
);

auth = replaceOnce(
  auth,
  "existing unverified signup lifecycle reset",
  `      existing.status = "pending_activation";\n\n      const otp = issueOtp(db, phone, "signup");`,
  `      existing.status = "pending_activation";\n      existing.account_status = "pending_review";\n      existing.onboarding_status = "pending_review";\n      existing.trial_status = "eligible";\n      existing.signup_source = "direct";\n      existing.requested_plan = null;\n      existing.approved_at = undefined;\n      existing.channel_activation_deadline = undefined;\n\n      const otp = issueOtp(db, phone, "signup");`,
);

auth = replaceOnce(
  auth,
  "new signup lifecycle defaults",
  `    otp_verified: false,\n    warning_stage: 0,`,
  `    otp_verified: false,\n    account_status: "pending_review",\n    onboarding_status: "pending_review",\n    trial_status: "eligible",\n    signup_source: "direct",\n    requested_plan: null,\n    warning_stage: 0,`,
);

auth = replaceOnce(
  auth,
  "OTP lifecycle confirmation",
  `  merchant.otp_verified = true;\n  merchant.status = "pending_activation";\n  writeDb(db);`,
  `  merchant.otp_verified = true;\n  merchant.status = "pending_activation";\n  merchant.account_status = "pending_review";\n  merchant.onboarding_status = "pending_review";\n  if (!isTrialStatus(merchant.trial_status)) merchant.trial_status = "eligible";\n  writeDb(db);`,
);

auth = replaceOnce(
  auth,
  "status transition lifecycle",
  `  const previousStatus = merchant.status;\n  merchant.status = status;\n  appendAdminLog(`,
  `  const previousStatus = merchant.status;\n  const transitionAt = now();\n  merchant.status = status;\n\n  if (status === "approved") {\n    merchant.account_status = "approved";\n\n    if (previousStatus !== "suspended") {\n      merchant.approved_at = transitionAt;\n      merchant.channel_activation_deadline = new Date(\n        new Date(transitionAt).getTime() + ACCOUNT_CHANNEL_ACTIVATION_MS,\n      ).toISOString();\n\n      if (merchant.onboarding_status !== "channel_connected") {\n        merchant.onboarding_status = "awaiting_channel";\n      }\n      if (merchant.trial_status === "eligible" || !merchant.trial_status) {\n        merchant.trial_status = "not_started";\n      }\n    }\n  } else if (status === "pending_activation") {\n    merchant.account_status = "pending_review";\n    merchant.onboarding_status = "pending_review";\n    merchant.approved_at = undefined;\n    merchant.channel_activation_deadline = undefined;\n    if (merchant.trial_status === "not_started" || !merchant.trial_status) {\n      merchant.trial_status = "eligible";\n    }\n  } else if (status === "rejected") {\n    merchant.account_status = "rejected";\n    merchant.onboarding_status = "pending_review";\n    merchant.channel_activation_deadline = undefined;\n  } else {\n    merchant.account_status = "suspended";\n  }\n\n  appendAdminLog(`,
);

fs.writeFileSync(authPath, auth, "utf8");

let types = fs.readFileSync(typesPath, "utf8");
types = replaceOnce(
  types,
  "frontend lifecycle type declarations",
  `export type MerchantStatus = 'pending_activation' | 'approved' | 'rejected' | 'suspended';\nexport type AdminRole = 'owner_admin' | 'assistant_admin';`,
  `export type MerchantStatus = 'pending_activation' | 'approved' | 'rejected' | 'suspended';\nexport type AccountStatus = 'pending_review' | 'approved' | 'rejected' | 'suspended';\nexport type OnboardingStatus =\n  | 'pending_review'\n  | 'awaiting_channel'\n  | 'channel_connected'\n  | 'activation_expired';\nexport type TrialStatus =\n  | 'eligible'\n  | 'not_started'\n  | 'active'\n  | 'expired'\n  | 'already_used'\n  | 'ineligible';\nexport type SignupSource = 'landing_trial' | 'landing_plan' | 'login' | 'direct';\nexport type RequestedPlan = 'silver' | 'gold' | 'diamond';\nexport type AdminRole = 'owner_admin' | 'assistant_admin';`,
);
types = replaceOnce(
  types,
  "frontend lifecycle fields",
  `  admin_enabled?: boolean;\n\n  subscription_started_at?: string;`,
  `  admin_enabled?: boolean;\n  otp_verified?: boolean;\n  account_status?: AccountStatus;\n  onboarding_status?: OnboardingStatus;\n  trial_status?: TrialStatus;\n  signup_source?: SignupSource;\n  requested_plan?: RequestedPlan | null;\n  approved_at?: string;\n  channel_activation_deadline?: string;\n  first_channel_connected_at?: string;\n  trial_started_at?: string;\n  trial_expires_at?: string;\n\n  subscription_started_at?: string;`,
);
fs.writeFileSync(typesPath, types, "utf8");

let translations = fs.readFileSync(translationsPath, "utf8");
translations = replaceOnce(
  translations,
  "Arabic approve confirmation",
  `    dir: "rtl" as const,\n\n    confirmRejectStore:`,
  `    dir: "rtl" as const,\n\n    confirmApproveAccount: "قبول حساب المتجر",\n    confirmRejectStore:`,
);
translations = replaceOnce(
  translations,
  "English approve confirmation",
  `    dir: "ltr" as const,\n\n    confirmRejectStore:`,
  `    dir: "ltr" as const,\n\n    confirmApproveAccount: "Approve merchant account",\n    confirmRejectStore:`,
);
translations = replaceOnce(
  translations,
  "Kurdish approve confirmation",
  `  dir: "rtl" as const,\n  confirmRejectStore:`,
  `  dir: "rtl" as const,\n  confirmApproveAccount: "پەسەندکردنی هەژماری فرۆشگا",\n  confirmRejectStore:`,
);
translations = replaceOnce(translations, "Arabic approved status", `    merchantStatusApproved: "مفعّل",`, `    merchantStatusApproved: "مقبول",`);
translations = replaceOnce(translations, "English approved status", `    merchantStatusApproved: "Active",`, `    merchantStatusApproved: "Approved",`);
translations = replaceOnce(translations, "Kurdish approved status", `  merchantStatusApproved: "چالاككراو",`, `  merchantStatusApproved: "پەسەندکراو",`);
translations = replaceOnce(translations, "Arabic approved tab", `    mainTabApproved: "المفعَّلون",`, `    mainTabApproved: "المقبولون",`);
translations = replaceOnce(translations, "English approved tab", `    mainTabApproved: "Activated",`, `    mainTabApproved: "Approved",`);
translations = replaceOnce(translations, "Kurdish approved tab", `  mainTabApproved: "چالاككراو",`, `  mainTabApproved: "پەسەندکراو",`);
translations = replaceOnce(translations, "Arabic approve action", `    actionApproveActivate: "موافقة وتفعيل",\n    actionApprove: "موافقة",`, `    actionApproveActivate: "قبول الحساب",\n    actionApprove: "قبول الحساب",`);
translations = replaceOnce(translations, "English approve action", `    actionApproveActivate: "Approve and activate",\n    actionApprove: "Approve",`, `    actionApproveActivate: "Approve account",\n    actionApprove: "Approve account",`);
translations = replaceOnce(translations, "Kurdish approve action", `  actionApproveActivate: "پەسەندکردن و چالاككردن",\n  actionApprove: "پەسەندکردن",`, `  actionApproveActivate: "پەسەندکردنی هەژمار",\n  actionApprove: "پەسەندکردنی هەژمار",`);
translations = replaceOnce(translations, "Arabic approved messages", `    logMerchantApproved: "قُبل المتجر — خطة {plan}",\n    toastMerchantApproved:\n      "تم قبول {store} وتفعيل خطة {plan}",`, `    logMerchantApproved: "تم قبول حساب المتجر",\n    toastMerchantApproved:\n      "تم قبول حساب {store}. لديه 10 أيام لربط أول قناة.",`);
translations = replaceOnce(translations, "English approved messages", `    logMerchantApproved: "Store approved — plan {plan}",\n    toastMerchantApproved:\n      "{store} was approved and the {plan} plan was activated.",`, `    logMerchantApproved: "Merchant account approved",\n    toastMerchantApproved:\n      "{store} was approved. The merchant has 10 days to connect the first channel.",`);
translations = replaceOnce(translations, "Kurdish approved messages", `  logMerchantApproved: "فرۆشگا پەسەندکرا — پلانی {plan}",\n  toastMerchantApproved: "{store} پەسەندکرا و پلانی {plan} چالاككرا",`, `  logMerchantApproved: "هەژماری فرۆشگا پەسەندکرا",\n  toastMerchantApproved: "هەژماری {store} پەسەندکرا. 10 ڕۆژی هەیە بۆ بەستنی یەکەم کەناڵ.",`);
fs.writeFileSync(translationsPath, translations, "utf8");

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
adminPage = replaceAllExact(
  adminPage,
  "plan modal activate mode",
  `  mode: "activate" | "change" | "renew";`,
  `  mode: "change" | "renew";`,
  1,
);
adminPage = replaceOnce(
  adminPage,
  "plan modal labels",
  `  const modeLabel: Record<PlanModalState["mode"], string> = {\n    activate: adminText.planActivateTitle,\n    change: adminText.planChangeTitle,`,
  `  const modeLabel: Record<PlanModalState["mode"], string> = {\n    change: adminText.planChangeTitle,`,
);
adminPage = replaceOnce(
  adminPage,
  "approve account action",
  `  const doApprove = async (merchantId: string, plan: PlanKey) => {\n    const m = merchants.find((x) => x.id === merchantId)!;\n\n    try {\n      const previousSubscriptions = getSubscriptions();\n      const apiMerchant = await syncMerchantStatusToApi(merchantId, "approved");\n      updateMerchant(merchantId, apiMerchant);\n\n      try {\n        const subscription = createSubscriptionForPlan(merchantId, plan);\n        const syncedMerchant = await syncMerchantSubscriptionToApi(\n          merchantId,\n          subscription,\n        );\n        updateMerchant(merchantId, syncedMerchant);\n      } catch (error) {\n        saveSubscriptions(previousSubscriptions);\n\n        const revertedMerchant = await syncMerchantStatusToApi(\n          merchantId,\n          "pending_activation",\n        );\n        updateMerchant(merchantId, revertedMerchant);\n\n        throw error;\n      }\n      logAction(\n        "plan_activated",\n        m,\n        formatAdminMessage(adminText.logPlanLabel, {\n          plan: planNames[plan],\n        }),\n        { plan },\n      );\n      logAction(\n        "approved",\n        m,\n        formatAdminMessage(adminText.logMerchantApproved, {\n          plan: planNames[plan],\n        }),\n        { plan },\n      );\n      refreshData();\n      toast.success(\n        formatAdminMessage(adminText.toastMerchantApproved, {\n          store: m.store_name,\n          plan: planNames[plan],\n        }),\n      );\n      setPlanModal(null);\n    } catch (error) {\n      console.error("Approve merchant failed:", error);\n      const message = getStatusSyncErrorMessage(error);\n      if (message) toast.error(message);\n    }\n  };`,
  `  const doApprove = async (merchantId: string) => {\n    const m = merchants.find((x) => x.id === merchantId)!;\n\n    try {\n      const apiMerchant = await syncMerchantStatusToApi(merchantId, "approved");\n      updateMerchant(merchantId, apiMerchant);\n      logAction("approved", m, adminText.logMerchantApproved);\n      await refreshMerchantsFromApi();\n      toast.success(\n        formatAdminMessage(adminText.toastMerchantApproved, {\n          store: m.store_name,\n        }),\n      );\n      setConfirmDialog(null);\n    } catch (error) {\n      console.error("Approve merchant failed:", error);\n      const message = getStatusSyncErrorMessage(error);\n      if (message) toast.error(message);\n    }\n  };`,
);
adminPage = replaceOnce(
  adminPage,
  "approve confirmation handler",
  `    if (type === "reject") doReject(merchantId, reason);`,
  `    if (type === "approve") doApprove(merchantId);\n    else if (type === "reject") doReject(merchantId, reason);`,
);
adminPage = replaceAllExact(
  adminPage,
  "approval plan opener",
  `openPlan("activate", m)`,
  `openConfirm("approve", m)`,
  4,
);
adminPage = replaceOnce(
  adminPage,
  "mobile approval permission",
  `              {canManageSubscriptions && (\n                <DropdownMenuItem\n                  onClick={onApprove}\n                  className="text-green-600 focus:text-green-600"\n                >\n                  <CheckCircle\n                    className={\`h-3.5 w-3.5 \${iconSpacingClass}\`}\n                  />\n                  {adminText.actionApproveActivate}\n                </DropdownMenuItem>\n              )}`,
  `              <DropdownMenuItem\n                onClick={onApprove}\n                className="text-green-600 focus:text-green-600"\n              >\n                <CheckCircle\n                  className={\`h-3.5 w-3.5 \${iconSpacingClass}\`}\n                />\n                {adminText.actionApprove}\n              </DropdownMenuItem>`,
);
adminPage = replaceOnce(
  adminPage,
  "desktop approval permission",
  `          {canManageSubscriptions && (\n            <Button\n              size="sm"\n              className="h-7 bg-green-600 px-2 text-xs text-white hover:bg-green-700"\n              onClick={onApprove}\n            >\n              {adminText.actionApprove}\n            </Button>\n          )}`,
  `          <Button\n            size="sm"\n            className="h-7 bg-green-600 px-2 text-xs text-white hover:bg-green-700"\n            onClick={onApprove}\n          >\n            {adminText.actionApprove}\n          </Button>`,
);
adminPage = replaceOnce(
  adminPage,
  "mobile quick approval permission",
  `                            {canManageMerchants && canManageSubscriptions && m.status === "pending_activation" && (`,
  `                            {canManageMerchants && m.status === "pending_activation" && (`,
);
adminPage = replaceOnce(
  adminPage,
  "mobile quick approval label",
  `                                {adminText.actionApproveActivate}`,
  `                                {adminText.actionApprove}`,
);
adminPage = replaceOnce(
  adminPage,
  "plan modal confirmation routing",
  `          onConfirm={(plan) => {\n            if (planModal.mode === "activate")\n              doApprove(planModal.merchantId, plan);\n            else if (planModal.mode === "change")\n              doChangePlan(planModal.merchantId, plan);\n            else doRenewPlan(planModal.merchantId, plan);\n          }}`,
  `          onConfirm={(plan) => {\n            if (planModal.mode === "change")\n              doChangePlan(planModal.merchantId, plan);\n            else doRenewPlan(planModal.merchantId, plan);\n          }}`,
);
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

console.log("Account approval lifecycle changes applied.");
