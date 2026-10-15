# Fawri multi-agent execution plan

## 1. Coordination snapshot

- Repository: `nora953/fawri-production-source`
- Source of truth: GitHub only.
- Coordination base commit: `b08c854f177953d3690c5dffde905fdb0c93eb09`
- Existing integration branch: `hardening/postgresql-foundation`
- Existing draft integration PR: `#3`
- Do not modify `main`.
- Do not use Replit Agent.
- Do not connect to or mutate production data.
- One assistant per branch. An assistant must never push to another assistant's branch.

This commit is a safe coordination point: the existing changes are committed and there is no intentionally open database transaction or partially written repository file that requires the previous assistant process to remain alive.

## 2. Branches

1. `parallel/db-migration-cutover`
2. `parallel/auth-session-hardening`
3. `parallel/orders-settings-finalization`
4. `parallel/catalog-inventory`
5. `parallel/knowledge-ai`
6. `parallel/channels-messaging`
7. `parallel/quality-observability`
8. `parallel/integration-coordinator`

All branches were created from the same base commit shown above.

## 3. Mandatory rules for every assistant

1. At the start, fetch the assigned branch and record its remote HEAD. Confirm that its ancestry starts at the coordination base commit.
2. Work only on the assigned branch and only within the assigned path allowlist.
3. Before every push, fetch the assigned branch again. If its remote HEAD changed unexpectedly, stop and report `STOP: Remote HEAD changed`; do not force-push and do not overwrite another assistant's work.
4. Never edit a shared integration file listed in section 4. When a shared-file change is required, write the exact requested change in the lane handoff file instead.
5. Do not rebase onto a moving branch while implementation is in progress. The integration coordinator will integrate completed branches in a controlled order.
6. Do not weaken a server-side security check, schema constraint, test assertion, migration guard, tenant boundary, idempotency rule, or fail-closed behavior merely to make a test pass.
7. Do not introduce LocalStorage or SessionStorage as an operational source of truth. Browser storage is allowed only for UI preferences such as language, theme, layout, or dismissed hints.
8. Do not print secrets, password hashes, access tokens, webhook payloads, customer messages, or payment evidence in reports, tests, CI artifacts, or logs.
9. Do not claim completion without evidence. Record every executed command/check and its result in the lane handoff file. If CI did not run, state that clearly.
10. Add focused tests for every security boundary, tenant boundary, version conflict, idempotency behavior, failure mode, and cleanup path changed by the lane.
11. Do not merge into `main` or mark work production-ready. Open a draft PR into `hardening/postgresql-foundation`, or leave the branch ready for the integration coordinator.
12. Each lane must create or update exactly one handoff document at:
    `docs/coordination/handoffs/<lane-name>.md`

The handoff must include:

- starting SHA and final SHA;
- files changed;
- behavior added or removed;
- tests/checks executed and exact outcomes;
- shared-file integration requests;
- schema requests;
- known risks and intentionally deferred work;
- rollback notes;
- whether any real external service or real data was contacted (normally `no`).

## 4. Shared files reserved for the integration coordinator

No execution lane may edit these files unless its prompt explicitly grants ownership of one of them:

- `artifacts/api-server/src/app.ts`
- `artifacts/api-server/src/index.ts`
- `artifacts/api-server/src/routes/index.ts`
- `artifacts/api-server/package.json`
- `artifacts/fawri/src/App.tsx`
- frontend router/entry files
- `artifacts/fawri/src/lib/store.ts`
- `artifacts/fawri/src/lib/types.ts`
- `artifacts/fawri/src/lib/i18n.tsx`
- `artifacts/fawri/src/lib/translations/**`
- `artifacts/fawri/src/lib/admin-translations.ts`
- `lib/db/src/schema/index.ts`
- `lib/db/src/schema/enums.ts`
- root `package.json`
- lockfiles and workspace files
- PR metadata and final integration documentation

Workflow ownership is exclusive to the quality lane until it is handed off:

- `.github/workflows/**`

Database schema ownership is exclusive to the database lane:

- `lib/db/**`

If another lane needs a shared type, enum, router mount, package script, workflow path, or database column/table, it must describe the exact request in its handoff rather than editing the shared file.

## 5. Integration contract between lanes

Domain lanes should prefer new isolated files with domain-specific names. For example:

