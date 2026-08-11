#!/usr/bin/env python3
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

def p(rel): return ROOT / rel
def read(rel): return p(rel).read_text(encoding="utf-8")
def write(rel, content): p(rel).write_text(content, encoding="utf-8")
def replace_once(rel, old, new):
    text = read(rel)
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"{rel}: expected exactly one match, found {count}: {old[:160]!r}")
    write(rel, text.replace(old, new, 1))

# Billing authority: add the sandbox provider without changing the financial
# authority or introducing any browser-trusted payment state.
rel = "artifacts/api-server/src/services/saasBillingAuthority.ts"
replace_once(
    rel,
    'import crypto from "node:crypto";\n',
    '''import crypto from "node:crypto";\nimport {\n  createSuperQiSandboxPayment,\n  getSuperQiSandboxPublicState,\n  type SuperQiFetch,\n} from "./superQiSandboxTransport";\n''',
)
replace_once(
    rel,
    '  provider: "disabled" | "test_fake" | "unsupported";\n',
    '  provider: "disabled" | "test_fake" | "superqi_sandbox" | "unsupported";\n',
)
replace_once(
    rel,
    '  updated_at: string;\n};\n\nexport type VerifiedSaasBillingProviderEvent = {\n  provider: "test_fake";\n',
    '''  updated_at: string;\n  metadata: Record<string, string | number | boolean | null>;\n};\n\nexport type VerifiedSaasBillingProviderEvent = {\n  provider: "test_fake" | "superqi_sandbox";\n''',
)
replace_once(
    rel,
    '''  if (configured === "test_fake") {\n    return {\n      provider: "test_fake",\n      checkout_available: process.env.NODE_ENV === "test",\n      production_ready: false,\n    };\n  }\n  return {\n''',
    '''  if (configured === "test_fake") {\n    return {\n      provider: "test_fake",\n      checkout_available: process.env.NODE_ENV === "test",\n      production_ready: false,\n    };\n  }\n  if (configured === "superqi_sandbox") {\n    const sandbox = getSuperQiSandboxPublicState();\n    return {\n      provider: "superqi_sandbox",\n      checkout_available: sandbox.checkout_available,\n      production_ready: false,\n    };\n  }\n  return {\n''',
)
replace_once(
    rel,
    '''    created_at: timestamp(row.created_at).toISOString(),\n    updated_at: timestamp(row.updated_at).toISOString(),\n  };\n}\n\nconst ORDER_SELECT = `SELECT id, merchant_id, operation, requested_plan, amount_iqd,\n  currency, catalog_version, provider, status, idempotency_key,\n  provider_checkout_ref, provider_payment_ref, request_expires_at,\n  paid_at, failed_at, cancelled_at, created_at, updated_at\n  FROM saas_billing_orders`;\n''',
    '''    created_at: timestamp(row.created_at).toISOString(),\n    updated_at: timestamp(row.updated_at).toISOString(),\n    metadata:\n      row.metadata && typeof row.metadata === "object" && !Array.isArray(row.metadata)\n        ? (row.metadata as Record<string, string | number | boolean | null>)\n        : {},\n  };\n}\n\nconst ORDER_SELECT = `SELECT id, merchant_id, operation, requested_plan, amount_iqd,\n  currency, catalog_version, provider, status, idempotency_key,\n  provider_checkout_ref, provider_payment_ref, request_expires_at,\n  paid_at, failed_at, cancelled_at, created_at, updated_at, metadata\n  FROM saas_billing_orders`;\n''',
)
replace_once(
    rel,
    '''  idempotencyKey: string;\n  now?: Date;\n}): Promise<{\n  order: SaasBillingOrderRecord;\n  duplicate: boolean;\n  checkout: { provider: "test_fake"; checkout_reference: string; test_only: true };\n}> {\n  const provider = getSaasBillingProviderState();\n  if (!provider.checkout_available || provider.provider !== "test_fake") {\n''',
    '''  idempotencyKey: string;\n  now?: Date;\n  providerFetch?: SuperQiFetch;\n}): Promise<{\n  order: SaasBillingOrderRecord;\n  duplicate: boolean;\n  checkout:\n    | { provider: "test_fake"; checkout_reference: string; test_only: true }\n    | {\n        provider: "superqi_sandbox";\n        checkout_reference: string;\n        redirect_url: string;\n        test_only: true;\n      };\n}> {\n  const provider = getSaasBillingProviderState();\n  if (\n    !provider.checkout_available ||\n    !["test_fake", "superqi_sandbox"].includes(provider.provider)\n  ) {\n''',
)
replace_once(
    rel,
    '''        existing.amount_iqd !== plan.monthly_price_iqd ||\n        existing.catalog_version !== SAAS_PLAN_CATALOG_VERSION\n''',
    '''        existing.amount_iqd !== plan.monthly_price_iqd ||\n        existing.catalog_version !== SAAS_PLAN_CATALOG_VERSION ||\n        existing.provider !== provider.provider\n''',
)
replace_once(
    rel,
    '''      return {\n        order: existing,\n        duplicate: true,\n        checkout: {\n          provider: "test_fake" as const,\n          checkout_reference: existing.provider_checkout_ref || "",\n          test_only: true as const,\n        },\n      };\n''',
    '''      if (provider.provider === "superqi_sandbox") {\n        const redirectUrl = String(existing.metadata.provider_form_url || "").trim();\n        if (!existing.provider_checkout_ref || !redirectUrl) {\n          fail(\n            "SAAS_BILLING_PROVIDER_CHECKOUT_INCOMPLETE",\n            "SuperQi sandbox checkout is incomplete; use a new checkout request",\n            503,\n          );\n        }\n        return {\n          order: existing,\n          duplicate: true,\n          checkout: {\n            provider: "superqi_sandbox" as const,\n            checkout_reference: existing.provider_checkout_ref,\n            redirect_url: redirectUrl,\n            test_only: true as const,\n          },\n        };\n      }\n      return {\n        order: existing,\n        duplicate: true,\n        checkout: {\n          provider: "test_fake" as const,\n          checkout_reference: existing.provider_checkout_ref || "",\n          test_only: true as const,\n        },\n      };\n''',
)
old_block = '''    const orderId = `saas-billing-${crypto.randomUUID()}`;\n    const checkoutRef = `test-checkout-${crypto.randomUUID()}`;\n    const expiresAt = new Date(now.getTime() + 30 * 60 * 1000);\n    await client.query(\n      `INSERT INTO saas_billing_orders (\n         id, merchant_id, operation, requested_plan, amount_iqd, currency,\n         catalog_version, provider, status, idempotency_key,\n         provider_checkout_ref, request_expires_at, created_at, updated_at\n       ) VALUES ($1, $2, $3, $4, $5, 'IQD', $6, 'test_fake', 'pending', $7, $8, $9, $10, $10)`,\n      [\n        orderId,\n        merchantId,\n        input.operation,\n        input.plan,\n        plan.monthly_price_iqd,\n        SAAS_PLAN_CATALOG_VERSION,\n        idempotencyKey,\n        checkoutRef,\n        expiresAt,\n        now,\n      ],\n    );\n    const order = await loadOrder(client, orderId, true);\n    if (!order) fail("SAAS_BILLING_ORDER_NOT_FOUND", "SaaS billing order not found", 503);\n    return {\n      order,\n      duplicate: false,\n      checkout: {\n        provider: "test_fake" as const,\n        checkout_reference: checkoutRef,\n        test_only: true as const,\n      },\n    };\n'''
new_block = '''    const orderId = `saas-billing-${crypto.randomUUID()}`;\n    const providerRequestId =\n      provider.provider === "superqi_sandbox" ? crypto.randomUUID() : null;\n    const checkoutRef =\n      provider.provider === "test_fake"\n        ? `test-checkout-${crypto.randomUUID()}`\n        : null;\n    const expiresAt = new Date(now.getTime() + 30 * 60 * 1000);\n    const metadata = providerRequestId\n      ? { provider_request_id: providerRequestId }\n      : {};\n    await client.query(\n      `INSERT INTO saas_billing_orders (\n         id, merchant_id, operation, requested_plan, amount_iqd, currency,\n         catalog_version, provider, status, idempotency_key,\n         provider_checkout_ref, request_expires_at, metadata, created_at, updated_at\n       ) VALUES ($1, $2, $3, $4, $5, 'IQD', $6, $7, 'pending', $8, $9, $10, $11::jsonb, $12, $12)`,\n      [\n        orderId,\n        merchantId,\n        input.operation,\n        input.plan,\n        plan.monthly_price_iqd,\n        SAAS_PLAN_CATALOG_VERSION,\n        provider.provider,\n        idempotencyKey,\n        checkoutRef,\n        expiresAt,\n        JSON.stringify(metadata),\n        now,\n      ],\n    );\n\n    if (provider.provider === "superqi_sandbox") {\n      if (!providerRequestId) {\n        fail("SAAS_BILLING_PROVIDER_STATE_INVALID", "SuperQi sandbox request ID is missing", 503);\n      }\n      const payment = await createSuperQiSandboxPayment(\n        {\n          requestId: providerRequestId,\n          orderId,\n          amountIqd: plan.monthly_price_iqd,\n        },\n        input.providerFetch,\n      );\n      const attached = await client.query(\n        `UPDATE saas_billing_orders\n            SET provider_checkout_ref = $2,\n                metadata = metadata || $3::jsonb,\n                updated_at = $4\n          WHERE id = $1 AND provider = 'superqi_sandbox'\n          RETURNING id`,\n        [\n          orderId,\n          payment.paymentId,\n          JSON.stringify({ provider_form_url: payment.formUrl }),\n          now,\n        ],\n      );\n      if (attached.rows.length !== 1) {\n        fail("SAAS_BILLING_PROVIDER_REFERENCE_FAILED", "SuperQi sandbox reference was not attached", 503);\n      }\n      const order = await loadOrder(client, orderId, true);\n      if (!order) fail("SAAS_BILLING_ORDER_NOT_FOUND", "SaaS billing order not found", 503);\n      return {\n        order,\n        duplicate: false,\n        checkout: {\n          provider: "superqi_sandbox" as const,\n          checkout_reference: payment.paymentId,\n          redirect_url: payment.formUrl,\n          test_only: true as const,\n        },\n      };\n    }\n\n    const order = await loadOrder(client, orderId, true);\n    if (!order) fail("SAAS_BILLING_ORDER_NOT_FOUND", "SaaS billing order not found", 503);\n    return {\n      order,\n      duplicate: false,\n      checkout: {\n        provider: "test_fake" as const,\n        checkout_reference: checkoutRef || "",\n        test_only: true as const,\n      },\n    };\n'''
replace_once(rel, old_block, new_block)
replace_once(
    rel,
    '''export async function applyVerifiedSaasBillingProviderEvent(\n  input: VerifiedSaasBillingProviderEvent,\n): Promise<SaasBillingApplicationOutcome> {\n  if (process.env.NODE_ENV !== "test" || input.provider !== "test_fake") {\n    fail(\n      "SAAS_BILLING_PROVIDER_EVENT_UNAVAILABLE",\n      "no production SaaS billing provider adapter is configured",\n      503,\n    );\n  }\n''',
    '''export async function applyVerifiedSaasBillingProviderEvent(\n  input: VerifiedSaasBillingProviderEvent,\n): Promise<SaasBillingApplicationOutcome> {\n  const configuredProvider = getSaasBillingProviderState();\n  const providerEventAllowed =\n    (input.provider === "test_fake" && process.env.NODE_ENV === "test") ||\n    (input.provider === "superqi_sandbox" &&\n      process.env.NODE_ENV !== "production" &&\n      configuredProvider.provider === "superqi_sandbox" &&\n      configuredProvider.checkout_available);\n  if (!providerEventAllowed) {\n    fail(\n      "SAAS_BILLING_PROVIDER_EVENT_UNAVAILABLE",\n      "SaaS billing provider event is not enabled in this environment",\n      503,\n    );\n  }\n''',
)

