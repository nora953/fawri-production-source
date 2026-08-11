from pathlib import Path


def replace_once(path: str, old: str, new: str) -> None:
    p = Path(path)
    text = p.read_text(encoding="utf-8")
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"STOP: expected one match in {path}, found {count}")
    p.write_text(text.replace(old, new, 1), encoding="utf-8")


service = "artifacts/api-server/src/services/saasBillingAuthority.ts"

replace_once(
    service,
    '''export const SAAS_BILLING_PROVIDER_ENV = "FAWRI_SAAS_BILLING_PROVIDER";\n\nexport type SaasBillingProviderState = {\n  provider: "disabled" | "test_fake" | "superqi_sandbox" | "unsupported";\n  checkout_available: boolean;\n  production_ready: boolean;\n};\n''',
    '''export const SAAS_BILLING_PROVIDER_ENV = "FAWRI_SAAS_BILLING_PROVIDER";\nexport const SAAS_BILLING_PROVIDERS_ENV = "FAWRI_SAAS_BILLING_PROVIDERS";\n\nexport type SaasBillingCheckoutProvider = "test_fake" | "superqi_sandbox";\nexport type SaasBillingProviderKey = SaasBillingCheckoutProvider | "fastpay";\nexport type SaasBillingProviderState = {\n  provider: SaasBillingProviderKey | "disabled" | "unsupported";\n  display_name: string;\n  checkout_available: boolean;\n  production_ready: boolean;\n  test_only: boolean;\n  status:\n    | "available"\n    | "disabled"\n    | "merchant_setup_required"\n    | "production_forbidden"\n    | "configuration_incomplete"\n    | "unsupported";\n};\n''',
)

old_provider_functions = '''export function getSaasBillingProviderState(): SaasBillingProviderState {\n  const configured = String(process.env[SAAS_BILLING_PROVIDER_ENV] || "disabled")\n    .trim()\n    .toLowerCase();\n  if (!configured || configured === "disabled") {\n    return {\n      provider: "disabled",\n      checkout_available: false,\n      production_ready: false,\n    };\n  }\n  if (configured === "test_fake") {\n    return {\n      provider: "test_fake",\n      checkout_available: process.env.NODE_ENV === "test",\n      production_ready: false,\n    };\n  }\n  if (configured === "superqi_sandbox") {\n    const sandbox = getSuperQiSandboxPublicState();\n    return {\n      provider: "superqi_sandbox",\n      checkout_available: sandbox.checkout_available,\n      production_ready: false,\n    };\n  }\n  return {\n    provider: "unsupported",\n    checkout_available: false,\n    production_ready: false,\n  };\n}\n\nexport function getSaasBillingCatalog() {\n  return {\n    catalog_version: SAAS_PLAN_CATALOG_VERSION,\n    currency: "IQD" as const,\n    plans: listSaasPlans(),\n    provider: getSaasBillingProviderState(),\n  };\n}\n'''