- service: `services/catalogRuntime.ts`
- router: `routes/catalog-operations.ts`
- frontend implementation: `ServerProductsPage.tsx`
- frontend activation request: documented re-export or route change
- tests: domain-specific test names
- audit: domain-specific read-only script

A domain lane may not register its router in `app.ts`, add exports to `schema/index.ts`, add an enum to `enums.ts`, add package scripts, or modify workflows. It must provide the exact integration request in the handoff. The integration coordinator performs those small shared changes after reviewing the domain branch.

## 6. Lane 1 — PostgreSQL migration and cutover safety

### Branch

`parallel/db-migration-cutover`

### Exclusive ownership

- `lib/db/**`
- `scripts/plan-postgresql-*`
- `scripts/run-postgresql-*`
- `scripts/lib/postgresql-*`
- `scripts/lib/*migration*`
- `scripts/tests/*migration*`
- `scripts/tests/*postgresql*`
- `docs/postgresql-*`
- `docs/migration-*`
- `docs/coordination/handoffs/db-migration-cutover.md`

### Forbidden

All application routes, frontend files, auth files, Meta files, root package files, and workflows.

### Objectives

1. Reconcile the current Drizzle schema with the latest committed domain contracts.
2. Generate and review a reproducible migration candidate without granting repository write permission to CI.
3. Finish migration metadata and source-record lineage.
4. Extend the migration writer to safely support operational overlays only after their target rows and ordering are implemented.
5. Keep `dry-run` as the default and require explicit guarded write mode.
6. Hold operational locks, rebuild the validated plan after locks are acquired, verify source hashes immediately before commit, and roll back on any mismatch.
7. Add disposable PostgreSQL tests for schema application, idempotency, rollback, commit/reconciliation, and zero residue after cleanup.
8. Add tenant-safe composite foreign keys and check constraints where the current schema can admit cross-merchant or impossible data.
9. Produce backup/restore and rollback prerequisites for a future real cutover, but do not run a real cutover.

### Acceptance criteria

- No production or Replit database is contacted.
- The committed migration is reproducible from the committed schema.
- A disposable PostgreSQL database accepts the full migration.
- Unsupported operational data causes a fail-closed write refusal with a precise code.
- Every source file is included in a deterministic manifest.
- Source mutation between validation and commit is detected.
- Tests prove rollback and commit behavior on disposable PostgreSQL.
- Handoff lists all schema requests that remain blocked on other lanes.

### Copyable prompt

```text
You are the PostgreSQL migration and cutover-safety assistant for Fawri.

Repository: nora953/fawri-production-source
Assigned branch: parallel/db-migration-cutover
Coordination base: b08c854f177953d3690c5dffde905fdb0c93eb09

Work only on the assigned branch. Never modify main, hardening/postgresql-foundation, or another parallel branch. Before editing, fetch the assigned branch, record REMOTE_HEAD, and verify the branch descends from the coordination base. Before every push, fetch again and stop with `STOP: Remote HEAD changed` if another process changed the branch.

Read docs/coordination/multi-agent-work-plan.md from branch parallel/integration-coordinator and obey its global rules.

You exclusively own lib/db/** and PostgreSQL/migration scripts, tests, and docs. Do not edit application routes, frontend files, auth code, Meta code, root package.json, lockfiles, or .github/workflows/**. When another file must change, describe the exact change in docs/coordination/handoffs/db-migration-cutover.md; do not edit it.

Complete the migration foundation professionally: reproducible Drizzle migration, deterministic manifests, migration run/source/record/reconciliation metadata, guarded dry-run and write modes, operational locks, source-hash revalidation, FK-safe ordering, rollback on mismatch, disposable PostgreSQL commit/rollback tests, tenant-safe constraints, and backup/restore prerequisites. Do not contact or mutate any real database or Replit data.

Do not weaken guards to make tests pass. Add focused failure tests. Record exact commands and outcomes in the handoff. Finish with the branch pushed and a concise handoff containing starting SHA, final SHA, files, tests, integration requests, risks, and rollback notes.
```

## 7. Lane 2 — Authentication, sessions, and administrative security

### Branch

`parallel/auth-session-hardening`

### Exclusive ownership

