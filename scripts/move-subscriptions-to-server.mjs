import fs from "node:fs";
import { execSync } from "node:child_process";

const authPath = "artifacts/api-server/src/routes/auth.ts";
const testPath = "artifacts/api-server/tests/admin-permissions.integration.test.mjs";
const adminPagePath = "artifacts/fawri/src/pages/AdminPage.tsx";
const storePath = "artifacts/fawri/src/lib/store.ts";
const translationsPath = "artifacts/fawri/src/lib/admin-translations.ts";
const selfPath = "scripts/move-subscriptions-to-server.mjs";
const branch = "feature/admin-permissions-v2";

function run(command) {
  console.log(`\n> ${command}`);
  execSync(command, { stdio: "inherit", shell: "/bin/bash" });
}

function replaceOnce(source, label, before, after) {
  const count = source.split(before).length - 1;
  if (count !== 1) {
    throw new Error(`${label}: expected one match, found ${count}`);
  }
  return source.replace(before, after);
}

function replaceBetween(source, label, startMarker, endMarker, replacement) {
  const start = source.indexOf(startMarker);
  const end = source.indexOf(endMarker, start + startMarker.length);
  if (start === -1 || end === -1) {
    throw new Error(`${label}: markers not found`);
  }
  return source.slice(0, start) + replacement + source.slice(end);
}

let auth = fs.readFileSync(authPath, "utf8");

auth = replaceOnce(
  auth,
  "subscription backend types",
  `type SafeMerchant = Omit<Merchant, "password">;`,
  `type SafeMerchant = Omit<Merchant, "password">;\n\ntype SubscriptionPlan = "silver" | "gold" | "diamond" | "trial";\ntype SubscriptionStatus =\n  | "pending_activation"\n  | "active"\n  | "expired"\n  | "replies_exhausted"\n  | "suspended";\n\ntype SubscriptionRecord = {\n  id: string;\n  merchant_id: string;\n  plan_name: SubscriptionPlan;\n  price_iqd: number;\n  reply_limit: number;\n  replies_used: number;\n  replies_remaining: number;\n  start_date: string;\n  expires_at: string;\n  status: SubscriptionStatus;\n  auto_reply_enabled: boolean;\n  emergency_credit_used: number;\n  emergency_credit_amount: number;\n  emergency_credit_remaining: number;\n  emergency_credit_activated: boolean;\n  pending_next_cycle_deduction: number;\n};\n\nconst SUBSCRIPTION_PLAN_CONFIG = {\n  silver: { price_iqd: 25000, reply_limit: 4000, emergency_credit_amount: 400 },\n  gold: { price_iqd: 49000, reply_limit: 8000, emergency_credit_amount: 800 },\n  diamond: { price_iqd: 75000, reply_limit: 14000, emergency_credit_amount: 1400 },\n} as const;\n\nconst SUBSCRIPTION_DURATION_MS = 30 * 24 * 60 * 60 * 1000;`,
);

auth = replaceOnce(
  auth,
  "subscriptions in database type",
  `type AuthDb = {\n  merchants: Merchant[];\n  otps: OtpRecord[];`,
  `type AuthDb = {\n  merchants: Merchant[];\n  subscriptions: SubscriptionRecord[];\n  otps: OtpRecord[];`,
);

