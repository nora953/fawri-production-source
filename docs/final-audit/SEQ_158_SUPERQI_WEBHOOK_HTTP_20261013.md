# SEQ-158 — SuperQi sandbox webhook HTTP failure semantics (2026-10-13)

Source-only audit. No gateway request, browser, production payment, or database mutation.

- `artifacts/api-server/src/routes/saas-billing.ts` lines 41–61 exposes POST `/billing/providers/superqi/webhook`; missing x-signature returns 401. Success after `handleSuperQiSandboxWebhook` returns HTTP 200 `{ok:true,status:...}`.
- The route catches thrown errors and calls `authorityError` (lines 24–37). A generic PostgreSQL P0001 is neither `SuperQiSandboxProviderError` nor `SaasBillingAuthorityError`; therefore the route returns **HTTP 503** `SAAS_BILLING_UNAVAILABLE`, not a successful acknowledgement. This bounds the prior SEQ-154 SQL fault: gateway has an HTTP non-2xx signal, so there is **no source proof of silent successful acknowledgement**. Actual SuperQi gateway retry contract is still unverified.
- `artifacts/api-server/src/services/superQiSandboxWebhook.ts` lines 191–285 verifies signature, confirmed upstream payment status and reference, and awaits `applyVerifiedCashierBillingProviderEvent` for cashier subscriptions. When `findBillingOrder` returns null, returns `{status:'ignored',reason:'order_not_found'}` which route converts to HTTP **200**. This is a **candidate durability gap** if provider payment precedes locally discoverable order or mapping temporarily fails. No evidence of a real missing paid order or provider retries; needs synthetic out-of-order webhook test and expected provider contract.
- Sandbox transport explicitly forbids production mode; no conclusions about production provider gateway behavior.

Classification: `CASHIER-BILLING-SQL-RECOVERY-001` remains open with bounded non-2xx handling; new `SUPERQI-ORDER-NOT-FOUND-ACK-001` TRIAGE source-only, not a confirmed lost payment.

Next: actual synthetic route test missing order 200, generic P0001 503, provider retry duplicate; verify expected gateway behavior before assigning severity. Release BLOCKED, planning estimate ~54% audited /46% remaining; no fixes.
