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

The offline foundation can normalize provider-shaped fixtures, validate merchant/WABA/phone identity, prepare queue/send contracts without I/O, and persist only a dormant server-side channel identity. None of those capabilities can activate Meta.

## Dormant PostgreSQL identity authority

Migration `0012_whatsapp_dormant_channel_identity` extends the existing `merchant_channels` authority with explicit:

- `whatsapp_business_account_id`
- `whatsapp_phone_number_id`
- `whatsapp_display_phone_number`

The phone-number identifier is globally unique and the WABA/phone pair is validated as one channel identity. Non-WhatsApp channel rows cannot populate these fields.

The migration also installs a deliberate cutover barrier: while this migration is current, every WhatsApp row must remain `pending`, credential-free, unsubscribed, without webhook activity, and without `connected_at`. A future live integration therefore requires an explicit migration that removes or replaces this database constraint; setting an environment variable alone cannot turn the dormant record into a live channel.

`whatsappDormantChannelAuthority.ts` can register the validated identity under the merchant tenant transaction. It never accepts credentials, never performs provider I/O, and fails closed if a row contains live state or if a phone-number identity is already mapped.

## Activation policy

`FAWRI_WHATSAPP_OFFLINE_FOUNDATION=1` may be used later to expose non-networked development features, but it is disabled by default.

`FAWRI_WHATSAPP_LIVE_CUTOVER=1` represents a future explicit live-cutover request. The current foundation does not consume this flag for networking or route activation. A future production integration must still pass the existing Fawri production release gates, credential-vault/KMS requirements, PostgreSQL authority requirements, webhook security checks, dedicated WhatsApp activation tests, and a migration that deliberately replaces the dormant-only database constraint.

## Future work, still disabled

1. Encrypted credential storage using the existing credential-vault provider contract.
2. Embedded Signup/OAuth adapter behind an explicit cutover gate.
3. WhatsApp webhook ingress with raw-body signature verification and durable queueing.
4. Channel-neutral normalized message jobs into the existing reply/commerce engine.
5. WhatsApp send transport with idempotency and uncertain-delivery reconciliation.
6. Status-webhook reconciliation for sent, delivered, read, failed, and deleted lifecycle states.
7. End-to-end fake transport and disposable integration tests.
8. Only after project completion: Meta app configuration, permissions review, real credentials, sandbox proof, and live cutover.

Until those steps are deliberately approved, Meta remains disconnected.