- `artifacts/api-server/src/routes/auth.ts`
- new files matching `artifacts/api-server/src/routes/auth-*.ts`
- new files under `artifacts/api-server/src/routes/auth/**`
- `artifacts/api-server/src/services/auth*`
- `artifacts/api-server/src/services/session*`
- `artifacts/api-server/src/services/admin*`
- `artifacts/api-server/src/middleware/auth*`
- `artifacts/api-server/src/middleware/session*`
- `artifacts/api-server/tests/*auth*`
- `artifacts/api-server/tests/*session*`
- `artifacts/api-server/tests/*admin*`
- `docs/auth-*`
- `docs/security-auth-*`
- `docs/coordination/handoffs/auth-session-hardening.md`

### Read-only dependencies

Merchant operational-access services and Meta middleware may be imported but not edited by this lane.

### Forbidden

`app.ts`, `index.ts`, package files, workflows, database schema files, frontend files, Meta queue/worker files, orders/settings files.

### Objectives

1. Remove or encapsulate remaining in-memory authentication/session state.
2. Make account identity generic and keep merchant/admin profiles separate in runtime contracts.
3. Harden cookie/session creation, rotation, revocation, logout-all, expiry, and device trust.
4. Enforce role and tenant isolation server-side on every protected path.
5. Rate-limit and audit login, OTP, password reset, and recovery flows without leaking account existence.
6. Remove plaintext password handling outside the minimum legacy boundary and document the migration path to password hashes.
7. Protect admin permissions and owner-only actions from assistant-admin escalation.
8. Add tests for stolen/expired/revoked sessions, role confusion, merchant/admin cross-login, password reset abuse, OTP replay, and suspended/rejected accounts.

### Acceptance criteria

- No route relies only on frontend checks.
- Session IDs rotate after authentication-sensitive events.
- Revocation is effective on the next request.
- Admin and merchant sessions cannot be exchanged.
- Error responses do not disclose password hashes, OTP secrets, or unnecessary account existence.
- Existing onboarding/support access needed by pending merchants remains available while operational APIs stay blocked.

### Copyable prompt

```text
You are the authentication, session, and administrative-security assistant for Fawri.

Repository: nora953/fawri-production-source
Assigned branch: parallel/auth-session-hardening
Coordination base: b08c854f177953d3690c5dffde905fdb0c93eb09

Use only the assigned branch. Fetch and record REMOTE_HEAD before work and before every push. Stop instead of overwriting if the remote HEAD changed. Never modify main or another assistant's branch.

Read docs/coordination/multi-agent-work-plan.md from parallel/integration-coordinator. Your ownership is limited to auth.ts, auth/session/admin-specific new routes, services, middleware, tests, and auth/security docs. Do not edit app.ts, index.ts, package files, workflows, database schema, frontend files, Meta pipeline files, or orders/settings files. Put every required shared-file change in docs/coordination/handoffs/auth-session-hardening.md.

Audit the real authentication code before changing it. Harden account separation, session issuance/rotation/revocation, cookie security, device trust, OTP and password-reset abuse controls, role/tenant isolation, permission escalation prevention, and sensitive logging. Preserve legitimate pending-merchant onboarding/support access while keeping operational APIs approved-only.

Use fail-closed server checks and focused tests for replay, expiry, revocation, role confusion, cross-tenant access, OTP reuse, and recovery enumeration. Do not weaken an assertion to obtain green tests. Record exact test evidence, remaining legacy risks, shared integration requests, and rollback notes in the handoff, then push only to the assigned branch.
```

## 8. Lane 3 — Orders and merchant settings finalization

### Branch

`parallel/orders-settings-finalization`

### Exclusive ownership

- `artifacts/api-server/src/routes/order-operations.ts`
- `artifacts/api-server/src/routes/merchant-settings.ts`
- `artifacts/api-server/src/services/orderOperationsRuntime.ts`
- `artifacts/api-server/src/services/merchantSettingsRuntime.ts`
- `artifacts/api-server/tests/*order-operations*`
- `artifacts/api-server/tests/*merchant-settings*`
- `artifacts/fawri/src/pages/dashboard/ServerOrdersPage.tsx`
- `artifacts/fawri/src/pages/dashboard/ServerSettingsPage.tsx`
- `artifacts/fawri/src/pages/dashboard/OrdersPage.ts`
- `artifacts/fawri/src/pages/dashboard/SettingsPage.ts`
- `scripts/audit-order-operations.mjs`
- `scripts/audit-merchant-settings.mjs`
- matching tests
- `docs/order-*`
- `docs/merchant-settings-*`
- `docs/coordination/handoffs/orders-settings-finalization.md`

