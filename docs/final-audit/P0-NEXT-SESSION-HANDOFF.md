## Owned child-process readiness configuration — 2026-10-20 UTC

- Source8d700180b683dd0b95f34183350bfa2ba4b9f617 reached38 successful workflows but Meta pipeline39378687588/job118482527162 failed at owned Meta app startup. Child helper invokes production RLS readiness with explicit fixture env and omitted the new operator URL. Repository-wide search also found the same omission in billing-provider-discovery-child.mjs. Both helpers now declare synthetic operator configuration for the tenant-RLS startup probe, matching other positive fixtures. This does NOT certify operator connectivity; the separate direct-login application directory test supplies actual restricted operator credentials and exercises issuance.
- No production gate, SQL assertion, role privilege or negative missing-configuration test relaxed. Keep source8d700180 non-accepted until the corrected source completes all required workflows and isolated SQL suites. NO-GO unchanged.

## Runtime contract and positive-fixture repair — 2026-10-20 UTC

- Source43710541da76814e172d889d0bf48911a4a696c6 still failed API typecheck because API's existing ambient @workspace/db contract omitted the new factory export (TS2339). Updated that narrow runtime contract with the actual typed factory, with no suppression/any/dependency change. Focused strict TypeScript check of operator pool and readiness + their service dependencies now exits0 locally.
- Actual source d581 isolated log run39378259268/job118481186655 proves admin-boundary9 PASS/0FAIL/0SKIP, including P0_AUDIT_FORGERY_DENIED (audit CRUD+forged transaction denied) and dedicated direct-login app directory. Run later cancelled; it is not complete acceptance. A different priority fixture failed because its production-ready env omitted newly required operator URL. Updated knowledge/deletion positive readiness fixture configuration; the production gate remains strict and new missing-config negative tests retained.
- Next: verify this containing repair CI, then record exact source SHA/all workflow and SQL results. NO-GO; hosted role/grant, receipt operator split and arbitrary tenant GUC/identity DML blockers remain.

## Typecheck repair in flight — 2026-10-20 UTC

- Source d58141284bc35ff9fc8e3f36930a53636a22ea9f failed API typecheck in CI: operator module directly imported pg but API package does not own pg declaration types (TS7016; resulting callback TS7006). Foundation39378259170/job118481186225 and billing readiness39378259171/job118481186159 logs verify this. This source is NOT accepted; do not count its failed/cancelled runs as successful SQL evidence.
- Repair centralizes typed additional pool construction in @workspace/db:createPostgresPool, reusing the existing sanitized transport handlers for primary and operator pools. No @ts-ignore, declaration suppression, dependency or lockfile change. Re-run source CI after this containing repair; local focused suites remain required.

## In-flight role-bound directory issuer increment — 2026-10-20 UTC

- Last verified remote HEAD before this batch: 92f197d2d4bb29559331abf26d38e6f6e6c53b52. Last fully CI-accepted executable source 4fe28acd0d83d17fc2f133bc6096e0d620e3d3f0 (43/43 SUCCESS). Branch/PR/base unchanged.
- New containing source adds 0038 role-bound bounded directory issuer. The predicate requires the authenticated session_user to hold its non-PUBLIC EXECUTE capability, independently of audit/GUC content. Directory uses issuer instead of direct audit INSERT and uses FAWRI_OPERATOR_DATABASE_URL in production; no production fallback to tenant pool. Dedicated operator connection identity rejects superuser/BYPASSRLS/CREATEROLE, switched identity, reachable privileged/table/function owner authority and missing issuer grant.
- Tenant readiness rejects missing issuer migration or direct/inherited/SET-reachable issuer capabilities, plus missing/invalid dedicated operator URL. New role privileges were created only as fixture code for guarded CI, never on Neon.
- Actual local focused operator pool/readiness/transaction lifecycle tests: 28 PASS /0 FAIL /0 SKIP. Disposable guards+summary:19 PASS /0 FAIL /0 SKIP. Syntax and diff checks PASS. Complete typecheck, SQL tests and canonical regeneration NOT RUN locally: retained Drizzle dependency installation incomplete. 0038 manual-stage snapshot derived with the committed canonical snapshot-ID algorithm; CI must prove full reproducibility and execution.
- Guarded SQL fixture adds expected forged-audit denial with audit CRUD and current transaction ID, denied forged-actor issuer call/SET ROLE, bounded operator issuance without audit CRUD, unavailable actor rejection, application directory through separate direct LOGIN pool, and replay across four sessions. Production RLS matrix adds actual direct/SET-reachable/non-reachable issuer grant checks. Existing legitimate NOLOGIN operator fixture receives the narrowly required issuer EXECUTE (it is not a direct-login security proof).
- NEXT EXACT ACTION: inspect containing commit CI. Require schema generation/application, Foundation DB/API typecheck/build/unit tests, isolated admin-boundary/positive app directory and receipt suites. Fix real failures before advancing. SQL security remediation is NOT yet accepted. Then separate receipt operator capabilities (autocommit + billing transaction callback) and database-verified tenant scope.
- NO-GO: tenant GUC trust, identity/permission DML and audit integrity, receipt raw operator grants and hosted safe LOGIN/rollout gates remain. No Neon/production/staging/default mutation, hosted grant/role creation, merge or deployment. Preserve cashier/replies separation. This section supersedes next-action instructions below until CI is reconciled.