new_provider_functions = '''function configuredProviderNames(): string[] {\n  const multi = String(process.env[SAAS_BILLING_PROVIDERS_ENV] || "")\n    .split(",")\n    .map((value) => value.trim().toLowerCase())\n    .filter(Boolean);\n  const raw = multi.length > 0\n    ? multi\n    : [String(process.env[SAAS_BILLING_PROVIDER_ENV] || "").trim().toLowerCase()]\n        .filter(Boolean);\n  return [...new Set(raw.filter((value) => value !== "disabled"))];\n}\n\nfunction providerStateFor(\n  requestedProvider: string,\n  configuredProviders: Set<string>,\n): SaasBillingProviderState {\n  const provider = String(requestedProvider || "").trim().toLowerCase();\n  if (provider === "test_fake") {\n    const configured = configuredProviders.has(provider);\n    const available = configured && process.env.NODE_ENV === "test";\n    return {\n      provider: "test_fake",\n      display_name: "Internal test provider",\n      checkout_available: available,\n      production_ready: false,\n      test_only: true,\n      status: available ? "available" : "disabled",\n    };\n  }\n  if (provider === "superqi_sandbox") {\n    if (!configuredProviders.has(provider)) {\n      return {\n        provider: "superqi_sandbox",\n        display_name: "SuperQi",\n        checkout_available: false,\n        production_ready: false,\n        test_only: true,\n        status: "disabled",\n      };\n    }\n    const sandbox = getSuperQiSandboxPublicState();\n    return {\n      provider: "superqi_sandbox",\n      display_name: "SuperQi",\n      checkout_available: sandbox.checkout_available,\n      production_ready: false,\n      test_only: true,\n      status: sandbox.checkout_available\n        ? "available"\n        : sandbox.reason === "production_forbidden"\n          ? "production_forbidden"\n          : "configuration_incomplete",\n    };\n  }\n  if (provider === "fastpay") {\n    return {\n      provider: "fastpay",\n      display_name: "FastPay",\n      checkout_available: false,\n      production_ready: false,\n      test_only: false,\n      status: "merchant_setup_required",\n    };\n  }\n  return {\n    provider: provider ? "unsupported" : "disabled",\n    display_name: provider || "Disabled",\n    checkout_available: false,\n    production_ready: false,\n    test_only: false,\n    status: provider ? "unsupported" : "disabled",\n  };\n}\n\nexport function getSaasBillingProviderState(\n  requestedProvider?: string,\n): SaasBillingProviderState {\n  const configured = configuredProviderNames();\n  const configuredSet = new Set(configured);\n  if (requestedProvider) {\n    return providerStateFor(requestedProvider, configuredSet);\n  }\n  if (configured.length === 0) {\n    return providerStateFor("", configuredSet);\n  }\n  return providerStateFor(configured[0], configuredSet);\n}\n\nexport function getSaasBillingProviderStates(): SaasBillingProviderState[] {\n  const configured = configuredProviderNames();\n  const configuredSet = new Set(configured);\n  const states = configured.map((provider) => providerStateFor(provider, configuredSet));\n  if (!configuredSet.has("fastpay")) {\n    states.push(providerStateFor("fastpay", configuredSet));\n  }\n  return states;\n}\n\nexport function resolveSaasBillingCheckoutProvider(\n  requestedProvider?: string,\n): SaasBillingProviderState & { provider: SaasBillingCheckoutProvider } {\n  if (requestedProvider) {\n    const state = getSaasBillingProviderState(requestedProvider);\n    if (\n      !state.checkout_available ||\n      !["test_fake", "superqi_sandbox"].includes(state.provider)\n    ) {\n      fail(\n        "SAAS_BILLING_PROVIDER_DISABLED",\n        "selected SaaS billing provider is not available",\n        503,\n        { provider: state.provider, provider_status: state.status },\n      );\n    }\n    return state as SaasBillingProviderState & { provider: SaasBillingCheckoutProvider };\n  }\n\n  const available = getSaasBillingProviderStates().filter(\n    (state): state is SaasBillingProviderState & { provider: SaasBillingCheckoutProvider } =>\n      state.checkout_available &&\n      (state.provider === "test_fake" || state.provider === "superqi_sandbox"),\n  );\n  if (available.length === 1) return available[0];\n  if (available.length > 1) {\n    fail(\n      "SAAS_BILLING_PROVIDER_REQUIRED",\n      "billing provider selection is required",\n      400,\n      { providers: available.map((provider) => provider.provider) },\n    );\n  }\n  fail(\n    "SAAS_BILLING_PROVIDER_DISABLED",\n    "SaaS subscription checkout is not enabled yet",\n    503,\n  );\n}\n\nexport function getSaasBillingCatalog() {\n  return {\n    catalog_version: SAAS_PLAN_CATALOG_VERSION,\n    currency: "IQD" as const,\n    plans: listSaasPlans(),\n    provider: getSaasBillingProviderState(),\n    providers: getSaasBillingProviderStates(),\n  };\n}\n'''
replace_once(service, old_provider_functions, new_provider_functions)

replace_once(
    service,
    '''  idempotencyKey: string;\n  now?: Date;\n  providerFetch?: SuperQiFetch;\n''',
    '''  idempotencyKey: string;\n  provider?: string;\n  now?: Date;\n  providerFetch?: SuperQiFetch;\n''',
)

replace_once(
    service,
    '''  const provider = getSaasBillingProviderState();\n  if (\n    !provider.checkout_available ||\n    !["test_fake", "superqi_sandbox"].includes(provider.provider)\n  ) {\n    fail(\n      "SAAS_BILLING_PROVIDER_DISABLED",\n      "SaaS subscription checkout is not enabled yet",\n      503,\n      { provider: provider.provider },\n    );\n  }\n''',
    '''  const provider = resolveSaasBillingCheckoutProvider(input.provider);\n''',
)

replace_once(
    service,
    '''  const configuredProvider = getSaasBillingProviderState();\n  const providerEventAllowed =\n    (input.provider === "test_fake" && process.env.NODE_ENV === "test") ||\n    (input.provider === "superqi_sandbox" &&\n      process.env.NODE_ENV !== "production" &&\n      configuredProvider.provider === "superqi_sandbox" &&\n      configuredProvider.checkout_available);\n''',
    '''  const configuredProvider = getSaasBillingProviderState(input.provider);\n  const providerEventAllowed =\n    configuredProvider.checkout_available &&\n    ((input.provider === "test_fake" && process.env.NODE_ENV === "test") ||\n      (input.provider === "superqi_sandbox" &&\n        process.env.NODE_ENV !== "production" &&\n        configuredProvider.provider === "superqi_sandbox"));\n''',
)

