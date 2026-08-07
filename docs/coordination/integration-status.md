# Fawri parallel integration status

## Coordination snapshot

- Coordination base: `b08c854f177953d3690c5dffde905fdb0c93eb09`
- Integration branch: `parallel/integration-coordinator`
- Coordinator remote HEAD before this update: `3a6290030f92f52260e450955e821a3e046f66c3`
- Validated target after ordered integration: `hardening/postgresql-foundation`
- Direct modification of `main`: **not allowed**
- Replit Agent: **not allowed**
- Latest lane review/integration: `2026-08-07 06:33 +03:00`
- Current project release decision: **NO-GO**

## Ordered integration queue

1. `parallel/auth-session-hardening` — **reviewed and merged into coordinator**
2. `parallel/channels-messaging` — reviewed; next eligible lane
3. `parallel/orders-settings-finalization` — reviewed; queued after channels
4. `parallel/catalog-inventory` — reviewed; queued after orders/settings
5. `parallel/knowledge-ai` — reviewed; position reserved after catalog, but correction required before merge
6. `parallel/db-migration-cutover` — after all domain schema requests are reconciled
7. `parallel/quality-observability` — reviewed; integrate after domains and PostgreSQL
8. Final shared wiring, full validation, migration candidate, backup/restore, and release-candidate checks

No merge to `main` or `hardening/postgresql-foundation` is authorized or performed by this coordinator.

## Lane status

| Lane | Branch | Status | Reviewed SHA | Integrated SHA | Notes |
|---|---|---|---|---|---|
| Auth/session/admin security | `parallel/auth-session-hardening` | reviewed; first lane merged into coordinator; shared auth cutover implemented but validation still pending | `d4f4ce2e3bd3cb1e27deb28a30249ce87bb0d25b` | `dc57eb52a4cae97730248897ebd314317f252b75` | 24 allowlisted files; documented TypeScript PASS and 15/15 focused tests; no CI on lane SHA; cookie/session v2 cutover now coordinator-owned; not release-green until integrated build/HTTP/PostgreSQL proof |
| Channels/messaging | `parallel/channels-messaging` | reviewed; next in ordered integration | `22857159593aebeea0a12e6782581da6358080b3` | — | Allowlist compliant; 13 documented tests passed; activation blocked pending shared plaintext-token migration, key management, PostgreSQL, CI, and fake transport |
| Orders/settings finalization | `parallel/orders-settings-finalization` | reviewed; queued after channels | `bde53f403f63d680fd96c1d8b8a5e264010d9b41` | — | Allowlist compliant; 5 runtime + 4 static-contract + 1 audit tests passed; shared queue/race/type/router integration mandatory |
| Catalog/inventory | `parallel/catalog-inventory` | reviewed; queued after orders/settings | `ce363f7105f33e942c6c47ef8907dfb9b59658f6` | — | Allowlist compliant; 16 documented tests passed; full workspace validation pending |
| Knowledge/AI | `parallel/knowledge-ai` | reviewed; held at integration position 5 pending lane correction | `a09f1a3b1b72d9dd7834db8ae6a4c0e971e38744` | — | 32 allowlisted files; documented 13 runtime + 5 audit/static tests and targeted TypeScript passes; no CI; parseable-but-structurally-invalid runtime must fail closed before merge; DB/vector/fact/policy/Meta integration remains activation-blocked |
| PostgreSQL migration/cutover | `parallel/db-migration-cutover` | waiting; schema requests/blockers assigned | — | — | Must reconcile auth + channels + orders/settings + catalog + knowledge requests and quality-discovered schema failures |
| Quality/observability | `parallel/quality-observability` | reviewed; accepted as final queued lane | `b473fb8397814aa7bd91e0e323dc6003f6ba96f6` | — | PR #4 open/draft/unmerged; quality/security red runs are real blockers; restore drill green |

## Auth/session review and first integration

### Lane review

- Submitted and rechecked final remote head: `d4f4ce2e3bd3cb1e27deb28a30249ce87bb0d25b`.
- Branch ancestry: 2 commits ahead of coordination base, zero behind, coordination base as merge base.
- Base-to-final diff: 24 paths, all inside the auth/session/admin-security allowlist.
- `artifacts/api-server/src/services/passwordService.ts` is absent from the final diff and matches the coordination-base blob; the new scrypt implementation is isolated in lane-owned `authPasswordService.ts`.
- No `app.ts`, `routes/index.ts`, frontend, package/lockfile, workflow, database, Meta, orders/settings, catalog, target branch, or `main` file was modified by the execution lane.
- Handoff reviewed: `docs/coordination/handoffs/auth-session-hardening.md`.
- Documented lane evidence:
  - `npx tsc -p tsconfig.json`: PASS / exit 0 in the documented isolated environment;
  - focused auth suite: 15 passed / 0 failed / 0 skipped;
  - naming/import/allowlist checks: PASS;
  - GitHub Actions/combined statuses on final lane SHA: none; no CI-green claim.