# Provider webhook is intentionally public, but every state-changing event is
# verified by Qi RSA signature and then confirmed server-to-server by payment ID.
rel = "artifacts/api-server/src/routes/saas-billing.ts"
replace_once(
    rel,
    'import type { SubscriptionPlanCycleOperation } from "../services/subscriptionPlanCycleAuthority";\n',
    '''import type { SubscriptionPlanCycleOperation } from "../services/subscriptionPlanCycleAuthority";\nimport { handleSuperQiSandboxWebhook } from "../services/superQiSandboxWebhook";\nimport { SuperQiSandboxProviderError } from "../services/superQiSandboxTransport";\n''',
)
replace_once(
    rel,
    '''function authorityError(res: Response, error: unknown): void {\n  if (error instanceof SaasBillingAuthorityError) {\n''',
    '''function authorityError(res: Response, error: unknown): void {\n  if (error instanceof SuperQiSandboxProviderError) {\n    sendAuthError(res, error.status, error.code, error.message);\n    return;\n  }\n  if (error instanceof SaasBillingAuthorityError) {\n''',
)
replace_once(
    rel,
    '''router.get("/billing/catalog", requireSecureMerchantSession, (_req, res) => {\n''',
    '''router.post("/billing/providers/superqi/webhook", async (req, res) => {\n  const signature = String(req.headers["x-signature"] || "").trim();\n  if (!signature) {\n    sendAuthError(\n      res,\n      401,\n      "SUPERQI_SANDBOX_SIGNATURE_REQUIRED",\n      "SuperQi sandbox webhook signature is required",\n    );\n    return;\n  }\n  try {\n    const result = await handleSuperQiSandboxWebhook({\n      payload: req.body || {},\n      signature,\n    });\n    res.setHeader("Cache-Control", "no-store");\n    res.status(200).json({ ok: true, status: result.status });\n  } catch (error) {\n    authorityError(res, error);\n  }\n});\n\nrouter.get("/billing/catalog", requireSecureMerchantSession, (_req, res) => {\n''',
)