auth = replaceOnce(
  auth,
  "subscription normalization helpers",
  `function deriveAccountStatus(status: MerchantStatus): AccountStatus {`,
  `function isSubscriptionPlan(value: unknown): value is SubscriptionPlan {\n  return ["silver", "gold", "diamond", "trial"].includes(String(value));\n}\n\nfunction isSubscriptionStatus(value: unknown): value is SubscriptionStatus {\n  return [\n    "pending_activation",\n    "active",\n    "expired",\n    "replies_exhausted",\n    "suspended",\n  ].includes(String(value));\n}\n\nfunction normalizeNonNegativeInteger(value: unknown): number {\n  const numberValue = Number(value);\n  return Number.isInteger(numberValue) && numberValue >= 0 ? numberValue : 0;\n}\n\nfunction normalizeSubscriptionRecord(value: unknown): SubscriptionRecord | null {\n  if (!value || typeof value !== "object" || Array.isArray(value)) return null;\n  const record = value as Partial<SubscriptionRecord>;\n  const merchantId = String(record.merchant_id || "").trim();\n  const id = String(record.id || "").trim();\n  const startDate = new Date(String(record.start_date || ""));\n  const expiresDate = new Date(String(record.expires_at || ""));\n\n  if (\n    !merchantId ||\n    !id ||\n    !isSubscriptionPlan(record.plan_name) ||\n    !isSubscriptionStatus(record.status) ||\n    !Number.isFinite(startDate.getTime()) ||\n    !Number.isFinite(expiresDate.getTime()) ||\n    expiresDate.getTime() <= startDate.getTime()\n  ) {\n    return null;\n  }\n\n  const replyLimit = normalizeNonNegativeInteger(record.reply_limit);\n  const repliesUsed = Math.min(\n    normalizeNonNegativeInteger(record.replies_used),\n    replyLimit,\n  );\n  const emergencyAmount = normalizeNonNegativeInteger(\n    record.emergency_credit_amount,\n  );\n  const emergencyUsed = Math.min(\n    normalizeNonNegativeInteger(record.emergency_credit_used),\n    emergencyAmount,\n  );\n\n  return {\n    id,\n    merchant_id: merchantId,\n    plan_name: record.plan_name,\n    price_iqd: normalizeNonNegativeInteger(record.price_iqd),\n    reply_limit: replyLimit,\n    replies_used: repliesUsed,\n    replies_remaining: Math.max(0, replyLimit - repliesUsed),\n    start_date: startDate.toISOString(),\n    expires_at: expiresDate.toISOString(),\n    status: record.status,\n    auto_reply_enabled: record.auto_reply_enabled === true,\n    emergency_credit_used: emergencyUsed,\n    emergency_credit_amount: emergencyAmount,\n    emergency_credit_remaining: Math.max(0, emergencyAmount - emergencyUsed),\n    emergency_credit_activated: record.emergency_credit_activated === true,\n    pending_next_cycle_deduction: normalizeNonNegativeInteger(\n      record.pending_next_cycle_deduction,\n    ),\n  };\n}\n\nfunction normalizeSubscriptions(value: unknown): SubscriptionRecord[] {\n  if (!Array.isArray(value)) return [];\n  const byMerchant = new Map<string, SubscriptionRecord>();\n\n  for (const item of value) {\n    const subscription = normalizeSubscriptionRecord(item);\n    if (!subscription) continue;\n    const current = byMerchant.get(subscription.merchant_id);\n    if (\n      !current ||\n      new Date(subscription.start_date).getTime() >=\n        new Date(current.start_date).getTime()\n    ) {\n      byMerchant.set(subscription.merchant_id, subscription);\n    }\n  }\n\n  return [...byMerchant.values()];\n}\n\nfunction createPaidSubscription(\n  merchantId: string,\n  plan: Exclude<SubscriptionPlan, "trial">,\n  existing?: SubscriptionRecord,\n): SubscriptionRecord {\n  const config = SUBSCRIPTION_PLAN_CONFIG[plan];\n  const startDate = new Date();\n  const emergencyDeduction = Math.min(\n    existing?.pending_next_cycle_deduction || 0,\n    config.reply_limit,\n  );\n\n  return {\n    id: existing?.id || makeId("subscription"),\n    merchant_id: merchantId,\n    plan_name: plan,\n    price_iqd: config.price_iqd,\n    reply_limit: config.reply_limit,\n    replies_used: emergencyDeduction,\n    replies_remaining: config.reply_limit - emergencyDeduction,\n    start_date: startDate.toISOString(),\n    expires_at: new Date(\n      startDate.getTime() + SUBSCRIPTION_DURATION_MS,\n    ).toISOString(),\n    status: emergencyDeduction >= config.reply_limit\n      ? "replies_exhausted"\n      : "active",\n    auto_reply_enabled: emergencyDeduction < config.reply_limit,\n    emergency_credit_used: 0,\n    emergency_credit_amount: config.emergency_credit_amount,\n    emergency_credit_remaining: config.emergency_credit_amount,\n    emergency_credit_activated: false,\n    pending_next_cycle_deduction: 0,\n  };\n}\n\nfunction deriveAccountStatus(status: MerchantStatus): AccountStatus {`,
);

auth = replaceOnce(
  auth,
  "initial subscriptions database",
  `  return {\n    merchants: [],\n    otps: [],`,
  `  return {\n    merchants: [],\n    subscriptions: [],\n    otps: [],`,
);

auth = replaceOnce(
  auth,
  "load subscriptions database",
  `      merchants: Array.isArray(parsed.merchants)\n        ? normalizeAdminRoles(parsed.merchants.map((merchant) => ({`,
  `      merchants: Array.isArray(parsed.merchants)\n        ? normalizeAdminRoles(parsed.merchants.map((merchant) => ({`,
);

auth = replaceOnce(
  auth,
  "insert normalized subscriptions",
  `        : [],\n      otps: Array.isArray(parsed.otps) ? removeExpiredOtps(parsed.otps) : [],`,
  `        : [],\n      subscriptions: normalizeSubscriptions(parsed.subscriptions),\n      otps: Array.isArray(parsed.otps) ? removeExpiredOtps(parsed.otps) : [],`,
);