### Forbidden

Legacy page `.tsx` files, shared store/types/translations, app/index/package/workflow files, DB schema, Meta pipeline, auth files.

### Objectives

1. Finish server-authoritative orders and merchant settings without LocalStorage fallback.
2. Close any API path that can bypass atomic payment confirmation/rejection.
3. Enforce valid order-state and payment-state transitions on the server.
4. Keep optimistic concurrency with `expected_version` and return the current record on conflict.
5. Ensure payment verification/rejection metadata is consistent and auditable.
6. Ensure merchant settings affect queued replies and business behavior consistently.
7. Add deletion cleanup, read-only audits, migration-readiness reporting, and tenant-isolation tests.
8. Produce exact database schema requests for the DB lane; do not modify DB schema directly.

### Acceptance criteria

- No active orders/settings page imports `getOrders`, `saveOrders`, `getSettings`, `saveSettings`, LocalStorage, or SessionStorage.
- API requests cannot update another merchant's data.
- Stale device updates receive conflict responses instead of overwriting.
- Electronic payment reaches `paid` or `failed` only through dedicated reviewed operations.
- Merchant auto-reply disablement suppresses queued replies before external delivery and does not consume new credit.
- Handoff includes schema and central wiring requests.

### Copyable prompt

```text
You are the orders and merchant-settings finalization assistant for Fawri.

Repository: nora953/fawri-production-source
Assigned branch: parallel/orders-settings-finalization
Coordination base: b08c854f177953d3690c5dffde905fdb0c93eb09

Work only on this branch and only within the lane allowlist in docs/coordination/multi-agent-work-plan.md. Fetch and record the remote HEAD before editing and before pushing. Stop if it changed unexpectedly. Never modify main, another lane, shared store/types/translations, app.ts, package files, workflows, or lib/db/**.

Review the current server-authoritative order and merchant-settings implementation. Finish it professionally: remove every active browser-storage authority/fallback, close generic payment-status bypasses, enforce state machines and tenant isolation server-side, keep expected_version conflicts, make audit metadata consistent, make settings behavior affect queued replies safely, and add deletion/audit/migration-readiness coverage.

Do not edit DB schema. Write exact requested tables/columns/enums/constraints and central router/package/workflow changes in docs/coordination/handoffs/orders-settings-finalization.md. Add focused unit, integration, and static contract tests. Never report success without exact evidence. Push only to the assigned branch.
```

## 9. Lane 4 — Catalog, products, variants, and inventory

### Branch

`parallel/catalog-inventory`

### Exclusive ownership

- new files matching `artifacts/api-server/src/routes/catalog*`
- new files matching `artifacts/api-server/src/routes/inventory*`
- new files matching `artifacts/api-server/src/services/catalog*`
- new files matching `artifacts/api-server/src/services/inventory*`
- `artifacts/api-server/tests/*catalog*`
- `artifacts/api-server/tests/*inventory*`
- `artifacts/fawri/src/pages/dashboard/ServerProductsPage.tsx`
- `artifacts/fawri/src/pages/dashboard/ProductsPage.ts`
- new frontend catalog components under `artifacts/fawri/src/components/catalog/**`
- `scripts/audit-catalog-operations.mjs`
- matching tests
- `docs/catalog-*`
- `docs/inventory-*`
- `docs/coordination/handoffs/catalog-inventory.md`

### Forbidden

Existing legacy `ProductsPage.tsx`, shared store/types/translations, app/index/package/workflow files, DB schema, orders, settings, auth, Meta pipeline.

### Objectives

1. Create a server-authoritative catalog and inventory API with tenant isolation.
2. Support products, images references, variants, SKU/barcode uniqueness per merchant, stock quantity, visibility, and `allow_fawri_reply`.
3. Use optimistic concurrency or an equivalent server-side conflict guard.
4. Prevent negative stock, invalid prices, duplicate variants, and cross-merchant references.
5. Define idempotent create/import operations.
6. Build a server-only active products page with no LocalStorage fallback.
7. Add a read-only audit and migration-readiness report.
8. Provide precise schema and object-storage integration requests in the handoff.

### Acceptance criteria

