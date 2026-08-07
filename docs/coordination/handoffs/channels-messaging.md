# Channels and messaging handoff

## Branch and baseline

- Branch: `parallel/channels-messaging`
- Starting SHA: `b08c854f177953d3690c5dffde905fdb0c93eb09`
- Final implementation SHA: `baa3f2ab74b6fd308b6631d0dc0a94d2c7e230e7`
- Shared files modified: none
- Real Meta calls in tests: none

## Completed implementation

- Exact raw-body HMAC verification fails closed.
- Unknown page/directory failures return 503 and remain retryable.
- HTTP 200 is emitted only after durable enqueue/deduplication succeeds.
- Event, job, reply, charge, and refund idempotency are layered independently.
- Queue leases, heartbeats, backoff, crash reconciliation, safe/blocked DLQ, and
  payload-free summaries are implemented.
- Uncertain reply outcomes are non-retryable and cannot be manually requeued.
- Confirmed failures create a high-priority durable refund job; refund ledger is
  one-time and crash-recoverable, and the refunded reply job is blocked from
  later manual replay.
- Suspended/rejected merchant state is rechecked before delivery. Existing
  merchant webhook filtering also prevents automated and manual-takeover
  processing for those accounts.
- Meta channel lifecycle, optimistic versioning, durable disconnect, and
  AES-256-GCM credential storage are implemented.
- Merchant channel UI reads server state and never receives a token.
- Administrative DLQ router factory and CLI expose summaries without payloads.
- Static background-job audit does not print payloads.

## Files changed or added

### API middleware

- `artifacts/api-server/src/middleware/metaWebhookSecurity.ts`
- `artifacts/api-server/src/middleware/merchantWebhookAccess.ts`
- `artifacts/api-server/src/middleware/metaWebhookQueueIngress.ts`

### API services and routes

- `artifacts/api-server/src/services/durableJobQueue.ts`
- `artifacts/api-server/src/services/merchantReplyEntitlement.ts`
- `artifacts/api-server/src/services/merchantReplyRefund.ts`
- `artifacts/api-server/src/services/metaWebhookWorker.ts`
- `artifacts/api-server/src/services/metaPageDirectory.ts`
- `artifacts/api-server/src/services/metaCredentialVault.ts`
- `artifacts/api-server/src/services/metaChannelRuntime.ts`
- `artifacts/api-server/src/services/metaChannelJobs.ts`
- `artifacts/api-server/src/routes/channel-operations.ts`
- `artifacts/api-server/src/routes/durable-job-admin.ts`

### Frontend, tests, audit, and documentation

- `artifacts/fawri/src/pages/dashboard/ServerChannelsPage.tsx`
- `artifacts/fawri/src/components/channels/ChannelStatusCard.tsx`
- `artifacts/api-server/tests/durable-job-queue.test.ts`
- `artifacts/api-server/tests/meta-webhook-signature.test.ts`
- `artifacts/api-server/tests/merchant-reply-refund.test.ts`
- `artifacts/api-server/tests/merchant-reply-entitlement-lock.test.ts`
- `artifacts/api-server/tests/meta-webhook-ingress.test.ts`
- `artifacts/api-server/tests/merchant-webhook-access.test.ts`
- `artifacts/api-server/tests/meta-credential-vault.test.ts`
- `artifacts/api-server/tests/meta-channel-runtime.test.ts`
- `artifacts/api-server/tests/meta-channel-jobs.test.ts`
- `scripts/manage-durable-jobs.ts`
- `scripts/audit-fawri-background-jobs.mjs`
- `docs/meta-webhook-hardening.md`
- `docs/channel-lifecycle.md`

## Verification performed

- Targeted TypeScript strict typecheck with temporary declarations: PASS.
- Targeted Node/ts-node test run: 13 tests, 13 passed, 0 failed.
  - durable dedupe/priority/retry/redaction/summary;
  - heartbeat and explicit expired-claim reconciliation;
  - blocked requeue for uncertain outcomes;
  - safe DLQ requeue;
  - worker crash reconciliation;
  - one-time confirmed-failure refund;
  - credential encryption/tamper detection;
  - tenant-scoped channel lifecycle;
  - injected fake Meta disconnect transport;
  - exact raw-byte signature verification;
  - 200 only after durable enqueue and 503 on queue failure;
  - unknown page returns retryable 503;
  - active entitlement lock fails closed without charging.
