# Fawri parallel integration status

## Coordination snapshot

- Base commit: `b08c854f177953d3690c5dffde905fdb0c93eb09`
- Integration branch: `parallel/integration-coordinator`
- Coordinator remote HEAD before the channels review update: `535e47f39e5e0ad8d8c377bcd86b0e2e54ee768b`
- Target after validation: `hardening/postgresql-foundation`
- `main` modification allowed: `no`
- Replit Agent allowed: `no`
- Initial monitoring scan: `2026-08-07 03:15 +03:00`
- Latest lane review: `2026-08-07 04:20 +03:00`

## Lane status

| Lane | Branch | Status | Reviewed SHA | Integrated SHA | Notes |
|---|---|---|---|---|---|
| PostgreSQL migration/cutover | `parallel/db-migration-cutover` | waiting for implementation and handoff | — | — | Integrate only after all domain schema requests are captured |
| Auth/session/admin security | `parallel/auth-session-hardening` | waiting for implementation and handoff | — | — | First lane in integration order |
| Channels/messaging | `parallel/channels-messaging` | reviewed; queued after auth/session | `22857159593aebeea0a12e6782581da6358080b3` | — | Allowlist compliant after scope correction; 13 documented tests passed; targeted strict TypeScript/audit/syntax/CLI checks passed; no CI run; activation prohibited until shared routes, plaintext-token migration, key management, PostgreSQL, and CI are completed |
| Orders/settings finalization | `parallel/orders-settings-finalization` | waiting for implementation and handoff | — | — | Third lane in integration order |
| Catalog/inventory | `parallel/catalog-inventory` | reviewed; queued for ordered integration | `ce363f7105f33e942c6c47ef8907dfb9b59658f6` | — | Allowlist compliant; 16 documented tests passed; isolated TypeScript checks passed; full workspace build and CI not run; integrate after auth, channels, and orders/settings |
| Knowledge/AI | `parallel/knowledge-ai` | waiting for implementation and handoff | — | — | Integrate after catalog/inventory |
| Quality/observability | `parallel/quality-observability` | waiting for implementation and handoff | — | — | Exclusive workflow ownership; integrate after database/workflow requests are available |

## Monitoring ledger

### 2026-08-07 03:15 +03:00 — initial branch scan

- Coordinator ancestry verified from the coordination base.
- All seven execution lanes were still at `b08c854f177953d3690c5dffde905fdb0c93eb09` and their handoffs were absent.
- Integration decision: no branch was eligible for review or merge.

### 2026-08-07 03:55 +03:00 — catalog/inventory review

- Reviewed `parallel/catalog-inventory` at `ce363f7105f33e942c6c47ef8907dfb9b59658f6`.
- The branch was 10 commits ahead of the coordination base, zero behind, and used the coordination base as merge base.
- All 10 changed paths were inside the catalog/inventory allowlist; no shared, workflow, package, lockfile, database, auth, Meta, orders/settings, or legacy `ProductsPage.tsx` file was changed.
- Handoff reviewed: `docs/coordination/handoffs/catalog-inventory.md`.
- Static review confirmed session-derived merchant authority, tenant-scoped operations, optimistic versions, idempotent create/import/inventory adjustment, non-negative stock, image-reference-only persistence, no operational browser-storage authority, and a read-only migration audit.
- No embedded credentials, production connection strings, customer payloads, or secrets were found in the changed files.
- Documented evidence: 16 tests passed, 0 failed; isolated TypeScript checks passed; no GitHub Actions/combined status existed; full workspace validation remains pending.
- Decision: accepted into the ordered queue, not merged.

### 2026-08-07 04:20 +03:00 — channels/messaging review