auth = replaceOnce(
  auth,
  "delete merchant subscription",
  `  db.merchants = db.merchants.filter(\n    (item) => item.id !== merchantId,\n  );\n\n  db.otps = db.otps.filter(`,
  `  db.merchants = db.merchants.filter(\n    (item) => item.id !== merchantId,\n  );\n  db.subscriptions = db.subscriptions.filter(\n    (subscription) => subscription.merchant_id !== merchantId,\n  );\n\n  db.otps = db.otps.filter(`,
);

const subscriptionRoutes = `router.get("/admin/subscriptions", (req: Request, res: Response) => {\n  const admin = requireAdminPermission(req, res, "manage_subscriptions");\n  if (!admin) return;\n\n  const db = ensureDb();\n  return res.json({\n    ok: true,\n    subscriptions: [...db.subscriptions].sort(\n      (left, right) =>\n        new Date(right.start_date).getTime() -\n        new Date(left.start_date).getTime(),\n    ),\n  });\n});\n\nrouter.post("/admin/subscriptions/migrate", (req: Request, res: Response) => {\n  const owner = requireOwner(req, res);\n  if (!owner) return;\n\n  const candidates = Array.isArray(req.body?.subscriptions)\n    ? req.body.subscriptions\n    : [];\n  if (candidates.length > 1000) {\n    return sendError(res, 400, "too many subscriptions to migrate");\n  }\n\n  const db = ensureDb();\n  let imported = 0;\n\n  for (const candidate of candidates) {\n    const subscription = normalizeSubscriptionRecord(candidate);\n    if (!subscription) continue;\n    const merchant = findRegularMerchant(db, subscription.merchant_id);\n    if (!merchant) continue;\n    if (db.subscriptions.some(\n      (existing) => existing.merchant_id === subscription.merchant_id,\n    )) {\n      continue;\n    }\n\n    db.subscriptions.push(subscription);\n    merchant.subscription_started_at = subscription.start_date;\n    merchant.subscription_expires_at = subscription.expires_at;\n    merchant.warning_stage = 0;\n    merchant.retention_status = MerchantRetentionStatus.Protected;\n    merchant.eligible_for_deletion_at = undefined;\n    merchant.grace_period_ends_at = undefined;\n    imported += 1;\n  }\n\n  if (imported > 0) writeDb(db);\n  return res.json({ ok: true, imported, subscriptions: db.subscriptions });\n});\n\nrouter.put("/merchants/:id/subscription", (req: Request, res: Response) => {\n  const admin = requireAdminPermission(req, res, "manage_subscriptions");\n  if (!admin) return;\n\n  const merchantId = String(req.params.id || "").trim();\n  const operation = String(req.body?.operation || "").trim();\n  const plan = String(req.body?.plan || "").trim();\n\n  if (!merchantId) return sendError(res, 400, "merchantId is required");\n  if (!["activate", "change", "renew"].includes(operation)) {\n    return sendError(res, 400, "invalid subscription operation");\n  }\n  if (!isSubscriptionPlan(plan) || plan === "trial") {\n    return sendError(res, 400, "invalid paid subscription plan");\n  }\n\n  const db = ensureDb();\n  const merchant = findRegularMerchant(db, merchantId);\n  if (!merchant) return sendError(res, 404, "merchant not found");\n\n  const existingIndex = db.subscriptions.findIndex(\n    (subscription) => subscription.merchant_id === merchantId,\n  );\n  const existing = existingIndex >= 0 ? db.subscriptions[existingIndex] : undefined;\n\n  if (operation === "activate" && existing) {\n    return sendError(res, 409, "merchant already has a subscription");\n  }\n  if ((operation === "change" || operation === "renew") && !existing) {\n    return sendError(res, 409, "merchant does not have a subscription");\n  }\n\n  const subscription = createPaidSubscription(merchantId, plan, existing);\n  if (existingIndex >= 0) db.subscriptions[existingIndex] = subscription;\n  else db.subscriptions.push(subscription);\n\n  if (\n    merchant.subscription_expires_at &&\n    merchant.subscription_expires_at !== subscription.expires_at\n  ) {\n    merchant.last_subscription_ended_at = merchant.subscription_expires_at;\n  }\n  merchant.subscription_started_at = subscription.start_date;\n  merchant.subscription_expires_at = subscription.expires_at;\n  merchant.warning_stage = 0;\n  merchant.retention_status = MerchantRetentionStatus.Protected;\n  merchant.eligible_for_deletion_at = undefined;\n  merchant.grace_period_ends_at = undefined;\n\n  const actionType = operation === "activate"\n    ? "plan_activated"\n    : operation === "change"\n      ? "plan_changed"\n      : "plan_renewed";\n  appendAdminLog(\n    db,\n    admin,\n    merchant,\n    actionType,\n    \`subscription \${operation}: \${plan}\`,\n    {\n      meta: {\n        plan,\n        ...(operation === "renew" && existing?.pending_next_cycle_deduction\n          ? { emergency_deduction: existing.pending_next_cycle_deduction }\n          : {}),\n      },\n    },\n  );\n  writeDb(db);\n\n  return res.json({\n    ok: true,\n    merchant: publicMerchant(merchant),\n    subscription,\n  });\n});\n\nrouter.patch("/merchants/:id/subscription", (req: Request, res: Response) => {\n  const admin = requireAdminPermission(req, res, "manage_subscriptions");\n  if (!admin) return;\n\n  const merchantId = String(req.params.id || "").trim();\n  const action = String(req.body?.action || "").trim();\n  const amount = Number(req.body?.amount);\n  const enabled = req.body?.enabled;\n\n  const db = ensureDb();\n  const merchant = findRegularMerchant(db, merchantId);\n  if (!merchant) return sendError(res, 404, "merchant not found");\n  const subscription = db.subscriptions.find(\n    (item) => item.merchant_id === merchantId,\n  );\n  if (!subscription) return sendError(res, 404, "subscription not found");\n\n  let actionType = "";\n  let details = "";\n  let meta: Record<string, string | number> = {};\n\n  if (action === "add_replies") {\n    if (!Number.isInteger(amount) || amount <= 0) {\n      return sendError(res, 400, "positive integer amount is required");\n    }\n    subscription.reply_limit += amount;\n    subscription.replies_remaining += amount;\n    if (subscription.status === "replies_exhausted") subscription.status = "active";\n    actionType = "replies_added";\n    details = \`added \${amount} replies\`;\n    meta = { amount };\n  } else if (action === "deduct_replies") {\n    if (!Number.isInteger(amount) || amount <= 0) {\n      return sendError(res, 400, "positive integer amount is required");\n    }\n    subscription.replies_used = Math.min(\n      subscription.reply_limit,\n      subscription.replies_used + amount,\n    );\n    subscription.replies_remaining = Math.max(\n      0,\n      subscription.reply_limit - subscription.replies_used,\n    );\n    if (subscription.replies_remaining === 0) {\n      subscription.status = "replies_exhausted";\n      subscription.auto_reply_enabled = false;\n    }\n    actionType = "replies_deducted";\n    details = \`deducted \${amount} replies\`;\n    meta = { amount };\n  } else if (action === "reset_replies") {\n    subscription.replies_used = 0;\n    subscription.replies_remaining = subscription.reply_limit;\n    subscription.pending_next_cycle_deduction = 0;\n    subscription.status = "active";\n    actionType = "replies_reset";\n    details = \`reply counter reset to \${subscription.reply_limit}\`;\n    meta = { limit: subscription.reply_limit };\n  } else if (action === "set_auto_reply") {\n    if (typeof enabled !== "boolean") {\n      return sendError(res, 400, "enabled boolean is required");\n    }\n    subscription.auto_reply_enabled = enabled;\n    actionType = enabled ? "auto_reply_enabled" : "auto_reply_disabled";\n    details = enabled ? "automatic replies enabled" : "automatic replies disabled";\n  } else {\n    return sendError(res, 400, "invalid subscription action");\n  }\n\n  appendAdminLog(db, admin, merchant, actionType, details, { meta });\n  writeDb(db);\n  return res.json({ ok: true, subscription });\n});\n\n`;

