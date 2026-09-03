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

The existing Messenger/Instagram PostgreSQL authority explicitly lists only `messenger` and `instagram`, so dormant WhatsApp rows cannot leak into the legacy Meta runtime path.

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

### Durable intake and encrypted privileged payload boundary

`whatsappInboundIntakePlan.ts` describes the single-transaction relationship between:

- `channel_inbound_events`, which provides provider-event dedupe and enqueue linkage; and
- the corresponding administrative `background_jobs` row.

`whatsappPrivilegedJobPlan.ts` separates the administrative job row from its privileged payload. The administrative row contains only bounded routing/dedupe metadata and a payload hash. The normalized job payload is explicitly marked as plaintext input for a future encryption boundary, with plaintext persistence forbidden.

A future PostgreSQL adapter must atomically persist the inbound-event marker, administrative background job, and encrypted privileged payload record. This branch performs none of those writes.

`whatsappDurableQueuePlan.ts` defines deterministic queue envelopes/dedupe keys without invoking or starting a worker. WhatsApp planners have no dependency on the legacy JSON `durableJobQueue`/`JsonFileStore`; the dormant repository audit rejects those references from WhatsApp services.

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

`whatsappOutboundDeliveryPersistence.ts`, `whatsappDeliveryCorrelation.ts`, `whatsappDeliveryLifecycle.ts`, and `whatsappDeliveryReconciliation.ts` define provider-message correlation and monotonic delivery-state handling.

Delivery correlation is fail closed across merchant, channel, WABA, phone-number ID, provider message ID, and recipient identity. A trusted expected recipient must come from the original outbound request/encrypted attempt authority; a status webhook is not allowed to establish or replace that ownership. Once a recipient is known, later provider statuses for a different recipient are rejected. Missing provider `recipient_id` does not erase the trusted recipient.

Conflicting or regressive terminal statuses move to/retain uncertainty rather than silently restoring certainty. An uncertain delivery remains a reconciliation condition and does not authorize resend.

`whatsappOfflineOutboundRehearsal.ts` exercises the complete request/attempt/outcome/persistence/delivery contract only through scripted fake transport observations. It accepts no activation override and has no network/provider capability.

## Data handling and diagnostics

`whatsappDataPolicy.ts` explicitly allows only normalized operational application data and safe provider references.

Forbidden in the dormant phase:

- raw webhook persistence;
- raw webhook logging;
- provider media binary persistence;
- provider media fetching;
- raw customer payloads in diagnostics;
- raw channel/customer/provider identifiers in diagnostics;
- dormant credential storage;
- plaintext persistence of privileged background-job payloads.

Durable privileged job payloads require the existing encrypted payload boundary. Diagnostic helpers emit bounded operational codes and hashes instead of customer/business payloads.

## Runtime isolation

The running API (`app.ts` / `index.ts`) does not mount or start WhatsApp code. The existing `metaWebhookWorker.ts` does not accept WhatsApp job types.

`whatsapp-dormant-runtime-audit.test.ts` guards this property during final validation. `scripts/audit-whatsapp-dormant-boundary.mjs` provides the repository-level dormant-boundary audit and rejects active WhatsApp routing, provider transport, credential operations, worker startup, queue writes, legacy JSON queue/store references, and direct WhatsApp secret-environment consumption.

## Activation readiness

`whatsappActivationReadiness.ts` can report an `activation_candidate`, but it cannot activate anything.

An activation candidate is restricted to **production** and remains blocked unless all required evidence is explicitly true, including:

- explicit cutover approval;
- pinned deployment revision;
- replacement of the dormant database barrier;
- verified channel identity;
- business verification readiness;
- Meta app configuration readiness;
- production credential-provider readiness and configured credential;
- webhook verification readiness;
- webhook raw-body signature-verification readiness;
- App Secret configuration readiness;
- PostgreSQL durable queue readiness;
- encrypted privileged-job payload authority readiness;
- inbound persistence readiness;
- reply-engine handoff readiness;
- data/media-policy readiness;
- inbound worker readiness;
- outbound transport readiness;
- delivery reconciliation readiness;
- observability readiness.

These are evidence booleans only. The readiness function never accepts secret values. Development or staging cannot become an external activation candidate even when every boolean is true.

## Shared database structures

The foundation uses existing Fawri messaging authorities rather than creating a second conversation system:

- `merchant_channels` for tenant channel identity;
- `channel_inbound_events` for provider-event dedupe and durable-enqueue linkage;
- `background_jobs` plus encrypted privileged job payload storage;
- `conversations` and `messages` for the merchant-facing conversation model;
- `outbound_deliveries` for send/delivery reconciliation.

The dormant branch defines plans/contracts around these authorities; it does not start a WhatsApp persistence executor or worker.

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

GitHub Actions is not being used for this development pass. Per the project execution plan, WhatsApp tests, typechecks, builds, and the dormant-boundary audit are **not being executed incrementally**. They will be run together from Replit Shell after development is complete.

The final Replit validation session must run at least:

```sh
pnpm --filter @workspace/api-server run verify:whatsapp-offline
pnpm --filter @workspace/db run typecheck
node scripts/audit-whatsapp-dormant-boundary.mjs
```

The API aggregate command runs, in order:

1. API TypeScript typecheck;
2. every `whatsapp-*.test.ts` test;
3. API build.

The final Replit session must then run the wider repository/integration checks required by the integration checkpoint before this PR is considered merge-ready. Until that session is performed, this document and PR must not claim that tests have passed.