- Submitted branch: `parallel/channels-messaging`.
- User-reported final SHA `fd1a04638c5786940b724ec628adc32c4f7edc2e` was no longer the branch tip at review time.
- Rechecked current remote HEAD: `22857159593aebeea0a12e6782581da6358080b3`; the branch ref was identical to this SHA immediately before the coordinator update.
- Current ancestry: 6 commits ahead of `b08c854f177953d3690c5dffde905fdb0c93eb09`, zero behind, with the coordination base as merge base.
- The commit after `fd1a04638c5786940b724ec628adc32c4f7edc2e` changed only `docs/coordination/handoffs/channels-messaging.md` and corrected handoff SHA text; no new operational behavior was introduced.
- Initial implementation reviewed: `baa3f2ab74b6fd308b6631d0dc0a94d2c7e230e7`.
- Operational scope correction reviewed: `ef6296de2fbbebc872c5b1822d3466180103c957` (`Align channels lane paths with allowlist`). It removed the out-of-scope root `scripts/manage-durable-jobs.ts`, hardened the existing API CLI at `artifacts/api-server/scripts/manage-durable-jobs.ts`, and renamed `durable-job-admin.ts` to `channel-durable-job-admin.ts`.
- Documentation lineage note: `f9cef32e25d0bb4e44f67d254633534173a6715d` is not an ancestor of the current branch tip; it diverged from the current documentation lineage. The current handoff names `498e956a1dfeb8f7f0fa7b24a6818d4dc4ffde0d`, which is a documentation commit rather than the operational path-correction commit. This discrepancy is documented here and does not alter the reviewed operational tree.
- Handoff reviewed: `docs/coordination/handoffs/channels-messaging.md`.
- Final diff contained 29 changed paths. Every final path is inside the channels/messaging allowlist defined in the coordination plan:
  - Meta/merchant webhook middleware;
  - Meta, durable queue, entitlement, refund, and channel-specific services/routes;
  - `artifacts/api-server/scripts/manage-durable-jobs.ts`;
  - related channel/message/queue tests;
  - `ServerChannelsPage.tsx` and `components/channels/**`;
  - background-job audit and channel/Meta documentation.
- No auth/session file, merchant operational-access file, `app.ts`, `index.ts`, package file, lockfile, workflow, DB schema, shared frontend store/type/translation, orders/settings, catalog, or knowledge file remained changed in the final tree.
- Static security/behavior review confirmed:
  - exact raw-body HMAC verification and fail-closed behavior when the Meta secret or idempotency store is unavailable;
  - unknown page-directory state returns retryable 503 rather than acknowledging/dropping the event;
  - webhook HTTP 200 occurs only after durable enqueue/deduplication and processed-event persistence succeed;
  - durable queue dedupe by `(type, dedupe_key)`, priority ordering, leases, heartbeats, backoff, expired-claim reconciliation, and atomic file replacement under an exclusive lock;
  - uncertain delivery outcomes enter blocked DLQ state and cannot be manually requeued;
  - default admin/CLI summaries omit payload, result, and stored error-message content;
  - confirmed send failures enqueue a deduplicated high-priority refund job and block later replay of the failed reply job;
  - merchant operational state and auto-reply setting are rechecked before delivery;
  - channel list/disconnect routes derive merchant authority from the authenticated session and enforce operational access plus optimistic connection versions;
  - token envelopes use AES-256-GCM with associated data and an injectable key-provider contract; server summaries omit credential envelopes;
  - the new frontend page reads server state and contains no token or browser-storage authority.
- Static secret/PII review found no embedded access token, app secret, encryption key, production credential, real webhook payload, customer message, or production connection string in the changed source/tests/docs.
- Documented lane evidence after scope correction: 13 tests passed, 0 failed; targeted strict TypeScript check passed; background-jobs security audit passed; JavaScript syntax check passed; relocated CLI TypeScript check passed.
- Independent GitHub review found no combined commit status and no GitHub Actions run for the reviewed current SHA.
- Full workspace typecheck/build/tests, integrated auth/authorization tests, browser audit, PostgreSQL queue/refund tests, and fake-transport end-to-end validation remain mandatory at integration time.
- Decision: accepted into the ordered integration queue immediately after auth/session, not merged.
- No owner decision is required at this stage.

