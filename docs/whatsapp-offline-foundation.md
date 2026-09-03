# WhatsApp Business Platform — dormant offline foundation

This branch prepares Fawri for a future WhatsApp Business Platform integration while keeping WhatsApp physically disconnected from the running application.

Current state: **dormant/offline only**.

## Current no-Meta boundary

This phase must not:

- mount a WhatsApp HTTP webhook route;
- start a WhatsApp worker;
- call Meta Graph API;
- request, store, decrypt, or send a WhatsApp access token or App Secret;
- subscribe a WABA or phone number to webhooks;
- perform OAuth or Embedded Signup;
- activate a WhatsApp merchant channel;
- change Messenger or Instagram runtime behavior;
- perform a production cutover.

`FAWRI_WHATSAPP_OFFLINE_FOUNDATION` and `FAWRI_WHATSAPP_LIVE_CUTOVER` are independent fail-closed predicates. The live API entry points do not consume either switch in this dormant phase.

## Dormant PostgreSQL identity authority

Migration `0012_whatsapp_dormant_channel_identity` extends the existing `merchant_channels` authority with explicit WhatsApp identity fields:

- `whatsapp_business_account_id`;
- `whatsapp_phone_number_id`;
- `whatsapp_display_phone_number`.

The phone-number identifier is globally unique and the WABA/phone pair is treated as one channel identity. Non-WhatsApp rows cannot populate WhatsApp identity fields.

The migration also installs a deliberate cutover barrier: WhatsApp rows must remain pending, credential-free, unsubscribed, without webhook activity, and without `connected_at`. A future live integration therefore requires an explicit migration that removes or replaces this constraint; setting an environment variable alone cannot turn a dormant record into a live channel.

`whatsappDormantChannelAuthority.ts` registers only validated dormant identity under the merchant tenant authority. `whatsappDormantChannelResolver.ts` resolves WABA + phone identity only when exactly one tenant-owned row remains `platform=whatsapp`, `status=pending`, and `integration_mode=dormant_offline`. Missing, duplicate, cross-tenant, or live-state mappings fail closed.

## Offline inbound architecture

### Webhook normalization

`whatsappWebhookContract.ts` is pure and side-effect free. It:

- accepts only `whatsapp_business_account` payloads;
- requires numeric WABA and phone-number identities;
- validates WhatsApp customer and delivery-recipient identifiers;
- normalizes messages, statuses, and provider errors;
- creates deterministic provider event identities;
- deduplicates identical events within one delivery;
- bounds normalized customer text before it can enter a queue plan;
- normalizes safe provider references without downloading media.

Supported provider-reference shapes include:

- image, audio, video, document, and sticker media IDs plus bounded metadata;
- location coordinates plus bounded name/address;
- reaction target plus emoji;
- contact count only.

No provider media binary is downloaded or stored by this foundation.

### Tenant/channel resolution and webhook planning

`whatsappWebhookPlanner.ts` combines normalized events with the dormant channel resolver and produces merchant/channel-resolved plans for:

- inbound messages;
- delivery statuses;
- provider errors.

The planner rejects channel mapping mismatches and event identity collisions.

### Durable intake boundary

`whatsappInboundIntakePlan.ts` describes the single-transaction relationship between:

- `channel_inbound_events`, which provides provider-event dedupe and enqueue linkage; and
- the corresponding durable background job.

The job payload is marked as requiring encrypted privileged-payload storage. The planner itself performs neither SQL nor enqueue.

`whatsappDurableQueuePlan.ts` defines deterministic queue envelopes/dedupe keys without invoking or starting a worker.

## Shared conversation and reply-engine path

`whatsappInboundBridge.ts` converts a resolved WhatsApp inbound job into a channel-neutral message using the actual Fawri `channel_id`. Deterministic conversation identity includes tenant + channel + customer identity.

Automatic-reply eligibility is limited to bounded normalized text/button/interactive content. Media and other non-text content fail closed to merchant/manual handling.

`whatsappConversationPersistencePlan.ts` defines the shared `conversations` + `messages` write shape without issuing SQL. A future adapter must verify the matching `channel_inbound_events` marker and commit the conversation/message transactionally.

- eligible text starts as `auto_replying`;
- media/non-text/over-limit content starts as `needs_reply`;
- customer messages are planned as `received`;
- safe provider references may be stored in message metadata;
- raw webhook bodies and media binaries are excluded.

`whatsappReplyDecisionHandoff.ts` maps only eligible normalized text into the existing Fawri knowledge-decision request shape. It does not invoke the decision engine.

`whatsappInboundProcessingPlan.ts` composes the dormant sequence:

1. validate and bridge;
2. prepare conversation/message persistence;
3. only for eligible text, prepare the shared reply-decision handoff.

Media, missing text, and reply-engine-over-limit content remain merchant/manual work and never receive an automatic decision through this plan.

## Outbound and delivery safety

`whatsappOfflineContracts.ts` builds credential-free WhatsApp text-send request plans and classifies an already-observed provider response. It never performs a network request.

A send is considered `sent` only when a successful HTTP response contains a provider message ID. Timeout-like, throttled, server, or otherwise ambiguous outcomes remain `uncertain`.

`whatsappOutboundAttempt.ts`, `whatsappOutboundPolicy.ts`, and `whatsappRetryPolicy.ts` define the future lifecycle so:

- successful sends are not resent;
- uncertain sends are not blindly resent;
- confirmed deterministic failures can use the controlled failure/refund path;
- configuration/auth failures do not enter unsafe retry loops;
- transient/ambiguous transport failures require reconciliation rather than duplicate sends.

`whatsappOutboundDeliveryPersistence.ts`, `whatsappDeliveryCorrelation.ts`, `whatsappDeliveryLifecycle.ts`, and `whatsappDeliveryReconciliation.ts` define provider-message correlation and monotonic delivery-state handling. Conflicting, regressive, or cross-tenant/channel statuses fail closed. An uncertain delivery remains a manual-reconciliation condition and does not authorize resend.

## Data handling and diagnostics

`whatsappDataPolicy.ts` explicitly allows only normalized operational application data and safe provider references.

Forbidden in the dormant phase:

- raw webhook persistence;
- raw webhook logging;
- provider media binary persistence;
- provider media fetching;
- raw customer payloads in diagnostics;
- raw channel/customer/provider identifiers in diagnostics;
- dormant credential storage.

Durable privileged job payloads require the existing encrypted payload boundary. Diagnostic helpers emit bounded operational codes and hashes instead of customer/business payloads.

## Runtime isolation

The running API (`app.ts` / `index.ts`) does not mount or start WhatsApp code. The existing `metaWebhookWorker.ts` does not accept WhatsApp job types.

`whatsapp-dormant-runtime-audit.test.ts` guards this property during final validation. `scripts/audit-whatsapp-dormant-boundary.mjs` provides the repository-level dormant-boundary audit.

## Activation readiness

`whatsappActivationReadiness.ts` can report an `activation_candidate`, but it cannot activate anything.

Activation remains blocked unless all required evidence is explicitly true, including:

- explicit cutover approval;
- pinned deployment revision;
- replacement of the dormant database barrier;
- verified channel identity;
- business verification readiness;
- Meta app configuration readiness;
- production credential-provider readiness and configured credential;
- webhook verification/App Secret readiness;
- durable queue readiness;
- inbound persistence readiness;
- reply-engine handoff readiness;
- data/media-policy readiness;
- inbound worker readiness;
- outbound transport readiness;
- delivery reconciliation readiness;
- observability readiness.

These are evidence booleans only. The readiness function never accepts secret values.

## Shared database structures

The foundation uses existing Fawri messaging authorities rather than creating a second conversation system:

- `merchant_channels` for tenant channel identity;
- `channel_inbound_events` for provider-event dedupe and durable-enqueue linkage;
- `background_jobs` plus encrypted privileged job payload storage;
- `conversations` and `messages` for the merchant-facing conversation model;
- `outbound_deliveries` for send/delivery reconciliation.

## Still deliberately disabled

Even with the offline contracts complete, these live provider capabilities remain out of scope until a separate explicit cutover:

1. Embedded Signup/OAuth;
2. production access-token/App-Secret provisioning through the approved credential authority;
3. mounted WhatsApp webhook ingress and raw-body signature verification;
4. a started inbound/outbound WhatsApp worker;
5. real Graph API send transport;
6. WABA/phone webhook subscription;
7. provider sandbox/live proof and production activation.

The dormant database barrier must also be explicitly replaced before any channel can become connected.

## Final verification — intentionally deferred

GitHub Actions is not being used for this development pass. Per the project execution plan, WhatsApp tests and builds are **not being executed incrementally**. They will be run together from Replit Shell after development is complete.

The API package provides one aggregate verification command:

```sh
pnpm --filter @workspace/api-server run verify:whatsapp-offline
```

It runs, in order:

1. API TypeScript typecheck;
2. every `whatsapp-*.test.ts` test;
3. API build.

The final Replit validation session should also run the wider repository/integration checks required by the integration checkpoint. Until that session is performed, this document and PR must not claim that tests have passed.