route = "artifacts/api-server/src/routes/saas-billing.ts"
replace_once(
    route,
    '''  const plan = String(req.body?.plan || "").trim();\n  const idempotencyKey = String(req.body?.idempotency_key || "").trim();\n''',
    '''  const plan = String(req.body?.plan || "").trim();\n  const provider = String(req.body?.provider || "").trim();\n  const idempotencyKey = String(req.body?.idempotency_key || "").trim();\n''',
)
replace_once(
    route,
    '''      plan,\n      idempotencyKey,\n    });\n''',
    '''      plan,\n      idempotencyKey,\n      ...(provider ? { provider } : {}),\n    });\n''',
)

ui = "artifacts/fawri/src/components/SaasBillingPanel.tsx"
replace_once(
    ui,
    '''type ProviderState = {\n  provider: 'disabled' | 'test_fake' | 'superqi_sandbox' | 'unsupported';\n  checkout_available: boolean;\n  production_ready: boolean;\n};\n''',
    '''type ProviderState = {\n  provider: 'disabled' | 'test_fake' | 'superqi_sandbox' | 'fastpay' | 'unsupported';\n  display_name: string;\n  checkout_available: boolean;\n  production_ready: boolean;\n  test_only: boolean;\n  status:\n    | 'available'\n    | 'disabled'\n    | 'merchant_setup_required'\n    | 'production_forbidden'\n    | 'configuration_incomplete'\n    | 'unsupported';\n};\n''',
)
replace_once(
    ui,
    '''  plans: BillingPlan[];\n  provider: ProviderState;\n};\n''',
    '''  plans: BillingPlan[];\n  provider: ProviderState;\n  providers: ProviderState[];\n};\n''',
)
replace_once(
    ui,
    '''    checkoutCreated: 'تم إنشاء طلب الدفع',\n    sandboxNotice: 'أنت تستخدم بيئة اختبار SuperQi. لا يتم استخدام أموال حقيقية في هذا الوضع.',\n''',
    '''    checkoutCreated: 'تم إنشاء طلب الدفع',\n    sandboxNotice: 'أنت تستخدم بيئة اختبار SuperQi. لا يتم استخدام أموال حقيقية في هذا الوضع.',\n    fastPayNotice: 'FastPay سيكون متاحًا بعد إكمال حساب التاجر والحصول على بيانات الربط الرسمية من FastPay.',\n    merchantSetupRequired: 'يتطلب إعداد حساب تاجر',\n''',
)
replace_once(
    ui,
    '''    checkoutCreated: 'Billing order created',\n    sandboxNotice: 'SuperQi sandbox is active. No real money is used in this mode.',\n''',
    '''    checkoutCreated: 'Billing order created',\n    sandboxNotice: 'SuperQi sandbox is active. No real money is used in this mode.',\n    fastPayNotice: 'FastPay will become available after merchant onboarding and official integration credentials are provided.',\n    merchantSetupRequired: 'Merchant setup required',\n''',
)
replace_once(
    ui,
    '''    checkoutCreated: 'داواکاری پارەدان دروست کرا',\n    sandboxNotice: 'ژینگەی تاقیکردنەوەی SuperQi چالاکە. لەم دۆخەدا پارەی ڕاستەقینە بەکارناهێنرێت.',\n''',
    '''    checkoutCreated: 'داواکاری پارەدان دروست کرا',\n    sandboxNotice: 'ژینگەی تاقیکردنەوەی SuperQi چالاکە. لەم دۆخەدا پارەی ڕاستەقینە بەکارناهێنرێت.',\n    fastPayNotice: 'FastPay دوای تەواوکردنی هەژماری بازرگان و وەرگرتنی زانیارییە فەرمییەکانی بەستنەوە بەردەست دەبێت.',\n    merchantSetupRequired: 'پێویستی بە ڕێکخستنی هەژماری بازرگان هەیە',\n''',
)
replace_once(
    ui,
    '''  const [submitting, setSubmitting] = React.useState<Plan | null>(null);\n''',
    '''  const [submitting, setSubmitting] = React.useState<string | null>(null);\n''',
)
replace_once(
    ui,
    '''  const beginCheckout = async (plan: Plan) => {\n    if (!catalog.provider.checkout_available || !canStartCycle) return;\n''',
    '''  const providers = Array.isArray(catalog.providers) ? catalog.providers : [catalog.provider];\n  const checkoutAvailable = providers.some((provider) => provider.checkout_available);\n  const fastPayPending = providers.some(\n    (provider) => provider.provider === 'fastpay' && provider.status === 'merchant_setup_required',\n  );\n\n  const beginCheckout = async (plan: Plan, provider: ProviderState) => {\n    if (!provider.checkout_available || !canStartCycle) return;\n''',
)
replace_once(
    ui,
    '''    setSubmitting(plan);\n''',
    '''    const submittingKey = `${plan}:${provider.provider}`;\n    setSubmitting(submittingKey);\n''',
)
replace_once(
    ui,
    '''          operation,\n          plan,\n          idempotency_key: makeIdempotencyKey(),\n''',
    '''          operation,\n          plan,\n          provider: provider.provider,\n          idempotency_key: makeIdempotencyKey(),\n''',
)
replace_once(
    ui,
    '''      if (catalog.provider.provider === 'superqi_sandbox') {\n        if (!redirectUrl) throw new Error(text.checkoutUnavailable);\n        window.location.assign(redirectUrl);\n        return;\n      }\n''',
    '''      if (redirectUrl) {\n        window.location.assign(redirectUrl);\n        return;\n      }\n''',
)
replace_once(
    ui,
    '''        {!catalog.provider.checkout_available && (\n''',
    '''        {!checkoutAvailable && (\n''',
)
replace_once(
    ui,
    '''        {catalog.provider.provider === 'superqi_sandbox' &&\n          catalog.provider.checkout_available && (\n''',
    '''        {providers.some(\n          (provider) => provider.provider === 'superqi_sandbox' && provider.checkout_available,\n        ) && (\n''',
)
replace_once(
    ui,
    '''        {catalog.provider.checkout_available && subscription && !canStartCycle && (\n''',
    '''        {fastPayPending && (\n          <Alert>\n            <AlertDescription>{text.fastPayNotice}</AlertDescription>\n          </Alert>\n        )}\n        {checkoutAvailable && subscription && !canStartCycle && (\n''',
)

