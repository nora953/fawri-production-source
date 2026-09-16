# Fawri Foundation Deep Audit Closure Record

Status: **Audit complete; integration/release work remains gated**

Audited Foundation base: `716da3bcc32eb905c1e4e11156d07e880ad422ee`

This record closes the temporary Foundation Deep Audit program. It does **not** merge any Draft PR, activate production providers, or declare the product Production Ready. It records the authority classification, validated blocker fixes, and the Golden Regression/integration blockers that must remain visible when normal development resumes.

## 1. Closure rule

The Foundation program used the following order throughout:

`Audit -> prove root cause -> small isolated slice -> targeted regression -> exact-SHA validation -> integration only with explicit approval`.

GitHub remains Source of Truth. Replit Shell is only a temporary execution substitute for GitHub Actions where hosted jobs fail before runner allocation. `steps=null`, `runner_id=0`, or missing job logs are infrastructure evidence, not application PASS/FAIL evidence.

No Draft PR listed below is implicitly approved for merge by this document.

## 2. PHASE 7 — final legacy/route classification

### Canonical / production-active authorities

- `/api/catalog` and `/api/inventory`: canonical PostgreSQL catalog/inventory authority under secure merchant session enforcement.
- `/api/settings`: canonical merchant settings authority; PostgreSQL HTTP authority proof is isolated in #150.
- `/api/channels`: canonical merchant channel authority; PostgreSQL HTTP authority proof is isolated in #151.
- `/api/conversations` and `/api/orders`: canonical operational authorities mounted ahead of the shared compatibility router.
- Cashier/POS PostgreSQL authorities are canonical. HTTP reachability correction is isolated in #146; operational suspension/rejection cutoff is isolated and runtime-validated in #153.
- Normal external `POST /api/meta/webhook` is owned by the middleware pipeline in `app.ts`: signature/security -> merchant operational access -> manual-conversation guard -> durable queue ingress. The queue ingress is terminal for normal external traffic.

### Transitional but production-relevant

- `/api/meta/login` and `/api/meta/callback` remain transitional Meta OAuth connection surfaces. They are fail-closed behind the Meta connection activation gate. The missing mid-flight operational cutoff/persistence race is fixed and runtime-validated in #155.
- Meta live send remains activation-gated separately from source-authority correctness.

### Compatibility aliases / intentionally constrained legacy surfaces

- Legacy product mutation surfaces are disabled when PostgreSQL authority is required.
- Legacy product reads that remain reachable act only as compatibility aliases over the canonical catalog authority; they must not regain write authority.
- Legacy conversation/order compatibility endpoints are retired/fail-closed in required PostgreSQL mode.
- Legacy `/meta/pages` compatibility behavior must not supersede canonical channel authority.
- The historical shared `POST /meta/webhook` handler is production-inactive in required PostgreSQL mode; normal external ingress terminates earlier in the canonical queue pipeline.

### Retired / dead / unsafe legacy surfaces

- `/api/bot/debug`: explicitly retired outside deliberate local debug mode by #162; exact-head validation completed.
- legacy saved-answer/bot-training merchant authority: blocked by the Knowledge cutover gate before the shared compatibility router.
- legacy `/api/auth` fallthrough: blocked by `enforceLegacyAuthProductionCutoverGate` after supported PostgreSQL auth surfaces.
- trusted internal Meta HTTP replay helpers remain legacy/dead for the current worker: the active worker processes durable jobs directly and no current worker emitter requires loopback replay.

### Meta webhook GET verification classification

No canonical GET verification handler is established by the reviewed `app.ts` middleware chain, `metaWebhookSecurity.ts`, or the shared Meta router section. This is therefore classified as **not proven / provider-activation readiness**, not as a competing production authority. If the deployed Meta configuration requires a GET verification challenge endpoint, that must be supplied and validated as a deployment/activation slice before production Meta enablement. It is not a reason to reactivate the legacy POST runtime.

## 3. Foundation blocker fixes — technical validation status

The following isolated Draft PRs were created from the audited base. They remain unmerged unless separately approved.

### Runtime defects closed with exact-head validation

- #153 — Cashier operational cutoff: existing station/operator access and stale pairing are rejected after merchant suspension/rejection.
- #154 — Meta reply operational cutoff race: automatic and manual sends re-check merchant access immediately before provider-send boundaries; reservation release/suppression remains exactly-once. Final PostgreSQL CI substitute passed 24/24 runtime tests and 4/4 signed-ingress/manual-operation tests.
- #155 — Meta OAuth activation cutoff: fresh operational check before Page subscription plus transactionally protected credential persistence; exact-head PostgreSQL regression passed.
- #156 — Meta webhook PostgreSQL ingress cutover: Page/merchant gating uses authoritative PostgreSQL state; exact-head PostgreSQL regression passed.
- #157 — physical catalog/support media lifecycle: irreversible deletion captures cleanup intent before relational purge, performs idempotent physical deletion only after committed tombstone, and persists/retries failed cleanup. Exact-head PostgreSQL + filesystem regression passed.
- #158 — Cashier/POS deletion lifecycle: transient auth material is removed while retained accounting anchors are anonymized/closed. Exact-head PostgreSQL regression passed.
- #159 — retained audit network/device PII: `ip_address` and `user_agent` are scrubbed with retained audit chronology; exact-head validation passed.
- #160 — raw provider identifiers retained after deletion: external Page/event/message identifiers are replaced with deletion-safe internal linkage while debit/refund/exactly-once evidence remains coherent. Exact-head PostgreSQL regression passed.
- #161 — merchant promotions deletion lifecycle: explicit merchant-scoped promotion cleanup added; exact-head validation passed.
- #162 — legacy bot debug retirement: unsafe diagnostics are 410-disabled outside explicit local debug mode; exact-head validation passed.
- #163 — Meta integration CI PostgreSQL harness: disposable PostgreSQL/schema bootstrap fixes spawned-server integration startup without weakening runtime `DATABASE_URL` requirements; exact-head CI substitute passed all three spawned-server integrations.