auth = replaceBetween(
  auth,
  "replace legacy subscription endpoint",
  `router.patch("/merchants/:id/subscription",`,
  `router.patch("/merchants/:id/status",`,
  subscriptionRoutes,
);

auth = replaceOnce(
  auth,
  "subscription follows merchant suspension",
  `  } else {\n    merchant.account_status = "suspended";\n  }\n\n  appendAdminLog(`,
  `  } else {\n    merchant.account_status = "suspended";\n  }\n\n  const subscription = db.subscriptions.find(\n    (item) => item.merchant_id === merchantId,\n  );\n  if (subscription && status === "suspended") {\n    subscription.status = "suspended";\n    subscription.auto_reply_enabled = false;\n  } else if (\n    subscription &&\n    status === "approved" &&\n    previousStatus === "suspended"\n  ) {\n    const expired = new Date(subscription.expires_at).getTime() <= Date.now();\n    subscription.status = expired\n      ? "expired"\n      : subscription.replies_remaining <= 0\n        ? "replies_exhausted"\n        : "active";\n    subscription.auto_reply_enabled = subscription.status === "active";\n  }\n\n  appendAdminLog(`,
);

fs.writeFileSync(authPath, auth, "utf8");

let store = fs.readFileSync(storePath, "utf8");
store = replaceOnce(
  store,
  "pure subscription builder",
  `  const subscriptions = getSubscriptions().filter(\n    subscription => subscription.merchant_id !== merchantId\n  );\n\n  const newSubscription: Subscription = {`,
  `  const newSubscription: Subscription = {`,
);
store = replaceOnce(
  store,
  "do not save built subscription",
  `  saveSubscriptions([...subscriptions, newSubscription]);\n  return newSubscription;`,
  `  return newSubscription;`,
);
fs.writeFileSync(storePath, store, "utf8");