- `node scripts/audit-fawri-background-jobs.mjs <tree>`: PASS.
- `node --check scripts/audit-fawri-background-jobs.mjs`: PASS.

Package scripts were not changed because `package.json` is shared/reserved.

## Required integration changes in shared files

These changes are intentionally not made on this branch.

1. **Mount merchant channel router in `app.ts`**
   - Import `channel-operations.ts`.
   - Mount with `app.use("/api", channelOperationsRouter)` after operational
     merchant middleware and before the legacy root router.

2. **Mount administrative DLQ router with real authorization**
   - Bind `createDurableJobAdminRouter` to existing admin session middleware.
   - GET summary should require `view_logs` or `manage_channels`.
   - Requeue should require `manage_channels` (owner or explicitly permitted
     assistant). Do not expose a payload query option.

3. **Migrate the legacy Meta OAuth callback in `routes/index.ts`**
   - Replace plaintext `page_access_token` persistence with
     `connectMetaChannel(...)`.
   - Remove logging of token exchange/account response bodies.
   - Persist only safe error codes, not Meta response payloads.

4. **Migrate the legacy Messenger send path in `routes/index.ts`**
   - Replace reads of `connection.page_access_token` with
     `readMetaChannelCredential(...)`.
   - Remove the production plaintext environment fallback.
   - Replace `console.error(..., result)` with a safe status/error-code log.

5. **Frontend route selection**
   - Route `/dashboard/channels` to `ServerChannelsPage.tsx` after API router
     mounting. Do not modify shared translations for this merge; localized copy
     can be supplied by the integration lane later.

6. **Package/workflow wiring**
   - Add scripts for the six targeted tests, the background-job audit, and the
     DLQ CLI. No workflow should use real Meta credentials.

## Required secrets and key management

- Development/single-node fallback:
  - `FAWRI_META_TOKEN_KEY_ID`
  - `FAWRI_META_TOKEN_KEY_BASE64` (32 random bytes, base64)
- Production: implement `MetaCredentialKeyProvider` with KMS/HSM data keys,
  audit key access, and define rotation/retirement policy.
- Never place either secret in GitHub, logs, support exports, or frontend env.

## PostgreSQL/schema request for production cutover

The JSON implementation is a safe single-host compatibility layer, not the
multi-replica production source of truth. The database lane should add
transactional equivalents with unique constraints:

- `durable_jobs`: unique `(job_type, dedupe_key)`, status, attempts,
  `available_at`, lease owner/expiry, safe error code, requeue policy, encrypted
  or access-controlled payload, result metadata, timestamps.
- `channel_connections`: unique `(merchant_id, platform, external_page_id)`,
  status, connection version, encrypted credential envelope/key ID, webhook
  state, timestamps, safe error code.
- `inbound_events`: unique `(provider, external_event_id)` and durable enqueue
  transaction marker.
- `reply_reservations`: unique external event ID, exact debit source/batch,
  consumed status and balance-after-debit.
- `reply_refunds`: unique reservation ID, confirmed failure code, state
  (`pending/refunded/conflict`), timestamps.
- `outbound_deliveries`: unique external inbound event/reply intent with
  `pending/sent/confirmed_failed/uncertain` outcome.

Use row-level tenant constraints, `FOR UPDATE SKIP LOCKED` claims, database time
for leases, and one transaction for event enqueue plus dedupe. Reply debit and
refund must each be a single database transaction. Payload access should be a
separate privileged operation and remain absent from default admin inspection.

## Known risks until integration

- The shared OAuth/send route still contains legacy plaintext token storage and
  response-body logging; encrypted storage becomes authoritative only after the
  required shared-route migration.
- New merchant/admin routers and `ServerChannelsPage` are not mounted because
  `app.ts`, auth internals, and shared route selection are outside this lane.
- JSON locks protect one shared filesystem host, not multiple replicas. Use the
  requested PostgreSQL implementation before horizontal scaling.
- Real Meta behavior was deliberately not exercised. Integration testing must
  use a sandbox/fake transport unless an approved separate environment is
  explicitly created.
