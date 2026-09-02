# WhatsApp offline foundation

This phase prepares Fawri for a future WhatsApp Business Platform integration without connecting Fawri to Meta.

## Current boundary

The WhatsApp foundation is intentionally dormant.

- No WhatsApp OAuth or Embedded Signup is mounted.
- No WhatsApp webhook route is mounted.
- No WhatsApp credential is requested, stored, decrypted, or sent.
- No WhatsApp Graph API request is made.
- No Meta subscription is created.
- No existing Messenger or Instagram flow is changed by this phase.
- No production deployment or cutover is performed.

The only executable capability added in this phase is a pure webhook-payload normalization contract that can be exercised with local fixtures and CI tests.

## Activation policy

`FAWRI_WHATSAPP_OFFLINE_FOUNDATION=1` may be used later to expose non-networked development features, but it is disabled by default.

`FAWRI_WHATSAPP_LIVE_CUTOVER=1` represents a future explicit live-cutover request. The current foundation does not consume this flag for networking or route activation. A future production integration must still pass the existing Fawri production release gates, credential-vault/KMS requirements, PostgreSQL authority requirements, webhook security checks, and dedicated WhatsApp activation tests.

## Future work, still disabled

1. Authoritative WABA and phone-number ownership model per merchant.
2. Encrypted credential storage using the existing credential-vault provider contract.
3. Embedded Signup/OAuth adapter behind an explicit cutover gate.
4. WhatsApp webhook ingress with raw-body signature verification and durable queueing.
5. Channel-neutral normalized message jobs into the existing reply/commerce engine.
6. WhatsApp send transport with idempotency and uncertain-delivery reconciliation.
7. Status-webhook reconciliation for sent, delivered, read, failed, and deleted lifecycle states.
8. End-to-end fake transport and disposable integration tests.
9. Only after project completion: Meta app configuration, permissions review, real credentials, sandbox proof, and live cutover.

Until those steps are deliberately approved, Meta remains disconnected.