- Static review confirmed separate merchant/admin accounts and cookies, opaque server sessions, expiry/rotation/revocation, account/session version checks, pending/suspended/rejected policy, cross-role/cross-tenant fail-closed behavior, owner-only assistant administration, trusted-device controls, OTP abuse controls, generic recovery, scrypt migration, and audit redaction.

### Ordered merge

- Internal integration PR: `#6`, head `parallel/auth-session-hardening`, base `parallel/integration-coordinator`.
- Exact reviewed head used: `d4f4ce2e3bd3cb1e27deb28a30249ce87bb0d25b`.
- Merge commit on coordinator: `dc57eb52a4cae97730248897ebd314317f252b75`.
- No merge to `main` or `hardening/postgresql-foundation` occurred.

## Auth shared cutover — implemented, validation pending

The coordinator performed the auth activation as a shared atomic cutover after merging the lane. Presence of the lane files alone was not treated as activation.

### Server authority

- `authSecurityRouter` is mounted centrally in `artifacts/api-server/src/app.ts` before directly-mounted operational/domain routers and before the legacy root router.
- Structural deviation from the handoff request is intentional: mounting only inside `routes/index.ts` would occur too late for routers already mounted directly in `app.ts`. The app-level mount preserves the required atomic ordering.
- `merchantOperationalAccess.ts` now imports merchant session authority from `middleware/authSession.ts`; operational merchant identity is derived from the validated server auth context.
- Production now requires an explicit `FAWRI_PASSWORD_SALT` of at least 32 characters for the new password service.

### Legacy authority shutdown / compatibility boundary

- Client-provided legacy merchant cookie `fawri_merchant_session` is discarded/cleared before legacy business handlers.
- Client-provided admin `Authorization: Bearer ...` is rejected for `/api/auth` traffic with `LEGACY_ADMIN_BEARER_DISABLED`.
- Duplicate legacy security/session/device endpoints are blocked from falling through to the old auth implementation.
- Remaining legacy business handlers in the large `routes/auth.ts` can execute only after a v2 session is validated; a short-lived server-generated compatibility credential is injected in-process and is never accepted from the client or returned to it.
- Merchant/admin v2 cookies present together fail with `ROLE_SESSION_CONFUSION`.
- Existing merchant/admin SSE compatibility paths are forced to reconnect periodically (default 30 seconds, bounded 5–60 seconds) so revocation is revalidated instead of allowing an indefinite legacy bearer/cookie stream.

### Frontend cutover

- Active login uses `/api/auth/login` for merchants and `/api/auth/admin/login` for administrators.
- Login no longer receives or stores `admin_token`.
- `authClientCutover.ts` removes the historical admin-token storage entry at startup, strips any historical Bearer header before same-origin API traffic leaves the browser, uses HttpOnly cookie credentials, and adds stable non-secret `X-Fawri-Device-Id` for auth/admin requests.
- `App.tsx` no longer uses token-based admin heartbeat; it revalidates `/api/auth/admin/me` with cookie + device ID.
- Leaving the admin area for login triggers secure `/api/auth/admin/logout`.
- Secure auth responses provide token-free compatibility profile shapes for existing UI consumers without exposing passwords or credentials.
- Forced administrator password change now uses `/api/auth/admin/change-password`; when `must_change_password=true`, the authenticated temporary-password session may replace the password without re-entering the temporary password, but the new password must differ. The change revokes every admin session, clears the cookie, and requires fresh login.

### Work Monitor/device/session cutover

- Existing Work Monitor UI paths are now served by secure v2 routes before the legacy router.
- Work Monitor reads `authSecurityStore` sessions/devices only; it does not consult the legacy session/device stores.
- Owner-only trust/revoke-device and revoke-session/revoke-all actions require the secure owner session and re-check the owner password for the legacy Work Monitor UI action flow.
- Device trust cap remains enforced; revoking device trust immediately revokes sessions tied to that device.
- Owner-authorized single target-session revocation was added to the secure session store for this flow.
- Work Monitor response does not expose session tokens or device hashes.

