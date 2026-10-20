# FAWRI P0 continuation checkpoint

Last verified UTC: 2026-10-20T01:44:47.139Z
Branch: `fix/p0-provider-receipt-order-discovery-20261015`
PR: [#550](https://github.com/nora953/fawri-production-source/pull/550), OPEN/DRAFT.
Actual base: `test/p0-integrated-billing-meta-20261015`, not main.
Latest verified executable source: `4fe28acd0d83d17fc2f133bc6096e0d620e3d3f0`.
This containing checkpoint commit changes documentation/evidence and a comment wrap only; it is intentionally [skip ci]. Do not attribute source CI runs to this documentation SHA.

## Release decision: NO-GO

Transaction replay is remediated under the tested non-writer runtime preconditions; audit/identity forgery, shared operator capabilities, arbitrary tenant-GUC trust and hosted acceptance are NOT resolved. No merge or deployment authorized. Do not invent a completion percentage.

## Verified completed increments

1. Recovered actual GitHub HEAD c5225acbeec5cfc2e0411c11cd17737ab1ae6dad, inspected PR/base/reviews and all 43 completed SUCCESS workflows. Migration 0036 canonical SQL, journal, snapshot reproduction and disposable application passed. Its isolated direct LOGIN suite proved suspended-actor replay denied while active-window replay and audit forgery persisted. Durable recovery checkpoint: 6ab28c89bb28464bda0347b5db1b6d14c3598ec5. Baseline evidence: evidence/P0-0036-VALIDATION-20261020.json.
2. Source 4fe28acd0d83d17fc2f133bc6096e0d620e3d3f0 adds migration 0037_audited_admin_transaction_binding.sql, reviewed stage 0037 with the prior tenant-security.ts preimage, schema bigint/default, generated snapshot and journal. Historical audits receive transaction ID 0. New audits default to the full PostgreSQL txid_current(), including epoch; the RLS predicate requires the issuing transaction ID. Known committed audit identifiers no longer authorize a different transaction, including reuse of the same pooled connection.
3. Guarded direct LOGIN tests cover ordinary tenant CRUD/foreign denial with trusted scope, current actor suspension, disabled profile, password-change requirement, expiry, issuing-transaction success, rollback of settings/audit record, and three concurrent committed-token replays. Explicit audit-writer forgery characterization is retained. Added a separate proof that an arbitrary-SQL shared login can choose a foreign tenant GUC.
4. Source trace confirms directory INSERT and consumption already share one transaction. Receipt read/review/execution audit creation remains compatible, confirmed by actual regression runs. Inventoried all production audit issuers and the two-phase replay authorization dependency in P0-ADMIN-TRANSACTION-BINDING-20261020.md.

## Actual verification for source 4fe28acd0d83d17fc2f133bc6096e0d620e3d3f0

- **43/43 GitHub workflows completed SUCCESS**, zero failure/cancellation/pending. Full run IDs, URLs, proof JSON and per-invocation counters: evidence/P0-0037-TRANSACTION-BINDING-20261020.json.
- [Schema validation 39354615431](https://github.com/nora953/fawri-production-source/actions/runs/39354615431), job 118406436402: unmodified canonical generator, reviewed SQL and snapshot reproducible, journal consistent, disposable migration application and plan rollback/commit checks passed.
- SQL SHA256: 4cd1dc730da452b47e5a269114ab771e6a2bbdfb37f511fb16a92c3ede6959e8. Snapshot SHA256: cd15941b803b78782394b6951945697372b08c47306afb6febab1587596fcba6.
- [Isolated audit 39354615625](https://github.com/nora953/fawri-production-source/actions/runs/39354615625), job 118406437488: admin boundary **7 PASS /0 FAIL /0 SKIP**. Marker P0_AUDIT_TRANSACTION_BINDING_PROOF: activeWindowReuse=false, sameConnectionLaterTransactionReuse=false, concurrentSessions=3, suspendedActorReuse=false. P0_AUDIT_FORGERY_PROOF and P0_TENANT_GUC_TRUST_PROOF still demonstrate residual blockers under their stated SQL/grant preconditions; no HTTP exploit or release acceptance.
- Retained positive regressions: merchant-management RLS 6 PASS; production RLS 30 PASS; receipt inbox 18 PASS; operator wire recovery 17 PASS; receipt replay execution HTTP 20 PASS; receipt replay review HTTP 20 PASS. All 60 emitted AUDIT_SUITE_RESULT invocations have exit=0, failed/skipped/cancelled=0 and summaryComplete=true. These include parent/repeated-runtime/restore phases; do not sum them into a unique-test count.
- [Foundation 39354615205](https://github.com/nora953/fawri-production-source/actions/runs/39354615205) SUCCESS, including database/API types and build, transaction lifecycle, RLS/directory, cashier/commerce checks. Migration candidate, schema, inventory, subscription, order, Meta, cashier, restore and Node22 compatibility workflows succeeded.
- Local actual: guard/audit-summary 19/19 PASS; readiness unit 12/12 PASS; DB typecheck exit 0; syntax/diff checks PASS. Local SQL NOT RUN: no PostgreSQL/Docker. Local generation used existing installed Drizzle CLI with equivalent dispatcher after pnpm attempted refresh was blocked by pre-existing xlsx integrity policy; no policy/dependency/lockfile changes. Standard canonical generation was then proven in CI.

## Remaining blockers and next exact engineering action

Implement and prove a **separate authenticated operator authority**, not another actor-ID/GUC comparison. Before changing grants:
1. Use the issuer/call-path matrix in P0-ADMIN-TRANSACTION-BINDING-20261020.md. Move directory issuance and receipt read/review privileges behind a trusted operator connection/role; tenant LOGINs must have no audit/admin identity DML, no operator EXECUTE, no inherited/SET-reachable issuer/owner role or column-level write path.
2. Preserve receipt replay authorization BOTH before provider confirmation and inside the tenant billing transaction callback. Merely switching the first call to an operator pool breaks or weakens the second call. Test active administrator success and invalid/forged actor/session denial with real direct LOGINs.
3. Trace auth/bootstrap/session/admin lifecycle writes to accounts/admin_profiles/admin_permissions/account_sessions/trusted_devices before restricting them. A definer issuer callable by tenant SQL with a forged actor ID is not a boundary.
4. Resolve the stronger tenant-login threat model: arbitrary fawri.tenant_id remains trusted session input. Separate operator credentials alone do not stop an SQL-compromised tenant runtime selecting another tenant; require database-verified tenant identity/scope and independent credentials/capabilities.
5. Keep the existing historical hosted rollout/provider/storage/retention/ownership gates from WORK_HANDOFF.md and retained P0 reports open until individually reconciled. Passing this source CI does not close them.

Account/profile revocation tests use READ COMMITTED. Do not claim immediate revocation under a retained REPEATABLE READ snapshot. Direct audit writers can explicitly forge/change transaction binding; their removal is still mandatory.

## Environment and interruption restrictions

- GitHub audit branch only. Never overwrite a newer head; use expected-SHA ref updates and verify actual head after publishing. No main push, merge, Railway deployment or hosted migration.
- Authorized Neon target, only if independently reverified disposable before use: project round-fire-18493605 / branch br-billowing-leaf-b14yamgu / neondb. **No Neon calls or mutations in this increment.** Prior catalog evidence (not refreshed this cycle): staging runtime LOGIN has BYPASSRLS/CREATEROLE, restricted runtime NOLOGIN; safe direct LOGIN certification remains blocked. Do not repeat unsafe role-creation experiments or alter default/staging/production.
- No credentials exposed; no broad hosted grants/revokes, destructive SQL or production data changes.
- Offline cashier and smart replies remain distinct; no new cloud dependency.
- Local ordinary git push lacked HTTPS credentials; GitHub connector published the durable commits with expected-head checks. The local checkout contains a private equivalent documentation commit and uncommitted connector-published source, so its local HEAD is NOT the remote source of truth. Recover from remote 4fe28acd0d83d17fc2f133bc6096e0d620e3d3f0 and the containing checkpoint commit in a fresh clean checkout/worktree; do not reset/overwrite uncommitted work.
- Every new bounded increment: inspect -> implement -> focused tests -> commit -> checkpoint -> verify SHA before expensive work. No safety or release checks may be weakened.