# FAWRI P0 next-session handoff

Verified UTC: 2026-10-20T01:44:47.139Z
Branch `fix/p0-provider-receipt-order-discovery-20261015`; PR [#550](https://github.com/nora953/fawri-production-source/pull/550) OPEN/DRAFT, base `test/p0-integrated-billing-meta-20261015`.
Last verified executable source: `4fe28acd0d83d17fc2f133bc6096e0d620e3d3f0`; **43/43 workflows completed SUCCESS**. Containing docs commit is [skip ci], with only a non-executable comment wrap besides evidence/docs.

Read P0-CONTINUATION-CHECKPOINT.md and P0-ADMIN-TRANSACTION-BINDING-20261020.md first, then inspect LIVE remote HEAD/PR/CI. Preserve newer work. Local checkout HEAD is not authoritative: ordinary push lacked HTTPS credentials and connector commits were used. Use a clean checkout/worktree of verified remote, without resetting existing work.

## Completed — do not repeat

0036 active admin/profile guard validated, reproducible SQL/snapshot and suspended-actor proof. 0037 adds epoch-aware issuing transaction ID to audit records; old records receive 0. Predicate denies committed-token reuse in later transactions and other sessions. Directory and receipt workflows still pass. Isolated run 39354615625/job118406437488: admin boundary7 PASS; production RLS30; merchant management6; inbox18; execution20; review20; operator recovery17. All 60 emitted invocation summaries complete, zero failed/skipped/cancelled (not unique-test totals). Schema39354615431 and Foundation39354615205 SUCCESS. Exact links/proofs/all43 runs in evidence/P0-0037-TRANSACTION-BINDING-20261020.json.

## Next exact task — real issuer separation

**NO-GO**. Audit writers can still forge current-transaction authority; shared identities/permissions/operator EXECUTE remain unsafe. New actual CI proof also shows arbitrary SQL can set foreign fawri.tenant_id with NO audit access. These are SQL-role/grant threats, not demonstrated HTTP exploits.

Implement trusted operator authenticated role/pool and bounded issuance, with no tenant audit/admin-identity DML, operator EXECUTE, column write path or inherited/SET-reachable privileged role. Use report's full issuer matrix. Receipt replay authorizes twice: autocommit before provider confirmation AND in the entitlement transaction callback; preserve both checks and existing durable commit boundaries. Trace auth/bootstrap/session lifecycle before narrowing global auth table access. Also bind tenant scope to database-verified identity; arbitrary GUC values are not credentials. Prove denied forged actor/audit and positive admin/receipt paths using directly authenticated restricted LOGINs. 0037 alone does not prevent audit writes or forged tenant scope.

Only Git audit changes/isolated guarded CI. No hosted mutation/merge/deploy. Neon permitted only after disposable revalidation: round-fire-18493605 / br-billowing-leaf-b14yamgu / neondb. No new Neon inspection this increment; prior safe LOGIN provisioning blocker remains. Do not recreate privileged trial roles. Preserve historical hosted/provider/storage/retention/ownership gates and separate cashier/replies. Checkpoint verified work before every expensive step.