### Cutover tests added but not yet executed

- `artifacts/api-server/tests/auth-cutover-contract.test.mjs` now statically covers:
  - secure router ordering;
  - legacy cookie/Bearer rejection;
  - secure tenant context;
  - production password-pepper requirement;
  - cookie-only frontend transport and no active login token storage;
  - forced password revoke-all/reauthentication;
  - Work Monitor use of the v2 security store.
- These new coordinator-side cutover tests have not been executed by GitHub Actions because the quality workflow lane is not integrated yet. They must not be recorded as passing merely because the source exists.

## Auth PostgreSQL request ledger — forwarded to `parallel/db-migration-cutover`

Implement transactional PostgreSQL equivalents for the following before horizontal/production activation:

- `auth_accounts` with globally unique normalized phone, password hash/version/security version, enabled/OTP state, and timestamps;
- mutually exclusive merchant and administrator profile tables/relations so one account cannot own both profiles;
- `auth_sessions` with opaque token fingerprints, account kind, tenant/account version, role/permission snapshot where required, device binding, idle/absolute expiry, rotation replacement linkage, revocation reason/time, and indexes for active-session enforcement;
- `auth_trusted_devices` with unique account/device fingerprint, pending/trusted/revoked state, owner approval provenance, timestamps, and trusted-device cap enforcement;
- `auth_otp_challenges` with hashed target/code/IP, purpose, expiry, resend cooldown, attempts/max attempts, used/revoked state, single-use/supersession constraints;
- bounded `auth_login_attempts` for account-kind/target/IP abuse controls;
- sanitized `auth_audit_events` that cannot contain password, OTP, token, secret, hash, cookie, authorization, customer payload, or credential material.

Migration/cutover requirements:

- abort on duplicate phone or ambiguous merchant/admin role;
- never create both merchant and admin profile for one account;
- do not migrate weak legacy sessions; invalidate them at cutover;
- migrate only account/profile/password identity with deterministic provenance and source hashes;
- use transactions and row/advisory locking for session issue/rotation/revoke-all, password/security-version changes, OTP verification/reset, device trust/revoke, and permission/account-role changes;
- prove revoked session fails on the immediately following request and rotation cannot create two concurrently valid successors;
- add concurrency tests on disposable PostgreSQL.

## Knowledge/AI review — position 5, correction required before merge

### Branch, ancestry, and scope

- Reviewed and rechecked final remote head: `a09f1a3b1b72d9dd7834db8ae6a4c0e971e38744`.
- Implementation SHA: `f87607d5a25c49a9baf4df6e42a4baea487330b5`; final SHA adds the handoff only.
- Branch ancestry: 2 commits ahead of coordination base, zero behind, coordination base as merge base.
- Final diff contains exactly 32 added paths, all inside the Knowledge/AI allowlist.
- No shared `app.ts`, `index.ts`, package/lockfile, workflow, `lib/db/**`, shared store/types/translations, Meta queue/worker, auth, orders/settings, catalog, target branch, or `main` file was modified.
- Handoff reviewed: `docs/coordination/handoffs/knowledge-ai.md`.
- Independent GitHub check found no workflow runs and no combined commit statuses on the final SHA; no CI-green claim is recorded.

### Static behavior/security review

- The lane defines one explicit decision engine: `fawri_knowledge_decision_engine_v1`.
- Deterministic precedence is fact resolver, approved saved answer, tenant-filtered semantic retrieval, constrained AI fallback, then handoff/no-answer, with prompt-injection inspection before provider invocation.
- Saved answers are tenant-scoped and always `merchant_approved`; duplicate normalized answers conflict within merchant/language boundaries.
- Semantic retrieval filters `merchantId` before scoring and receives only active merchant-approved saved answers or approved/safe learned answers.
- OpenAI-generated candidates are recorded as `openai_generated`, `pending_review`, `safeToAutoReply=false`; they are not automatically added to approved semantic knowledge.
- Training approval is explicit, optimistic-versioned, and converts provenance to `merchant_approved`; approved requests are immutable in place.
- Browser routes derive merchant identity from the authenticated server session and ignore browser-supplied merchant policy; current public decision route hard-codes generated auto-reply off.
- Provider calls require explicit API key and model, use `store:false`, strict JSON-schema output, bounded timeout/output, separated system/trusted-merchant/untrusted-customer trust zones, and fail closed on request/provider failure.
- Decision audit stores customer digest/length and signal/decision metadata rather than full customer text; training stores a bounded redacted preview plus digest.
- Training UI clearly distinguishes generated/unapproved suggestions from merchant drafts and uses no operational LocalStorage/SessionStorage authority.
- Knowledge lifecycle deletion hooks remove merchant saved-answer and training/learned state from the isolated runtime.