## Shared-file decisions

### Catalog/inventory requests — received and deferred

| Source lane | Shared path/area | Decision | Commit | Validation required | Deviation |
|---|---|---|---|---|---|
| Catalog/inventory | `artifacts/api-server/src/app.ts` | Defer router mount until final auth/session contract is integrated. | — | API typecheck and authenticated route tests | None yet |
| Catalog/inventory | `artifacts/api-server/src/routes/index.ts` | Defer tenant-scoped bot-product adapter and dual-authority removal. | — | Bot matching, tenant, visibility, and no-dual-authority tests | None yet |
| Catalog/inventory | API/root package scripts and workflows | Defer to final workspace conventions and quality lane review. | — | Frozen install, scripts, full validation | None yet |
| Catalog/inventory | Backup/restore and PostgreSQL schema | Forwarded to quality/database integration ledgers. | — | Disposable restore and migration validation | None yet |

### Channels/messaging requests — received and deferred

No shared file was changed during this review. Activation is explicitly blocked until all required wiring is completed.

| Source lane | Shared path/area | Decision | Commit | Validation required | Deviation |
|---|---|---|---|---|---|
| Channels/messaging | `artifacts/api-server/src/app.ts` | After auth integration, mount `channelOperationsRouter` behind merchant session/operational protection and before the legacy root router. Do not activate earlier. | — | Authenticated tenant isolation, suspended/rejected merchant, route-order, and disconnect tests | None yet |
| Channels/messaging | Admin router registration | Bind `createChannelDurableJobAdminRouter` to method/path-sensitive admin authorization: GET requires `view_logs` or `manage_channels`; requeue requires `manage_channels`. Never expose payload query modes. | — | Owner/assistant permission escalation and payload-redaction tests | The factory accepts one callback, so the integration callback must distinguish operation permissions |
| Channels/messaging | `artifacts/api-server/src/routes/index.ts` Meta OAuth callback | Replace plaintext `page_access_token` persistence with `connectMetaChannel`; remove token exchange/account response-body logging; retain only safe status/error codes. | — | Fake OAuth transport, encrypted-at-rest assertion, log redaction, rollback/migration tests | Mandatory before activation |
| Channels/messaging | `artifacts/api-server/src/routes/index.ts` Messenger send path | Replace plaintext token reads with `readMetaChannelCredential`; remove production plaintext environment fallback and unsafe response-body logs. | — | Fake send transport, key-unavailable fail-closed, uncertain outcome and no-token-log tests | Mandatory before activation |
| Channels/messaging | Frontend route activation | Route `/dashboard/channels` to `ServerChannelsPage.tsx` only after API/shared-route migration is complete. | — | Frontend typecheck/build and AR/KU/EN route review | Inline English copy remains until integration-owned localization decision |
| Channels/messaging | Package scripts and `.github/workflows/**` | Add targeted queue/webhook/refund/channel tests, audit, and CLI checks through final package conventions and quality-lane workflow ownership. No real Meta secrets. | — | CI path filters, fake transport, secret scanning, artifacts/log review | None yet |
| Channels/messaging | Key management | Environment key provider is permitted only for development/single-node use. Production requires KMS/HSM-backed `MetaCredentialKeyProvider`, access audit, rotation, and retirement policy. | — | Key rotation/retirement, tamper, unavailable-key, and no-frontend-secret tests | Mandatory before production activation |
| Channels/messaging | Backup/restore inventory | Include encrypted channel envelopes, queue, reservations/refunds, and key-ID dependencies without exporting plaintext tokens or payloads to normal reports. | — | Disposable backup/restore and key-availability validation | Forward to quality lane |

## Database/schema request ledger

### Catalog/inventory — captured for `parallel/db-migration-cutover`

Require tenant-safe catalog products/variants/options/identifiers/images, durable idempotency keys, transactional inventory mutations, composite merchant foreign keys, deterministic manifests/source hashes, reviewed cascade/retention, and aggregate variant-stock reconciliation.