- Merchant A cannot read or modify Merchant B's products.
- Inventory cannot become negative through concurrent updates.
- Duplicate idempotency keys do not create duplicate products/imports.
- Active frontend path contains no operational browser-storage use.
- Product image data is referenced, not stored as unbounded base64 in operational JSON.
- Tests cover conflicts, invalid variants, deletion constraints, and cleanup.

### Copyable prompt

```text
You are the catalog and inventory assistant for Fawri.

Repository: nora953/fawri-production-source
Assigned branch: parallel/catalog-inventory
Coordination base: b08c854f177953d3690c5dffde905fdb0c93eb09

Read the coordination plan from parallel/integration-coordinator. Work only on the assigned branch and the catalog/inventory allowlist. Record and re-check REMOTE_HEAD; stop rather than overwrite unexpected remote changes. Do not edit main, app.ts, index.ts, package files, workflows, lib/db/**, shared store/types/translations, or existing legacy ProductsPage.tsx.

Build a production-quality server-authoritative catalog vertical slice: tenant-safe product/variant/inventory services and routes, optimistic concurrency, non-negative stock, price and variant validation, per-merchant SKU/barcode rules, idempotent create/import behavior, image-reference safety, server-only frontend page, audits, migration-readiness checks, and focused tests.

Use new isolated files. Do not wire shared routers or schema exports yourself. Put exact router, shared-type, translation, package, workflow, schema, and object-storage requests in docs/coordination/handoffs/catalog-inventory.md. Include exact test evidence and rollback notes. Push only to the assigned branch.
```

## 10. Lane 5 — Knowledge base, training, saved answers, and AI runtime

### Branch

`parallel/knowledge-ai`

### Exclusive ownership

- new files matching `artifacts/api-server/src/routes/knowledge*`
- new files matching `artifacts/api-server/src/routes/training*`
- new files matching `artifacts/api-server/src/routes/saved-answer*`
- new files under `artifacts/api-server/src/services/knowledge/**`
- new files under `artifacts/api-server/src/services/ai/**`
- new files matching `artifacts/api-server/src/services/training*`
- new files matching `artifacts/api-server/src/services/savedAnswer*`
- related API tests
- `artifacts/fawri/src/pages/dashboard/ServerSavedAnswersPage.tsx`
- `artifacts/fawri/src/pages/dashboard/SavedAnswersPage.ts`
- `artifacts/fawri/src/pages/dashboard/ServerTrainingPage.tsx`
- `artifacts/fawri/src/pages/dashboard/TrainingPage.ts`
- new components under `artifacts/fawri/src/components/knowledge/**`
- `scripts/audit-knowledge-operations.mjs`
- matching tests
- `docs/knowledge-*`
- `docs/ai-runtime-*`
- `docs/coordination/handoffs/knowledge-ai.md`

### Forbidden

Shared store/types/translations, app/index/package/workflow files, DB schema, Meta queue/worker, auth, orders/settings, catalog.

### Objectives

1. Establish one explicit AI decision engine contract for the active runtime.
2. Make saved answers, training requests, learned answers, and merchant approval server-authoritative.
3. Define deterministic precedence: direct database facts, approved saved answers, semantic retrieval, constrained AI fallback, and handoff.
4. Prevent unapproved/generated knowledge from silently becoming trusted merchant knowledge.
5. Keep language handling explicit for Arabic, Kurdish, and English.
6. Add prompt-injection defenses and strict separation between system rules, merchant data, and customer text.
7. Add redaction and safe observability without logging full customer content by default.
8. Build server-only saved-answer/training pages with version conflicts and no LocalStorage fallback.
9. Provide exact DB/vector/search integration requests in the handoff.

### Acceptance criteria

- There is one documented active AI engine interface.
- Merchant-approved and generated content are distinguishable.
- Cross-merchant retrieval is impossible in tests.
- Approval/rejection transitions are server-enforced and audited.
- Customer text cannot override system/merchant policy in tested injection cases.
- Active pages do not use operational browser storage.

### Copyable prompt