let translations = fs.readFileSync(translationsPath, "utf8");
for (const [label, before, after] of [
  [
    "Arabic subscription operation error",
    `    noSubscriptionError: "لا يوجد اشتراك",`,
    `    noSubscriptionError: "لا يوجد اشتراك",\n    subscriptionOperationError:\n      "تعذر حفظ عملية الاشتراك في السيرفر.",`,
  ],
  [
    "English subscription operation error",
    `    noSubscriptionError: "No subscription found",`,
    `    noSubscriptionError: "No subscription found",\n    subscriptionOperationError:\n      "The subscription operation could not be saved on the server.",`,
  ],
  [
    "Kurdish subscription operation error",
    `  noSubscriptionError: "هیچ بەشدارییەک نییە",`,
    `  noSubscriptionError: "هیچ بەشدارییەک نییە",\n  subscriptionOperationError:\n    "نەتوانرا کردارەکەی بەشداری لە سێرڤەر پاشەکەوت بکرێت.",`,
  ],
]) {
  translations = replaceOnce(translations, label, before, after);
}
fs.writeFileSync(translationsPath, translations, "utf8");

let adminPage = fs.readFileSync(adminPagePath, "utf8");
adminPage = replaceOnce(
  adminPage,
  "remove local subscription creator import",
  `  clearSession,\n  createSubscriptionForPlan,\n  getAdminLogs,`,
  `  clearSession,\n  getAdminLogs,`,
);

adminPage = replaceOnce(
  adminPage,
  "server subscription refresh",
  `  const migrateLegacyAdminData = useCallback(async () => {`,
  `  const refreshSubscriptionsFromApi = useCallback(async () => {\n    if (!canManageSubscriptions) {\n      setSubscriptions([]);\n      return;\n    }\n\n    try {\n      const response = await fetch("/api/auth/admin/subscriptions", {\n        headers: getAdminAuthHeaders(),\n      });\n      const data = await response.json().catch(() => null);\n      if (handleUnauthorizedAdminResponse(response)) return;\n      if (!response.ok || !data?.ok || !Array.isArray(data.subscriptions)) {\n        throw new Error(data?.error || "Could not load subscriptions");\n      }\n      const serverSubscriptions = data.subscriptions as Subscription[];\n      saveSubscriptions(serverSubscriptions);\n      setSubscriptions(serverSubscriptions);\n    } catch (error) {\n      console.error("Admin subscriptions API sync failed:", error);\n      toast.error(adminText.subscriptionOperationError);\n    }\n  }, [\n    adminText.subscriptionOperationError,\n    canManageSubscriptions,\n    handleUnauthorizedAdminResponse,\n  ]);\n\n  const migrateLegacySubscriptions = useCallback(async () => {\n    if (!isOwnerAdmin || !currentAdmin?.id) return;\n    const migrationKey = `fawri_subscriptions_migrated_v1_${currentAdmin.id}`;\n    if (localStorage.getItem(migrationKey) === "done") return;\n\n    const localSubscriptions = getSubscriptions();\n    try {\n      const response = await fetch("/api/auth/admin/subscriptions/migrate", {\n        method: "POST",\n        headers: {\n          "Content-Type": "application/json",\n          ...getAdminAuthHeaders(),\n        },\n        body: JSON.stringify({ subscriptions: localSubscriptions }),\n      });\n      const data = await response.json().catch(() => null);\n      if (handleUnauthorizedAdminResponse(response)) return;\n      if (!response.ok || !data?.ok) {\n        throw new Error(data?.error || "Could not migrate subscriptions");\n      }\n      localStorage.setItem(migrationKey, "done");\n    } catch (error) {\n      console.error("Legacy subscription migration failed:", error);\n    }\n  }, [currentAdmin?.id, handleUnauthorizedAdminResponse, isOwnerAdmin]);\n\n  const migrateLegacyAdminData = useCallback(async () => {`,
);

adminPage = replaceOnce(
  adminPage,
  "load server subscriptions in effect",
  `      await migrateLegacyAdminData();\n      await Promise.all([\n        refreshMerchantsFromApi(),`,
  `      await migrateLegacyAdminData();\n      await migrateLegacySubscriptions();\n      await Promise.all([\n        refreshMerchantsFromApi(),\n        refreshSubscriptionsFromApi(),`,
);