### Channels/messaging — captured for `parallel/db-migration-cutover`

The coordinator has not edited the database lane. Reconcile the handoff against final domain contracts and require:

- `durable_jobs` with unique `(job_type, dedupe_key)`, safe state transitions, attempts, database-time leases, owner/expiry, retry/requeue policy, safe error code, access-controlled/encrypted payload, result metadata, timestamps, and `FOR UPDATE SKIP LOCKED` claims;
- `channel_connections` with tenant-safe uniqueness, platform/page identity, optimistic version, encrypted credential envelope/key ID, webhook state, safe error code, and lifecycle timestamps;
- `inbound_events` with unique `(provider, external_event_id)` and event-enqueue transaction marker;
- `reply_reservations` with unique external event ID, exact debit source/batch, consumed state, and balance-after-debit;
- `reply_refunds` with unique reservation identity and `pending/refunded/conflict` state;
- `outbound_deliveries` with one reply intent per inbound event and `pending/sent/confirmed_failed/uncertain` outcome;
- row-level tenant/composite constraints on every relationship;
- one transaction for inbound-event dedupe plus enqueue, one transaction for reply debit, and one transaction for refund;
- default administrative inspection that cannot read payloads; privileged payload access must be a separate audited operation;
- deterministic migration manifests and source revalidation before commit.

No schema request is implemented until the database lane handoff, generated migration, disposable PostgreSQL tests, backup/restore prerequisites, and final reconciliation are reviewed.

## Conflict and deviation ledger

- No unresolved cross-lane product-behavior conflict is recorded.
- Catalog integration depends on final auth/session and the reserved bot-product adapter.
- Channels integration depends on final auth/session/admin authorization contracts.
- Channels handoff SHA metadata does not perfectly describe the operational correction lineage. Coordinator-reviewed operational correction: `ef6296de2fbbebc872c5b1822d3466180103c957`; coordinator-reviewed final remote tree: `22857159593aebeea0a12e6782581da6358080b3`.
- The channels JSON stores are single-host compatibility layers and must not become horizontally scaled production authority. This is not accepted as the final PostgreSQL architecture.
- Channels must not be activated merely because the lane is later merged; activation requires completion of the shared-route plaintext-token migration, key management, PostgreSQL contracts, CI, and integrated tests above.

## Validation ledger

- No execution lane has been merged into `parallel/integration-coordinator` yet.
- Catalog static review completed at `ce363f7105f33e942c6c47ef8907dfb9b59658f6`; 16 documented tests passed, 0 failed; no CI run.
- Channels static review completed at `22857159593aebeea0a12e6782581da6358080b3`; 13 documented tests passed, 0 failed; targeted TypeScript/audit/syntax/CLI checks passed; no CI run.
- Full workspace typecheck/build/tests, browser operational-storage audit, tenant/auth/idempotency/payment tests, fake Meta transport tests, backup/restore validation, logs/artifact secret review, and final migration validation remain pending until ordered integration.

## Blockers requiring owner input

None. The channels lane is accepted for later ordered integration after auth/session, with activation gates recorded above.

## Final go/no-go checklist

- [ ] All lane handoffs reviewed.
- [ ] Allowlist compliance verified for every lane.
- [ ] Shared integration requests completed.
- [ ] Plaintext Meta token persistence/fallback/logging removed.
- [ ] Production credential key management and rotation verified.
- [ ] Schema requests integrated and final migration generated.
- [ ] Workflow requests integrated.
- [ ] Full server/frontend/database validation completed.
- [ ] Browser operational-storage audit passes enforcement.
- [ ] Tenant/auth/idempotency/payment/queue/refund tests pass.
- [ ] Backup/restore/rollback verified.
- [ ] Logs and artifacts checked for secrets/PII/payloads.
- [ ] Draft PR #3 updated accurately.
- [ ] Owner explicitly approved any merge to `main`.
