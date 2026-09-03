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

The migration metadata keeps the Drizzle snapshot history ordered. The repository journal already contained migration 0011, so this branch backfills the missing `0011_snapshot.json` at the post-0011 commerce state and chains the new `0012_snapshot.json` from it. Static tests verify `0010 -> 0011 -> 0012`, verify that 0011 contains the commerce-promotion state but no WhatsApp identity fields, and verify that WhatsApp fields/constraints appear only in 0012.

`whatsappDormantChannelAuthority.ts` registers only validated dormant identity under the merchant tenant authority. `whatsappDormantChannelResolver.ts` resolves WABA + phone identity only when exactly one tenant-owned row remains `platform=whatsapp`, `status=pending`, and `integration_mode=dormant_offline`. Missing, duplicate, cross-tenant, or live-state mappings fail closed.

The existing Messenger/Instagram PostgreSQL authority explicitly lists only `messenger` and `instagram`, so dormant WhatsApp rows cannot leak into the legacy Meta runtime path.

## Offline inbound architecture

### Webhook normalization

`whatsappWebhookContract.ts` is pure and side-effect free. It:

- accepts only `whatsapp_business_account` payloads;
- requires numeric WABA and phone-number identities;
- validates WhatsApp customer and delivery-recipient identifiers;
- normalizes messages, statuses, and provider errors;
- creates compact deterministic provider event identities;
- deduplicates identical events and rejects conflicting identity collisions;
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

`whatsappPrivilegedJobPlan.ts` separates the administrative job row from its privileged payload. The administrative row contains only bounded routing/dedupe metadata and a payload hash. The normalized job payload is explicitly marked as plaintext input for a future encryption boundary, with plaintext persistence forbidden. The same encrypted privileged-payload contract also supports the future one-shot `whatsapp_outbound_send` work type without enabling a worker.

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

`whatsappOfflineContracts.ts` builds credential-free WhatsApp text-send request plans and classifies an already-observed provider response. It never performs a network request. Outbound text permits normal newlines/tabs but rejects unsafe non-printing control bytes before a future provider boundary.

A send is considered `sent` only when a successful HTTP response contains a provider message ID. Timeout-like, throttled, server, or otherwise ambiguous outcomes remain `uncertain`.

`whatsappOutboundAttempt.ts`, `whatsappOutboundPolicy.ts`, and `whatsappRetryPolicy.ts` define the future lifecycle so:

- successful sends are not resent;
- uncertain sends are not blindly resent;
- confirmed deterministic failures can use the controlled failure/refund path;
- configuration/auth failures do not enter unsafe retry loops;
- transient/ambiguous transport failures require reconciliation rather than duplicate sends.

An outbound attempt carries deterministic request, logical-send, recipient, and routing hashes/identities. The attempt is revalidated before durable dispatch and again before delivery-state persistence, so a mutated request/recipient/routing value cannot be finalized under stale identifiers.

A confirmed-failure retry cannot reuse the same reply-intent delivery identity. The existing `outbound_deliveries` uniqueness authority treats the merchant + inbound event + reply intent as one logical send, so any explicitly approved corrected resend must be represented by a new reply intent rather than overwriting or duplicating the prior delivery. Attempt number 2+ under the same reply intent is rejected.

`whatsappOutboundDispatchPlan.ts` defines the durable **pre-send** boundary for a future worker. It plans a pending `outbound_deliveries` row together with a one-attempt `whatsapp_outbound_send` background job. The complete provider request, including the trusted recipient, exists only in the encrypted privileged payload; the administrative delivery/job rows contain no plaintext phone number. The generic job is limited to one claim attempt so an ambiguous provider boundary cannot turn into a silent queue resend. This planner performs no SQL, enqueue, credential access, or transport.

Before a future live transport is allowed to execute, its persistence adapter must durably commit the pending delivery, administrative background job, and encrypted payload. The encrypted request recipient is then the trusted recipient authority used by delivery correlation; a later webhook status cannot establish or replace that ownership.

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

`whatsapp-dormant-runtime-audit.test.ts` guards this property during final validation. `scripts/audit-whatsapp-dormant-boundary.mjs` provides the repository-level dormant-boundary audit and rejects active WhatsApp routing, provider transport, credential operations, worker startup, queue writes, legacy JSON queue/store references, and direct WhatsApp secret-environment consumption. The audit also requires the encrypted inbound and outbound dispatch planners to remain present.

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
- durable outbound dispatch persistence readiness;
- outbound transport readiness;
- delivery reconciliation readiness;
- observability readiness.

These are evidence booleans only. The readiness function never accepts secret values. Development or staging cannot become an external activation candidate even when every boolean is true. Transport readiness cannot substitute for the durable pre-send dispatch persistence gate.

## Shared database structures

The foundation uses existing Fawri messaging authorities rather than creating a second conversation system:

- `merchant_channels` for tenant channel identity;
- `channel_inbound_events` for provider-event dedupe and durable-enqueue linkage;
- `background_jobs` plus encrypted privileged job payload storage;
- `conversations` and `messages` for the merchant-facing conversation model;
- `outbound_deliveries` for pre-send identity and send/delivery reconciliation.

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

No WhatsApp validation run is being deliberately started during this development pass. The WhatsApp-specific GitHub workflow is `workflow_dispatch` only. The repository already has broad pull-request workflows that GitHub automatically triggers when this branch changes; those automatic repository-wide runs are not being treated as validation evidence for the WhatsApp foundation.

The authoritative final validation will be run together from Replit Shell after development is complete.

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