adminPage = replaceOnce(
  adminPage,
  "subscription effect dependencies",
  `    migrateLegacyAdminData,\n    refreshChannelsFromApi,`,
  `    migrateLegacyAdminData,\n    migrateLegacySubscriptions,\n    refreshChannelsFromApi,`,
);
adminPage = replaceOnce(
  adminPage,
  "subscription refresh dependency",
  `    refreshLogsFromApi,\n    refreshMerchantsFromApi,`,
  `    refreshLogsFromApi,\n    refreshMerchantsFromApi,\n    refreshSubscriptionsFromApi,`,
);

adminPage = replaceBetween(
  adminPage,
  "replace subscription sync helper",
  `  const syncMerchantSubscriptionToApi = async (`,
  `  const updateMerchant = (id: string, patch: Partial<Merchant>) => {`,
  `  const syncSubscriptionPlanToApi = async (\n    id: string,\n    operation: "activate" | "change" | "renew",\n    plan: PlanKey,\n  ): Promise<{ merchant: Merchant; subscription: Subscription }> => {\n    const response = await fetch(\n      \`/api/auth/merchants/\${encodeURIComponent(id)}/subscription\`,\n      {\n        method: "PUT",\n        headers: {\n          "Content-Type": "application/json",\n          ...getAdminAuthHeaders(),\n        },\n        body: JSON.stringify({ operation, plan }),\n      },\n    );\n    const data = await response.json().catch(() => null);\n    if (handleUnauthorizedAdminResponse(response)) {\n      throw new Error("ADMIN_SESSION_UNAUTHORIZED");\n    }\n    if (!response.ok || !data?.ok || !data?.merchant || !data?.subscription) {\n      throw new Error(data?.error || "Could not update subscription");\n    }\n    return {\n      merchant: data.merchant as Merchant,\n      subscription: data.subscription as Subscription,\n    };\n  };\n\n  const syncSubscriptionActionToApi = async (\n    id: string,\n    action: "add_replies" | "deduct_replies" | "reset_replies" | "set_auto_reply",\n    values: { amount?: number; enabled?: boolean } = {},\n  ): Promise<Subscription> => {\n    const response = await fetch(\n      \`/api/auth/merchants/\${encodeURIComponent(id)}/subscription\`,\n      {\n        method: "PATCH",\n        headers: {\n          "Content-Type": "application/json",\n          ...getAdminAuthHeaders(),\n        },\n        body: JSON.stringify({ action, ...values }),\n      },\n    );\n    const data = await response.json().catch(() => null);\n    if (handleUnauthorizedAdminResponse(response)) {\n      throw new Error("ADMIN_SESSION_UNAUTHORIZED");\n    }\n    if (!response.ok || !data?.ok || !data?.subscription) {\n      throw new Error(data?.error || "Could not update subscription");\n    }\n    return data.subscription as Subscription;\n  };\n\n`,
);

adminPage = replaceOnce(
  adminPage,
  "replace local subscription updater",
  `  const updateSub = (merchantId: string, patch: Partial<Subscription>) => {\n    const all = getSubscriptions();\n    saveSubscriptions(\n      all.map((s) => (s.merchant_id === merchantId ? { ...s, ...patch } : s)),\n    );\n    refreshData();\n  };`,
  `  const storeServerSubscription = (subscription: Subscription) => {\n    const nextSubscriptions = [\n      ...getSubscriptions().filter(\n        (item) => item.merchant_id !== subscription.merchant_id,\n      ),\n      subscription,\n    ];\n    saveSubscriptions(nextSubscriptions);\n    setSubscriptions(nextSubscriptions);\n  };`,
);

adminPage = replaceOnce(
  adminPage,
  "remove local suspend subscription update",
  `      updateSub(merchantId, { status: "suspended", auto_reply_enabled: false });\n      await refreshMerchantsFromApi();`,
  `      await refreshMerchantsFromApi();\n      if (canManageSubscriptions) await refreshSubscriptionsFromApi();`,
);
adminPage = replaceOnce(
  adminPage,
  "remove local unsuspend subscription update",
  `      updateSub(merchantId, { status: "active", auto_reply_enabled: true });\n      await refreshMerchantsFromApi();`,
  `      await refreshMerchantsFromApi();\n      if (canManageSubscriptions) await refreshSubscriptionsFromApi();`,
);