### Lane correction required before merge

`KnowledgeStateStore.validateState()` currently treats parseable but structurally invalid JSON as an empty/partially filtered runtime instead of throwing. Invalid records can therefore be silently dropped from the in-memory view and then permanently omitted when a later mutation writes the state. The documented corruption test covers malformed JSON syntax only, not parseable-invalid schema/records.

Before this lane becomes merge-eligible, the Knowledge/AI lane must:

1. fail closed on structurally invalid runtime roots, required arrays, schema version, and malformed records instead of silently filtering/dropping them;
2. prove a mutation cannot overwrite a parseable-but-invalid runtime;
3. add focused tests for structurally invalid JSON and preservation of the original file on refusal;
4. keep ambiguous legacy training suggestion provenance untrusted during migration/import; do not label unknown generated/legacy text as merchant-approved authority.

This is a lane-owned correction, so the coordinator does not edit the frozen Knowledge/AI branch. A corrected final SHA must be reviewed before the ordered merge at position 5.

### Shared integration gates after lane correction and when position 5 is reached

- Mount `knowledgeOperationsRouter` only after auth v2 ordering; replace the lane's base-era `./auth.js` session helper imports with the integrated `authSession.ts` authority rather than reintroducing legacy auth.
- Activate `SavedAnswersPage.ts` and `TrainingPage.ts` in shared frontend routing and remove/deactivate legacy saved-answer/training authorities in the same cutover so two knowledge engines cannot remain active.
- Move page-local AR/KU/EN copy into shared translations while preserving the distinction between merchant-approved and generated/pending content.
- Inject one server-only `MerchantPolicyContext`; browser policy input remains ignored. Production launch keeps generated auto-reply disabled unless a later explicit product decision and tests approve otherwise.
- Inject one tenant-scoped `KnowledgeFactResolver` from authoritative catalog/inventory, merchant settings, and order facts/policy. AI must not invent price, stock, payment, delivery, warranty, or order state.
- Do not connect the Meta worker until PostgreSQL, vector retrieval, fact resolver, and policy resolver are integrated. Meta sends only `action === "reply"` under the final source policy, routes `handoff` to human handling, never treats `openai_generated` as merchant-approved knowledge, and does not log provider/customer bodies.
- Replace the deterministic local semantic fallback with the production pgvector/equivalent adapter before production activation.
- `knowledge-runtime.json` is transitional only and must not remain production authority.

### Documented verification evidence

- Knowledge/AI runtime tests: 13 passed / 0 failed.
- Audit/static contract tests: 5 passed / 0 failed.
- TypeScript services/routes: PASS.
- TypeScript frontend pages: PASS.
- No GitHub Actions workflow run or combined status exists on `a09f1a3b1b72d9dd7834db8ae6a4c0e971e38744`.
- No live OpenAI request, real database, real Meta service, Replit Agent, customer data, or production credential was used according to the handoff.

### Review decision

- Final SHA is recorded and the lane retains ordered integration position 5 after catalog/inventory.
- **Not merged now** because channels, orders/settings, and catalog precede it.
- **Not merge-eligible yet** because the structurally-invalid-runtime fail-closed correction above is required on the lane.
- Current project release decision remains **NO-GO**.

## Other reviewed lane shared integration requests

### Channels/messaging — next integration turn

- Mount merchant channel routes after secure auth ordering.
- Bind DLQ admin operations to method/path-sensitive v2 admin permissions.
- Replace plaintext OAuth token persistence/send-path reads/logging with encrypted channel storage.
- Require production KMS/HSM-style key provider, rotation, PostgreSQL queue/refund contracts, CI, and fake Meta transport before activation.

### Orders/settings — queued after channels

- Mount `merchantSettingsRouter` beside order routes behind secure merchant operational guards.
- Replace direct queue-file coordination with `suppressMerchantJobs(...)` and `deleteMerchantJobs(...)` on the final queue v2 lock/store.
- Re-read settings/version before credit reservation and before Meta send; suppress/rollback without new credit if auto reply is disabled.
- Resolve shared `PaymentStatus` vs `OrderPaymentStatus` once in coordinator-owned shared types/consumer code.
- Add lane unit/static/spawned-server/audit scripts and quality workflow coverage.