### Earlier Foundation dependency slices that remain part of integration planning

- #139 — secure PostgreSQL merchant-session compatibility bridge.
- #141 — deterministic PostgreSQL migration-history reproduction.
- #142 — catalog UI authority recovery after mutation failure.
- #143 — regression-only proof for variant-dependent historical evidence.
- #145 — durable catalog variant-row identity preservation.
- #146 — active Cashier HTTP route reachability.
- #147 — PostgreSQL global admin golden journey.
- #148 — PostgreSQL subscription golden journey.
- #149 — regional/currency PostgreSQL guard correction + HTTP proof.
- #150 — secure PostgreSQL merchant settings HTTP authority.
- #151 — secure PostgreSQL merchant channels HTTP authority.

## 4. PHASE 8 — Golden Regression Suite register

The Golden Regression program is considered **prepared**, not fully integrated.

### Required golden journeys / authority proofs

1. **Merchant golden journey (#144)**
   - secure merchant authentication/session;
   - authoritative dashboard reads;
   - catalog create/update/inventory;
   - Cashier staff/station/pairing/operator lifecycle;
   - sale/report/inventory reflection;
   - tenant isolation;
   - no legacy JSON authority.

2. **Admin golden journey (#147)**
   - owner login/device verification;
   - assistant lifecycle and permissions;
   - session/device revocation;
   - PostgreSQL audit/security evidence;
   - no legacy auth authority.

3. **Subscription golden journey (#148)**
   - admin permission boundary;
   - activation/plan change;
   - merchant current subscription view;
   - tenant isolation;
   - canonical entitlement authority.

4. **Settings authority proof (#150)**
   - secure session-derived tenant;
   - optimistic `expected_version` conflict behavior;
   - PostgreSQL persistence and isolation;
   - no legacy settings store in required mode.

5. **Channels authority proof (#151)**
   - secure tenant isolation;
   - encrypted credential non-disclosure;
   - optimistic disconnect versioning;
   - durable disconnect job ownership;
   - no legacy channel authority in required mode.

6. **Deletion regression family (#157-#161)**
   - physical media;
   - Cashier/POS auth + retained accounting anchors;
   - retained audit PII;
   - provider identifier retirement;
   - merchant-scoped promotions.

7. **Operational cutoff family (#153-#156)**
   - Cashier access;
   - Meta reply send race;
   - Meta OAuth activation race;
   - webhook PostgreSQL ingress authority.

8. **Schema/history and catalog evidence**
   - #141 migration-history reproducibility;
   - #143/#145 durable variant/inventory/order/promotion evidence;
   - #149 regional currency guard.

## 5. Remaining blockers are now explicit

These are **not hidden Foundation findings**; they are the post-audit integration/release register.

### Integration blockers

- All Foundation fixes are still isolated Draft PRs. A clean integration sequence needs explicit approval before any base/integration write.
- The final merchant Golden Journey must be validated on a combined candidate containing its required session/Cashier dependencies (at minimum #139, #146 and the Cashier operational cutoff #153, plus any later dependency discovered during the clean integration sequence). Do not weaken the journey to make an unintegrated baseline pass.
- Cross-slice overlaps in `app.ts`, merchant deletion authority, Meta routes, and Cashier authorities must be integrated as clean single-parent/fast-forward work rather than by blindly merging every Draft PR.

### CI infrastructure blocker

GitHub hosted Actions continue to produce pre-runner failures on unrelated workflows (`steps=null` / no job logs). Until runner allocation is restored, exact-head Shell execution can stand in only for the corresponding CI workflow. This does not justify bypassing required tests.

### External production-activation blockers

These are release/deployment concerns rather than unresolved authority contradictions:

- Meta production app approval/configuration, verify/challenge endpoint if required by provider setup, live credential provider/KMS readiness, and live-send activation gates;
- production payment-provider credentials/approval where required;
- production domain/infrastructure/secret provisioning and operational environment configuration.

## 6. Resume-development decision

**Foundation Deep Audit is complete.** Normal development may resume on isolated branches, but the validated Foundation fixes are mandatory integration dependencies and must not be bypassed or replaced by legacy fallbacks.

This is specifically **not** a Production Ready declaration. Before production release, Fawri still needs:

1. explicit approval for Foundation integration order;
2. clean integration/rebase of the required slices into a single candidate;
3. exact combined-candidate Golden Regression execution;
4. restoration or replacement of reliable CI execution;
5. production provider/infrastructure activation gates to pass.

Until those steps are complete, the correct state is:

- Foundation audit: **complete**;
- validated isolated fixes: **available, Draft/unmerged**;
- integrated release candidate: **not yet complete**;
- Production Ready: **no**.