adminPage = replaceBetween(
  adminPage,
  "replace subscription action handlers",
  `  const doResetReplies = (merchantId: string) => {`,
  `  const doSaveNote = async (merchantId: string, note: string) => {`,
  `  const doResetReplies = async (merchantId: string) => {\n    try {\n      const subscription = await syncSubscriptionActionToApi(\n        merchantId,\n        "reset_replies",\n      );\n      storeServerSubscription(subscription);\n      toast.success(adminText.toastRepliesReset);\n      setConfirmDialog(null);\n    } catch (error) {\n      console.error("Reset replies failed:", error);\n      toast.error(adminText.subscriptionOperationError);\n    }\n  };\n\n  const doAddReplies = async (merchantId: string, amount: number) => {\n    try {\n      const subscription = await syncSubscriptionActionToApi(\n        merchantId,\n        "add_replies",\n        { amount },\n      );\n      storeServerSubscription(subscription);\n      toast.success(\n        formatAdminMessage(adminText.toastRepliesAdded, { amount }),\n      );\n      setRepliesModal(null);\n    } catch (error) {\n      console.error("Add replies failed:", error);\n      toast.error(adminText.subscriptionOperationError);\n    }\n  };\n\n  const doDeductReplies = async (merchantId: string, amount: number) => {\n    try {\n      const subscription = await syncSubscriptionActionToApi(\n        merchantId,\n        "deduct_replies",\n        { amount },\n      );\n      storeServerSubscription(subscription);\n      toast.success(\n        formatAdminMessage(adminText.toastRepliesDeducted, { amount }),\n      );\n      setRepliesModal(null);\n    } catch (error) {\n      console.error("Deduct replies failed:", error);\n      toast.error(adminText.subscriptionOperationError);\n    }\n  };\n\n  const doToggleAutoReply = async (merchantId: string) => {\n    const current = getSub(merchantId);\n    if (!current) {\n      toast.error(adminText.noSubscriptionError);\n      return;\n    }\n\n    try {\n      const enabled = !current.auto_reply_enabled;\n      const subscription = await syncSubscriptionActionToApi(\n        merchantId,\n        "set_auto_reply",\n        { enabled },\n      );\n      storeServerSubscription(subscription);\n      toast.success(\n        enabled\n          ? adminText.toastAutoReplyEnabled\n          : adminText.toastAutoReplyDisabled,\n      );\n      setConfirmDialog(null);\n    } catch (error) {\n      console.error("Toggle automatic replies failed:", error);\n      toast.error(adminText.subscriptionOperationError);\n    }\n  };\n\n  const savePlanOperation = async (\n    merchantId: string,\n    plan: PlanKey,\n    operation: "activate" | "change" | "renew",\n  ) => {\n    const m = merchants.find((item) => item.id === merchantId);\n    if (!m) return;\n\n    try {\n      const result = await syncSubscriptionPlanToApi(\n        merchantId,\n        operation,\n        plan,\n      );\n      updateMerchant(merchantId, result.merchant);\n      storeServerSubscription(result.subscription);\n      if (operation === "activate") {\n        toast.success(\n          formatAdminMessage(adminText.toastPlanActivated, {\n            plan: planNames[plan],\n          }),\n        );\n      } else if (operation === "change") {\n        toast.success(\n          formatAdminMessage(adminText.toastPlanChanged, {\n            plan: planNames[plan],\n          }),\n        );\n      } else {\n        toast.success(\n          formatAdminMessage(adminText.toastPlanRenewed, {\n            plan: planNames[plan],\n          }),\n        );\n      }\n      setPlanModal(null);\n    } catch (error) {\n      console.error("Subscription plan operation failed:", error);\n      toast.error(\n        operation === "activate"\n          ? adminText.planActivationSaveError\n          : operation === "change"\n            ? adminText.planChangeSaveError\n            : adminText.planRenewSaveError,\n      );\n    }\n  };\n\n  const doActivatePaidSubscription = (merchantId: string, plan: PlanKey) =>\n    savePlanOperation(merchantId, plan, "activate");\n\n  const doChangePlan = (merchantId: string, plan: PlanKey) =>\n    savePlanOperation(merchantId, plan, "change");\n\n  const doRenewPlan = (merchantId: string, plan: PlanKey) =>\n    savePlanOperation(merchantId, plan, "renew");\n\n`,
);

fs.writeFileSync(adminPagePath, adminPage, "utf8");

let test = fs.readFileSync(testPath, "utf8");
test = replaceOnce(
  test,
  "test database subscriptions",
  `    ],\n    otps: [`,
  `    ],\n    subscriptions: [],\n    otps: [`,
);