```text
You are the knowledge-base, training, saved-answer, and AI-runtime assistant for Fawri.

Repository: nora953/fawri-production-source
Assigned branch: parallel/knowledge-ai
Coordination base: b08c854f177953d3690c5dffde905fdb0c93eb09

Work only within the knowledge/AI allowlist in the coordination plan. Fetch and record the assigned branch remote HEAD before work and before every push. Stop if it changed. Never edit main, another lane, app/index/package/workflow files, lib/db/**, shared store/types/translations, Meta queue/worker, auth, orders/settings, or catalog files.

Inspect the current saved-answer, training, learned-answer, and AI code before designing changes. Implement one explicit server-side AI decision contract and server-authoritative knowledge workflows. Enforce merchant isolation, approval state machines, source provenance, language handling, prompt-injection defenses, safe redaction, and deterministic answer precedence. Build isolated server-only frontend pages and focused tests, including cross-tenant retrieval and malicious prompt cases.

Do not wire central files or modify DB schema. Put exact router, schema, shared-type, translation, package, workflow, vector/search, and integration requests in docs/coordination/handoffs/knowledge-ai.md. Record exact test evidence, risks, and rollback notes. Push only to the assigned branch.
```

## 11. Lane 6 — Channels, Meta messaging, queue, credentials, and DLQ operations

### Branch

`parallel/channels-messaging`

### Exclusive ownership

- `artifacts/api-server/src/middleware/metaWebhook*`
- `artifacts/api-server/src/middleware/merchantWebhook*`
- `artifacts/api-server/src/middleware/manualConversationWebhookAccess.ts`
- `artifacts/api-server/src/services/meta*`
- `artifacts/api-server/src/services/durableJobQueue.ts`
- `artifacts/api-server/src/services/merchantReplyEntitlement.ts`
- `artifacts/api-server/src/services/merchantReplyRefund.ts`
- new channel-specific services/routes under names `channel*` or `meta*`
- `artifacts/api-server/scripts/manage-durable-jobs.ts`
- related messaging/channel/queue tests
- new channel frontend files under `artifacts/fawri/src/pages/dashboard/ServerChannelsPage.tsx` and `artifacts/fawri/src/components/channels/**`
- `scripts/audit-fawri-background-jobs.mjs`
- channel/message-specific audit scripts and tests
- `docs/meta-*`
- `docs/channel-*`
- `docs/coordination/handoffs/channels-messaging.md`

### Read-only dependencies

Auth/session and merchant operational-access services may be imported but not edited.

### Forbidden

Auth files, merchant operational-access files, app/index/package/workflow files, DB schema, shared frontend store/types/translations, orders/settings, catalog, knowledge.

### Objectives

1. Finish the durable webhook pipeline and prove ingress-to-worker-to-outcome behavior.
2. Preserve raw-body signature verification, event idempotency, enqueue-before-ack guarantees, retry classification, visibility timeouts, DLQ, and one-time refunds.
3. Add safe admin DLQ inspection/requeue contracts without exposing payloads by default.
4. Encrypt channel access tokens at rest through an injectable key-management interface; never log them.
5. Add channel connection lifecycle, revocation, page ownership, and suspended-merchant behavior.
6. Ensure unknown/transient page-directory failures return retryable responses instead of dropping messages.
7. Add crash-recovery and partial-write tests.
8. Provide exact DB schema, central router, and secrets-management requests in the handoff.

### Acceptance criteria

- Invalid/missing signatures are rejected.
- A valid duplicated event creates no duplicate job, reply, or charge.
- Ack occurs only after durable enqueue.
- Confirmed send failure retries and eventually reaches DLQ; uncertain delivery does not auto-resend.
- Refund happens at most once and only in the documented failure state.
- Suspended/rejected merchants cannot send automated or manual replies.
- Tokens and payloads are absent from default logs and reports.

### Copyable prompt

```text
You are the channels and durable-messaging assistant for Fawri.

Repository: nora953/fawri-production-source
Assigned branch: parallel/channels-messaging
Coordination base: b08c854f177953d3690c5dffde905fdb0c93eb09

Read the multi-agent coordination plan. Work only on the channels/messaging allowlist. Fetch and record REMOTE_HEAD before implementation and before every push; stop if it changed unexpectedly. Never edit main, auth/session files, merchant operational-access files, app/index/package/workflow files, lib/db/**, shared frontend store/types/translations, or another domain lane.

Finish the existing Meta/channel pipeline without redesigning proven behavior: raw-body HMAC validation, event idempotency, enqueue-before-ack, durable queue locks, visibility timeout, retry/backoff, non-retryable uncertain delivery, DLQ, crash reconciliation, and one-time refund. Add safe DLQ operational contracts, channel lifecycle and revocation, token-at-rest encryption interfaces, payload redaction, and comprehensive failure tests. Do not contact real Meta or real merchant data; use loopback/fake services.

Do not modify shared registration or schema files. Document exact router, schema, secrets/key-management, package, workflow, frontend activation, and shared-type requests in docs/coordination/handoffs/channels-messaging.md. Include exact tests, risks, and rollback notes. Push only to the assigned branch.
```