### Catalog/inventory

- Mount catalog router only after secure auth ordering.
- Replace legacy bot product authority with the tenant-scoped catalog adapter and remove dual authority.
- Carry schema, backup, audit, and workflow requests into DB/quality integration.

### Knowledge/AI — after corrected lane review and catalog integration

- Mount the single knowledge router behind auth v2 and remove legacy dual knowledge authority.
- Activate server-backed Saved Answers/Training pages through shared routing.
- Wire server-only policy and authoritative fact resolvers.
- Defer live Meta decision-engine use until PostgreSQL/vector/fact/policy integration is complete.
- Keep generated content visibly/provenance-distinct and untrusted until explicit merchant approval.

### Quality/observability

- Keep observability router unmounted until final secure shared wiring.
- Preserve strict quality/security/dependency/migration/artifact gates.
- Re-run all matrices on the exact integrated release SHA.

## Database/schema request ledger beyond auth

### Orders/settings

Require `merchant_operational_settings`, tenant-safe/versioned orders, `order_payment_decisions`, background-job settings-version contract, transactional suppression, composite tenant keys/FKs, RLS, deterministic migration provenance, and `legacy_import` rather than invented actors.

### Catalog/inventory

Require tenant-safe products/variants/options/identifiers/images, durable idempotency, transactional inventory, composite tenant FKs, source manifests/hashes, cascade/retention review, and variant-stock reconciliation.

### Channels/messaging

Require transactional durable jobs, encrypted channel connections, inbound-event dedupe+enqueue, reply reservations/refunds, outbound outcomes, database-time leases, `FOR UPDATE SKIP LOCKED`, tenant-safe constraints, and payload-free default administration.

### Knowledge/AI

Require transactional replacements for:

- `knowledge_saved_answers` with tenant/language/normalized-question uniqueness, positive optimistic versions, active state, and `source='merchant_approved'` constraint;
- `knowledge_training_requests` with redacted preview + digest, detected intent/language, suggested-reply provenance, approval state, rejection reason, positive version, and tenant ownership;
- `knowledge_learned_answers` with tenant-safe composite FK to training requests, examples/keywords, provenance, approval status, confidence, `safe_to_auto_reply`, and positive version;
- a knowledge audit table that stores digest/length/signal/decision metadata only and has no raw customer-message column;
- composite unique `(id, merchant_id)` targets and tenant-safe FKs;
- transactions/locking for approval/rejection/version changes so provenance conversion and version increments are atomic;
- DB checks/triggers enforcing `safe_to_auto_reply=true` only for `merchant_approved` + `approved`; generated content must never become approved/safe in place;
- deterministic migration manifests/source hashes and fail-closed handling of ambiguous legacy provenance.

Production semantic storage must use pgvector or an equivalent adapter with tenant filtering before scoring, approved/safe knowledge only, ephemeral customer query embeddings, no raw customer-query persistence, content/model uniqueness, rebuild on source-content change, and exact cross-tenant leakage tests.

### Quality-discovered PostgreSQL blockers

- generated schema drift;
- missing unique target for `conversations(id, merchant_id)` composite reference;
- PostgreSQL `42830` candidate-apply failure;
- migration test failures;
- database source-hash/contract drift;
- deterministic generation and clean-tree proof.

## Blocker ownership and routing