test = replaceOnce(
  test,
  "server subscription integration assertions",
  `  assert.ok(\n    Number.isFinite(\n      new Date(approval.body.merchant.approved_at).getTime(),\n    ),\n  );`,
  `  const activateSubscription = await json(await fetch(\n    \`${"${baseUrl}"}/api/auth/merchants/merchant-a/subscription\`,\n    {\n      method: "PUT",\n      headers: { ...assistantHeaders, "Content-Type": "application/json" },\n      body: JSON.stringify({ operation: "activate", plan: "silver" }),\n    },\n  ));\n  assert.equal(activateSubscription.response.status, 200);\n  assert.equal(activateSubscription.body.subscription.plan_name, "silver");\n  assert.equal(activateSubscription.body.subscription.reply_limit, 4000);\n\n  const subscriptionsList = await json(await fetch(\n    \`${"${baseUrl}"}/api/auth/admin/subscriptions\`,\n    { headers: assistantHeaders },\n  ));\n  assert.equal(subscriptionsList.response.status, 200);\n  assert.equal(subscriptionsList.body.subscriptions.length, 1);\n  assert.equal(subscriptionsList.body.subscriptions[0].merchant_id, "merchant-a");\n\n  const addReply = await json(await fetch(\n    \`${"${baseUrl}"}/api/auth/merchants/merchant-a/subscription\`,\n    {\n      method: "PATCH",\n      headers: { ...assistantHeaders, "Content-Type": "application/json" },\n      body: JSON.stringify({ action: "add_replies", amount: 1 }),\n    },\n  ));\n  assert.equal(addReply.response.status, 200);\n  assert.equal(addReply.body.subscription.reply_limit, 4001);\n  assert.equal(addReply.body.subscription.replies_remaining, 4001);\n\n  const deductReply = await json(await fetch(\n    \`${"${baseUrl}"}/api/auth/merchants/merchant-a/subscription\`,\n    {\n      method: "PATCH",\n      headers: { ...assistantHeaders, "Content-Type": "application/json" },\n      body: JSON.stringify({ action: "deduct_replies", amount: 1 }),\n    },\n  ));\n  assert.equal(deductReply.response.status, 200);\n  assert.equal(deductReply.body.subscription.replies_used, 1);\n  assert.equal(deductReply.body.subscription.replies_remaining, 4000);\n\n  const resetReplies = await json(await fetch(\n    \`${"${baseUrl}"}/api/auth/merchants/merchant-a/subscription\`,\n    {\n      method: "PATCH",\n      headers: { ...assistantHeaders, "Content-Type": "application/json" },\n      body: JSON.stringify({ action: "reset_replies" }),\n    },\n  ));\n  assert.equal(resetReplies.response.status, 200);\n  assert.equal(resetReplies.body.subscription.replies_used, 0);\n  assert.equal(resetReplies.body.subscription.replies_remaining, 4001);\n\n  const disableReplies = await json(await fetch(\n    \`${"${baseUrl}"}/api/auth/merchants/merchant-a/subscription\`,\n    {\n      method: "PATCH",\n      headers: { ...assistantHeaders, "Content-Type": "application/json" },\n      body: JSON.stringify({ action: "set_auto_reply", enabled: false }),\n    },\n  ));\n  assert.equal(disableReplies.response.status, 200);\n  assert.equal(disableReplies.body.subscription.auto_reply_enabled, false);\n\n  const persistedSubscriptionDb = JSON.parse(\n    await readFile(path.join(dataDir, "merchants.json"), "utf8"),\n  );\n  assert.equal(persistedSubscriptionDb.subscriptions.length, 1);\n  assert.equal(persistedSubscriptionDb.subscriptions[0].plan_name, "silver");\n\n  assert.ok(\n    Number.isFinite(\n      new Date(approval.body.merchant.approved_at).getTime(),\n    ),\n  );`,
);

fs.writeFileSync(testPath, test, "utf8");

for (const [pathName, marker] of [
  [authPath, 'router.get("/admin/subscriptions"'],
  [authPath, "subscriptions: SubscriptionRecord[]"],
  [adminPagePath, "refreshSubscriptionsFromApi"],
  [adminPagePath, "syncSubscriptionActionToApi"],
  [testPath, "persistedSubscriptionDb.subscriptions.length"],
]) {
  const content = fs.readFileSync(pathName, "utf8");
  if (!content.includes(marker)) throw new Error(`Missing marker ${marker} in ${pathName}`);
}

run("pnpm run typecheck");
run("PORT=3000 BASE_PATH=/ pnpm --filter @workspace/fawri run build");
run("pnpm --filter @workspace/api-server run test:admin-permissions");
run("pnpm --filter @workspace/api-server run test:merchant-sessions");

fs.rmSync(selfPath);
run("git diff --check");
run(`git add ${authPath} ${testPath} ${adminPagePath} ${storePath} ${translationsPath} ${selfPath}`);
run('git commit -m "Make subscriptions server authoritative"');
run(`git push origin ${branch}`);

console.log("\nCompleted: subscriptions are now server-authoritative, with owner migration and API-backed admin operations.");
