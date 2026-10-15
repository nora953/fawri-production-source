# SEQ-196–198 Payment identity audit (2026-10-13)

Read-only source review of saasBillingAuthority.ts and cashierBillingAuthority.ts. Both create a random orderId and providerRequestId, INSERT the order inside a database transaction, call createSuperQiSandboxPayment before commit, then UPDATE provider_checkout_ref inside the same transaction. A SQL failure after external payment creation can roll back both locally generated identities. Existing finding BILLING-EXTERNAL-TX-013; test billing-external-checkout-rollback-postgres.integration.test.mjs confirms this under synthetic P0001 injection.

SEQ-196 SaaS: createSaasBillingCheckout uses transaction(async client), randomUUID for orderId and providerRequestId, INSERT, external provider call, UPDATE provider_checkout_ref, loadOrder. No independent durable reservation boundary is visible in this path.

SEQ-197 cashier: createCashierBillingCheckout uses withMerchantOperationalTransaction, the same randomUUID / INSERT / external provider / UPDATE ordering. No independent durable reservation boundary is visible in this path.

SEQ-198 linked risk: retry after rolled-back transaction can allocate new provider request identity, while signed confirmed orphan webhook may return ignored/order_not_found (existing BILLING-WEBHOOK-ORPHAN-015). Do not infer a real lost payment or recommend weakening database constraints. No application code changes. Release BLOCKED. Planning estimate ~54% complete / 46% remaining. Previous SEQ-191–195 write attempts were blocked; this document only asserts the source evidence described here.