# Merchant UI redirects only to the server-provided Qi hosted form URL. It never
# treats browser return/redirect as proof of payment.
rel = "artifacts/fawri/src/components/SaasBillingPanel.tsx"
replace_once(
    rel,
    "  provider: 'disabled' | 'test_fake' | 'unsupported';\n",
    "  provider: 'disabled' | 'test_fake' | 'superqi_sandbox' | 'unsupported';\n",
)
replace_once(
    rel,
    "    checkoutCreated: 'تم إنشاء طلب الدفع',\n",
    "    checkoutCreated: 'تم إنشاء طلب الدفع',\n    sandboxNotice: 'أنت تستخدم بيئة اختبار SuperQi. لا يتم استخدام أموال حقيقية في هذا الوضع.',\n",
)
replace_once(
    rel,
    "    checkoutCreated: 'Billing order created',\n",
    "    checkoutCreated: 'Billing order created',\n    sandboxNotice: 'SuperQi sandbox is active. No real money is used in this mode.',\n",
)
replace_once(
    rel,
    "    checkoutCreated: 'داواکاری پارەدان دروست کرا',\n",
    "    checkoutCreated: 'داواکاری پارەدان دروست کرا',\n    sandboxNotice: 'ژینگەی تاقیکردنەوەی SuperQi چالاکە. لەم دۆخەدا پارەی ڕاستەقینە بەکارناهێنرێت.',\n",
)
replace_once(
    rel,
    '''      toast.success(text.checkoutCreated);\n      await load();\n''',
    '''      const redirectUrl =\n        typeof data?.checkout?.redirect_url === 'string'\n          ? data.checkout.redirect_url.trim()\n          : '';\n      if (catalog.provider.provider === 'superqi_sandbox') {\n        if (!redirectUrl) throw new Error(text.checkoutUnavailable);\n        window.location.assign(redirectUrl);\n        return;\n      }\n      toast.success(text.checkoutCreated);\n      await load();\n''',
)
replace_once(
    rel,
    '''        {!catalog.provider.checkout_available && (\n          <Alert>\n            <AlertTitle>{text.checkoutUnavailable}</AlertTitle>\n            <AlertDescription>{text.providerDisabled}</AlertDescription>\n          </Alert>\n        )}\n''',
    '''        {!catalog.provider.checkout_available && (\n          <Alert>\n            <AlertTitle>{text.checkoutUnavailable}</AlertTitle>\n            <AlertDescription>{text.providerDisabled}</AlertDescription>\n          </Alert>\n        )}\n        {catalog.provider.provider === 'superqi_sandbox' &&\n          catalog.provider.checkout_available && (\n            <Alert>\n              <AlertDescription>{text.sandboxNotice}</AlertDescription>\n            </Alert>\n          )}\n''',
)

rel = "artifacts/fawri/tests/saas-billing-ui.test.ts"
replace_once(
    rel,
    '''  assert.match(panel, /order\\.amount_iqd\\.toLocaleString/);\n});\n''',
    '''  assert.match(panel, /order\\.amount_iqd\\.toLocaleString/);\n  assert.match(panel, /superqi_sandbox/);\n  assert.match(panel, /window\\.location\\.assign\\(redirectUrl\\)/);\n  assert.match(panel, /checkout\\?\\.redirect_url/);\n  assert.doesNotMatch(panel, /[?&]paid=true/);\n});\n''',
)

print("SuperQi sandbox provider patch applied")