## 12. Lane 7 — Quality gates, observability, backups, security scanning, and release readiness

### Branch

`parallel/quality-observability`

### Exclusive ownership

- `.github/workflows/**`
- new scripts matching `scripts/quality-*`
- new scripts matching `scripts/ci-*`
- new scripts matching `scripts/backup-*`
- new scripts matching `scripts/restore-*`
- new scripts matching `scripts/security-*`
- new observability middleware/services under `artifacts/api-server/src/observability/**`
- new observability tests
- `docs/operations-*`
- `docs/observability-*`
- `docs/backup-*`
- `docs/release-*`
- `docs/security-review-*`
- `docs/legal-readiness-*`
- `docs/coordination/handoffs/quality-observability.md`

### Forbidden

Application domain logic, app.ts/index.ts, auth, Meta, orders/settings, catalog, knowledge, DB schema, root package/lockfiles, shared frontend files.

### Objectives

1. Consolidate CI into dependable read-only workflows with path filters and concurrency cancellation that does not starve the latest run.
2. Add typecheck/build/test matrices for server, frontend, database, migration safety, browser-storage authority, and domain contracts.
3. Add secret scanning, dependency review, lockfile integrity, and artifact redaction checks.
4. Add health/readiness/structured metrics components as isolated files; leave mounting to the integrator.
5. Define error-rate, queue-depth, DLQ, webhook-signature, login-abuse, and migration alerts.
6. Define backup, restore, retention, and restore-drill procedures for PostgreSQL and object storage.
7. Produce a release checklist covering security, data migration, rollback, monitoring, legal consent, privacy, and support readiness.
8. Do not claim that CI is green if GitHub runners did not execute; distinguish syntax review from executed validation.

### Acceptance criteria

- Workflows use least privilege and no persistent `contents: write` unless a narrowly reviewed release action absolutely requires it.
- Concurrent runs cancel obsolete runs but allow the newest commit to start.
- CI artifacts exclude secrets and customer payloads.
- Restore procedures include verification, not only backup creation.
- Release checklist has explicit go/no-go gates.
- Every domain handoff can request workflow registration without editing workflows itself.

### Copyable prompt

```text
You are the quality, observability, backup, security-scanning, and release-readiness assistant for Fawri.

Repository: nora953/fawri-production-source
Assigned branch: parallel/quality-observability
Coordination base: b08c854f177953d3690c5dffde905fdb0c93eb09

Work only on the assigned branch and the quality/observability allowlist. Fetch and record REMOTE_HEAD before work and before every push. Stop if the branch changed unexpectedly. Never modify main, application domain logic, app.ts/index.ts, root package or lockfiles, DB schema, shared frontend files, or another lane's code.

You exclusively own .github/workflows/** for this parallel cycle. Review all existing workflows and fix queue starvation, excessive duplicate runs, permissions, concurrency, path filters, redaction, and reproducibility. Add isolated observability components, alert definitions, secret/dependency scanning, backup/restore drill documentation, and a strict release go/no-go checklist. Do not mount middleware in app.ts; request the exact integration in the handoff.

Do not claim executed success when runners did not run. Record exact workflow/run evidence or clearly state the limitation. Incorporate workflow requests recorded by completed domain handoffs without modifying their domain files. Finish docs/coordination/handoffs/quality-observability.md with starting/final SHAs, workflows changed, checks, remaining risks, and rollback notes. Push only to the assigned branch.
```

## 13. Lane 8 — Integration coordinator

### Branch

`parallel/integration-coordinator`

### Exclusive ownership

- shared files listed in section 4
- `docs/coordination/**`
- final conflict resolution and wiring
- final PR descriptions and integration reports

The coordinator may edit a domain file only to resolve a merge conflict or a small integration mismatch. It must not silently redesign a completed domain lane.

### Objectives