| Blocker | Owner | Required resolution |
|---|---|---|
| Auth repository-native/full build and source/compiled-output drift | Integration coordinator after ordered shared merges; quality workflow | Run repository-native typecheck/build and generated-output contract on exact integrated SHA; do not hand-edit compiled output to fake parity |
| Auth mounted HTTP/session/OTP/tenant/role tests | Integration coordinator + quality | Prove legacy bearer/cookies rejected, revocation next-request, pending merchant operational denial, cross-tenant fail, assistant no escalation, logout-all/device/password/permission invalidation |
| Auth PostgreSQL transactions/concurrency | `parallel/db-migration-cutover` | Implement the auth schema/locking requests above and pass disposable PostgreSQL migration/concurrency tests |
| Historical frontend admin-token helpers still present in shared `store.ts` source | Integration coordinator/browser-storage audit | Active login/transport no longer stores or sends a token, but final cleanup/audit must remove or prove inactive historical token/session-storage authority before release |
| Channels plaintext token migration/key management | Integration coordinator at channels integration | Remove legacy plaintext authority/logging and prove encrypted fail-closed flow |
| Orders/settings queue v1 vs channels queue v2 | Integration coordinator at orders integration | Central queue APIs; no direct settings ownership of queue file |
| Claimed Meta reply disable race | Integration coordinator | Two settings/version checks plus same-attempt reservation rollback |
| `PaymentStatus` shared frontend contract | Integration coordinator | Reconcile with canonical `OrderPaymentStatus`; full frontend build |
| Knowledge parseable-invalid runtime can silently drop state | `parallel/knowledge-ai` | Make structural validation fail closed, preserve original file on refusal, and add mutation/no-overwrite tests before lane merge |
| Knowledge PostgreSQL/vector/fact/policy/Meta activation | DB lane + integration coordinator | Replace JSON, enforce provenance/tenant transactions, tenant-filter vector search, server-only facts/policy, then fake-transport Meta integration tests before activation |
| PostgreSQL schema drift/composite FK/migration failures | `parallel/db-migration-cutover` | Fix schema/migration and pass disposable PostgreSQL |
| 22 dependency vulnerabilities including 14 high | Integration coordinator | Update reserved manifests/lockfiles or explicitly risk-review unavoidable transitives; never lower `pnpm audit --audit-level=high` |
| Native dependency review unavailable | Repository owner | Enable Dependency Graph/Advanced Security/native review as appropriate |
| Production observability/backups/legal readiness | Coordinator + repository/system owner + legal/support | Configure/test external production controls and record approvals |

## Validation ledger

- Auth lane: documented isolated TypeScript PASS; focused auth tests 15/15; no Actions/combined status on `d4f4ce2e...`.
- Auth integration: lane merge commit `dc57eb52...`; backend/frontend/shared cutover commits applied through coordinator head before this status update; new cutover contract tests added but not executed by CI.
- Channels: 13 documented tests passed; targeted checks passed; no CI.
- Orders/settings: 5 runtime + 4 static + 1 audit passed; isolated TypeScript checks passed; no final-SHA CI/full build.
- Catalog: 16 documented tests passed; isolated TypeScript passed; no CI.
- Knowledge/AI: documented 13 runtime + 5 audit/static tests passed and targeted service/route/frontend TypeScript passed; no Actions/combined status on `a09f1a3...`; structural invalid-runtime case is not covered and is a merge blocker.
- Quality final-head CI:
  - Quality gates `31137063434`: **FAILURE**;
  - Security/supply chain `31137063654`: **FAILURE**;
  - Backup/restore `31137063594`: **SUCCESS**.
- Full integrated server/frontend/database/contracts validation remains pending and is mandatory before any release decision can become GO.

## Owner requirements before release

- Enable/verify Dependency Graph/Advanced Security/native dependency review as appropriate.
- Verify branch protection, required checks, secret scanning/push protection, artifact access policy, and controlled dependency updates.
- Approve production credential key management, backup destinations/encryption/retention/PITR/object versioning/RPO/RTO and restore procedure.
- Record named privacy, consent, legal, retention/deletion, subprocessor, and support approvals.
- Explicitly approve any future merge to `main`.

## Final go/no-go checklist

- [x] Auth lane reviewed and merged first into coordinator.
- [ ] Auth integrated typecheck/full build/mounted HTTP/abuse/tenant-role/PostgreSQL tests pass.
- [ ] Historical browser token/session authority cleanup passes browser-storage enforcement.
- [ ] Channels integrated second with plaintext-token/key-management gates closed.
- [ ] Orders/settings integrated third with central queue APIs and claimed-reply race closed.
- [ ] Catalog integrated fourth.
- [x] Knowledge/AI final SHA reviewed and recorded at integration position 5.
- [ ] Knowledge/AI structural runtime correction reviewed and lane integrated fifth.
- [ ] PostgreSQL lane reconciles every domain/auth request and quality blocker.
- [ ] Quality lane integrated after DB/domain work.
- [ ] Shared payment-status/frontend build contracts pass.
- [ ] Dependency vulnerabilities remediated/risk-reviewed without weakening gates.
- [ ] Dependency Graph/native review operational.
- [ ] Observability/readiness/metrics/alerts securely wired.
- [ ] Full matrices pass on the exact final integrated SHA.
- [ ] Backup/restore/rollback evidence passes on release candidate.
- [ ] Logs/artifacts checked for secrets/PII/payloads.
- [ ] Legal/privacy/support approvals recorded.
- [ ] Owner explicitly approved any merge to `main`.

**Current release decision: NO-GO.**