old_button = '''                <Button\n                  className="mt-4 w-full"\n                  disabled={!catalog.provider.checkout_available || !canStartCycle || submitting !== null}\n                  onClick={() => void beginCheckout(plan.plan)}\n                >\n                  {submitting === plan.plan ? t.overview_loading : text.choose}\n                </Button>\n'''
new_button = '''                <div className="mt-4 space-y-2">\n                  {providers\n                    .filter((provider) => provider.provider !== 'disabled' && provider.provider !== 'unsupported')\n                    .map((provider) => {\n                      const key = `${plan.plan}:${provider.provider}`;\n                      return (\n                        <Button\n                          key={provider.provider}\n                          className="w-full"\n                          variant={provider.checkout_available ? 'default' : 'outline'}\n                          disabled={!provider.checkout_available || !canStartCycle || submitting !== null}\n                          onClick={() => void beginCheckout(plan.plan, provider)}\n                        >\n                          {submitting === key\n                            ? t.overview_loading\n                            : `${text.choose} · ${provider.display_name}${\n                                provider.status === 'merchant_setup_required'\n                                  ? ` · ${text.merchantSetupRequired}`\n                                  : ''\n                              }`}\n                        </Button>\n                      );\n                    })}\n                </div>\n'''
replace_once(ui, old_button, new_button)

static_test = "artifacts/api-server/tests/saas-billing-authority-static.test.mjs"
replace_once(
    static_test,
    '''  assert.match(route, /idempotency_key/);\n  assert.match(route, /createSaasBillingCheckout/);\n''',
    '''  assert.match(route, /idempotency_key/);\n  assert.match(route, /req\\.body\\?\\.provider/);\n  assert.match(route, /createSaasBillingCheckout/);\n''',
)

ui_test = "artifacts/fawri/tests/saas-billing-ui.test.ts"
replace_once(
    ui_test,
    '''  assert.match(checkoutRequest, /operation/);\n  assert.match(checkoutRequest, /plan/);\n  assert.match(checkoutRequest, /idempotency_key/);\n''',
    '''  assert.match(checkoutRequest, /operation/);\n  assert.match(checkoutRequest, /plan/);\n  assert.match(checkoutRequest, /provider/);\n  assert.match(checkoutRequest, /idempotency_key/);\n''',
)
replace_once(
    ui_test,
    '''  assert.match(panel, /superqi_sandbox/);\n  assert.match(panel, /window\\.location\\.assign\\(redirectUrl\\)/);\n''',
    '''  assert.match(panel, /superqi_sandbox/);\n  assert.match(panel, /fastpay/);\n  assert.match(panel, /merchant_setup_required/);\n  assert.match(panel, /catalog\\.providers/);\n  assert.match(panel, /window\\.location\\.assign\\(redirectUrl\\)/);\n''',
)