1. Keep `hardening/postgresql-foundation` frozen while execution lanes work.
2. Review each handoff and branch diff against its allowlist.
3. Reject or return branches that touched forbidden files, weakened guards, lack tests, or expose secrets.
4. Integrate branches one at a time into the coordinator branch.
5. Perform shared router mounts, package scripts, shared types, translations, schema exports/enums, workflow path updates, and frontend route activation.
6. Resolve cross-lane contracts explicitly and document every deviation from a handoff request.
7. Generate the final migration only after all schema requests are integrated.
8. Run the full validation matrix and inspect logs.
9. Remove obsolete legacy LocalStorage authority and dead routes only after their server replacements pass.
10. Update draft PR #3 or create a clean integration PR into `hardening/postgresql-foundation`; never merge to `main` without owner approval.

### Recommended integration order

1. `parallel/auth-session-hardening`
2. `parallel/channels-messaging`
3. `parallel/orders-settings-finalization`
4. `parallel/catalog-inventory`
5. `parallel/knowledge-ai`
6. `parallel/db-migration-cutover` after consuming all schema requests
7. `parallel/quality-observability` after consuming all workflow requests
8. final shared wiring, full audit, full tests, migration generation, and documentation

Auth is integrated before domains because every domain depends on session/tenant contracts. Database and quality lanes integrate late because they consume schema/workflow requests from all domains.

### Copyable prompt

```text
You are the integration coordinator for the Fawri multi-agent hardening cycle.

Repository: nora953/fawri-production-source
Assigned branch: parallel/integration-coordinator
Coordination base: b08c854f177953d3690c5dffde905fdb0c93eb09
Target integration branch after validation: hardening/postgresql-foundation

Read and enforce docs/coordination/multi-agent-work-plan.md. Do not implement domain features while domain assistants are working. Keep hardening/postgresql-foundation and main untouched until controlled integration. Review each branch against its allowlist and handoff. Reject forbidden-file edits, missing tests, weakened security, secret exposure, unsupported claims, or hidden LocalStorage authority.

Integrate one lane at a time in the documented order. You exclusively own shared wiring: app/index/router registration, package scripts, shared types and translations, frontend route activation, schema index/enums, final workflow coordination, conflict resolution, and final documentation. Preserve domain behavior unless a conflict requires an explicit documented change.

After domain integration, hand all schema requests to the DB lane or implement only reviewed shared schema wiring, then generate the final reproducible migration. Hand all test/workflow requests to the quality lane. Run the full validation matrix, inspect logs, run browser-storage and data audits, verify tenant/security/idempotency constraints, and prepare rollback notes. Never contact real production data, never use Replit Agent, and never merge to main without explicit owner approval.

Maintain docs/coordination/integration-status.md with every integrated branch SHA, conflicts, decisions, tests, failures, and unresolved blockers. Stop and ask the owner only for a real product decision, missing credential/access, or a conflict that cannot be resolved from code and approved project rules.
```

## 14. Stop and escalation conditions

An execution assistant must stop and report rather than guess when:

- the assigned branch remote HEAD changed unexpectedly;
- a required change falls outside its allowlist;
- a product/business rule is ambiguous and materially affects customer behavior, billing, privacy, or legal consent;
- access to a required external system is unavailable;
- real production data or credentials would be required;
- authoritative sources disagree and the conflict cannot be resolved from current owner rules;
- a test exposes a cross-tenant or data-loss condition whose fix requires redesign across multiple lanes;
- GitHub Actions is delayed abnormally and manual owner intervention is required for billing, permissions, approval, or runner access.

Routine implementation choices, test fixes, refactors inside the allowlist, and documented fail-closed decisions do not require owner approval.

## 15. Definition of completion for the parallel cycle

The cycle is not complete merely because all branches exist or individual tests pass. Completion requires:

- every lane handoff is present;
- no branch modified files outside its ownership without explicit coordinator resolution;
- all shared integration requests are addressed;
- all active operational browser-storage authorities are removed or explicitly documented as not yet migrated;
- server-side merchant status, subscription entitlement, tenant boundaries, idempotency, queue/DLQ, and auth/session controls pass;
- PostgreSQL migration is reproducible and tested on disposable PostgreSQL;
- backup/restore and rollback procedures are verified;
- full frontend/server/database builds and tests pass on the integrated commit;
- no secrets or customer payloads appear in logs/artifacts;
- draft PR #3 accurately reflects the integrated scope and remaining risks;
- no merge to `main` occurs without explicit owner approval.
