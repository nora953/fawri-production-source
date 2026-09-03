# WhatsApp Business Platform — Dormant Offline Foundation

## Status

This branch prepares Fawri for a future WhatsApp Business Platform integration while keeping WhatsApp physically disconnected from the running application.

Current state: **dormant/offline only**.

The code in this phase must not:

- mount a WhatsApp HTTP webhook route;
- start a WhatsApp worker;
- call Meta Graph API;
- request, store, decrypt, or send a WhatsApp access token or App Secret;
- subscribe a WABA or phone number to webhooks;
- perform OAuth or Embedded Signup;
- activate a WhatsApp merchant channel;
- change Messenger or Instagram runtime behavior.

`FAWRI_WHATSAPP_OFFLINE_FOUNDATION` and `FAWRI_WHATSAPP_LIVE_CUTOVER` are independent fail-closed predicates. The live application entry points do not consume either switch in this dormant phase.

## Offline architecture

The foundation is deliberately split into pure contracts and plans so provider-facing activation can be added later without changing the safety rules already established here.

### Inbound webhook normalization

`whatsappWebhookContract.ts`

- accepts only `whatsapp_business_account` payloads;
- requires numeric WABA and phone-number identities;
- normalizes messages, statuses, and provider errors;
- creates deterministic provider event identities;
- deduplicates identical events within one delivery;
- bounds normalized customer text before it can enter a queue plan;
- validates WhatsApp customer/recipient identifiers;
- normalizes safe media/provider references without downloading media.

Supported provider-reference shapes include:

- image, audio, video, document, and sticker media IDs plus bounded metadata;
- location coordinates plus bounded name/address;
- reaction target plus emoji;
- contact count only.

No media binary is downloaded or persisted by this foundation.

### Dormant channel authority

`whatsappDormantChannelAuthority.ts` and `whatsappDormantChannelResolver.ts`

A WABA + phone-number identity can resolve only to a single tenant-owned WhatsApp channel that remains:

- `platform = whatsapp`;
- `status = pending`;
- `integration_mode = dormant_offline`;
- free of live credentials, connected state, and webhook subscription state.

Missing, duplicate, cross-tenant, or mismatched mappings fail closed.

### Webhook planning and durable intake

`whatsappWebhookPlanner.ts`

Converts normalized events into merchant/channel-resolved plans for:

- inbound messages;
- delivery statuses;
- provider errors.

`whatsappInboundIntakePlan.ts`

Describes the required atomic boundary between:

- `channel_inbound_events` provider dedupe marker; and
- its durable background job.

The job payload is marked as requiring encrypted privileged-payload storage. The planner does not perform the write or enqueue operation itself.

`whatsappDurableQueuePlan.ts`

Defines queue envelopes and deterministic dedupe keys without starting or invoking a worker.

### Shared conversation path

`whatsappInboundBridge.ts`

Converts a resolved WhatsApp inbound job to a channel-neutral message using the real Fawri `channel_id`. Deterministic conversation identity includes tenant + channel + customer identity.

Automatic-reply eligibility is limited to bounded normalized text/button/interactive content. Media and other non-text content fail closed to merchant/manual handling.

`whatsappConversationPersistencePlan.ts`

Defines the shared `conversations` + `messages` persistence shape without issuing SQL. It requires a future adapter to verify the matching inbound-event marker and commit the records transactionally.

- eligible text starts as `auto_replying`;
- media/non-text/over-limit content starts as `needs_reply`;
- customer messages are planned as `received`;
- safe provider references may be stored in application message metadata;
- raw webhook bodies and media binaries are not part of the persistence plan.

`whatsappReplyDecisionHandoff.ts`

Maps only eligible normalized WhatsApp text into the existing Fawri knowledge decision request shape. It does not call the decision engine.

`whatsappInboundProcessingPlan.ts`

Composes the bridge, persistence plan, and reply-decision handoff while preserving the required order:

1. validate/bridge;
2. persist the inbound conversation/message;
3. only then evaluate eligible text through the shared reply engine.

Media/non-text messages are persisted for merchant handling and never receive an automatic decision through this plan.

## Outbound and delivery safety

`whatsappOfflineContracts.ts`

Builds credential-free WhatsApp text-send request plans and classifies an already-observed provider response. It never performs the network call.

A send is `sent` only when a successful HTTP response contains a provider message ID. Timeout-like, throttled, server, or otherwise ambiguous outcomes remain `uncertain`.

`whatsappOutboundAttempt.ts`, `whatsappOutboundPolicy.ts`, and `whatsappRetryPolicy.ts`

Define the future send lifecycle so:

- successful sends are not resent;
- uncertain sends are not blindly resent;
- confirmed deterministic failures can follow the controlled failure/refund path;
- configuration/auth failures do not enter unsafe retry loops;
- transient/ambiguous transport failures require reconciliation rather than duplicate sends.

`whatsappOutboundDeliveryPersistence.ts`, `whatsappDeliveryCorrelation.ts`, `whatsappDeliveryLifecycle.ts`, and `whatsappDeliveryReconciliation.ts`

Define provider-message correlation and monotonic delivery-state handling. Conflicting, regressive, or cross-tenant/channel statuses fail closed. An uncertain delivery remains a manual-reconciliation condition and does not authorize resend.

## Data handling

`whatsappDataPolicy.ts`

The dormant policy explicitly allows only normalized operational application data and safe provider references.

Forbidden in this phase:

- raw webhook persistence;
- raw webhook logging;
- provider media binary persistence;
- provider media fetching;
- raw customer payloads in diagnostics;
- raw channel/customer/provider identifiers in diagnostics;
- dormant credential storage.

Durable privileged job payloads require the existing encrypted payload boundary. Diagnostic helpers emit bounded operational codes and hashes instead of customer/business payloads.

## Runtime isolation

The running API (`app.ts` / `index.ts`) does not mount or start WhatsApp code. The existing Meta worker does not accept WhatsApp job types.

`whatsapp-dormant-runtime-audit.test.ts` exists to guard this property during the final verification pass.

## Activation readiness

`whatsappActivationReadiness.ts` can report an `activation_candidate`, but it cannot activate anything.

Activation remains blocked unless all external and internal evidence is explicitly true, including:

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

These are evidence flags only; secret values are never accepted by the readiness function.

## Shared database structures

The foundation is designed around existing Fawri shared authorities rather than a second messaging system:

- `merchant_channels` for tenant channel identity;
- `channel_inbound_events` for provider-event dedupe and durable-enqueue linkage;
- `background_jobs` plus encrypted privileged job payload storage;
- `conversations` and `messages` for the merchant-facing conversation model;
- `outbound_deliveries` for send/delivery reconciliation.

No live WhatsApp route or worker is required to build or statically validate these contracts.

## Final verification — intentionally deferred

GitHub Actions is currently not being used for this development pass. Per the project execution plan, the WhatsApp tests and build are **not being executed incrementally**. They will be run together from Replit Shell only after development is complete.

The API package now provides one aggregate command:

```sh
pnpm --filter @workspace/api-server run verify:whatsapp-offline
```

It runs, in order:

1. API TypeScript typecheck;
2. every `whatsapp-*.test.ts` test;
3. API build.

Before the final validation session, install the repository dependencies using the pinned pnpm workspace setup. The wider repository build/test commands should then be run in the same Replit validation session as required by the final integration checkpoint.

Until that final session is performed, no document or PR should claim that the tests have passed.
