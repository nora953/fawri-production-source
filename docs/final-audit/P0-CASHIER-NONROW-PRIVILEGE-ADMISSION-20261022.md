# P0 protected-table non-row privilege admission — 2026-10-22

## Verified remediation acceptance

Executable645b534aea0d32848b4467b5bbebf8fd671deddb is accepted in isolated GitHub Actions:47/47 parent workflows SUCCESS,82/82 clean native invocations,80 unique files. Native39824457555/job119983935469 confirms174 protected-table direct grant cases and20 role/column cases, all three original probes now REJECTED. Revocation recovery,18-table catalog isolation and rollback restoration PASS. Foundation39824457202/job119983933998 final marker, schema39824456460/job119983931446 canonical reproduction, quality39824457487 and security39824456372 SUCCESS; audit119983930705/review119983930995:0 high/0 critical/2 moderate. No failed CI/retry. [Exact accepted evidence](evidence/P0-CASHIER-NONROW-PRIVILEGE-ACCEPTANCE-20261022.json). Prior pending observations remain historical only.

## Proven baseline

Executable `5d3dde10a03ca3c3f92a9435c005f8334546b315`, isolated run39821762823/job119974573789 completed SUCCESS. All82 invocations clean (exit0/failed0/skipped0/cancelled0/summaryComplete). Checkout770e33b892747f61a9811e3215058edee95d0f06 and source share tree5dab5e9028856478e07edf762a2068543368977e. [Immutable baseline inventory/results](evidence/P0-CASHIER-NONROW-PRIVILEGE-BASELINE-20261022.json).

Actual restricted LOGIN's18 cashier tables have active RLS, no reachable owner, and no baseline TRUNCATE/TRIGGER/table-or-column REFERENCES privileges. No user-schema views were observed;15 public/private routines catalogued, including five executable routines. This bounded migrated fixture is not a hosted schema/ACL inventory and does not certify every future alternate path.

After the fixture explicitly granted TRUNCATE, REFERENCES and TRIGGER individually on merchant_cashier_discount_settings, production readiness incorrectly ACCEPTED all three. In private scope for merchant A, actual LOGIN successfully truncated the table, removing both synthetic merchants' rows. A fixture-only fixed-table SECURITY DEFINER observer checked2 before/0 after on the lock-holding connection. ROLLBACK restored both rows; grants were revoked and fixture observer disposed. No production grant was changed.

This proves an admission gap under privilege drift, not an existing unsafe default grant or hosted compromise. Baseline diagnostic success reports the finding; it is not a security acceptance result. The one observed parent inventory was43/47 success with4 pending; no waiting/poll loop or retry was requested. Last accepted isolated executable remains bec6e7114be692981df07bc7b25ad456116fda42 (47/47+81/81).

## Remediation prepared

Readiness now inventories TRUNCATE/TRIGGER/REFERENCES table privileges and column REFERENCES on every PRODUCTION_PROTECTED_RLS_TABLES entry. It checks current user, session user, inherited roles and SET-reachable roles; PostgreSQL privilege evaluation includes effective PUBLIC grants. Nonempty inventory rejects with PRODUCTION_DATABASE_NONROW_PRIVILEGE_REACHABLE. Missing or malformed inventory rejects through the existing strict string-array validation. Existing authentication mutation error precedence is preserved.

Only runtime readiness and unit/native tests change. No migrations, ordinary business CRUD, RLS predicate, scope issuer, staff locks, discount/PIN policy, credentials or hosted grants change. The guard rejects startup/readiness with unsafe ACLs; it does not revoke SQL rights, remove RLS's limitations, continuously monitor every SQL statement, or certify a hosted environment.

Native regression retains baseline inventory and the table-wide TRUNCATE demonstration while requiring readiness rejection first. It tests all protected tables' direct TRUNCATE/REFERENCES/TRIGGER grants, four privilege forms (including REFERENCES(merchant_id)) across direct/PUBLIC/inherit-only/SET-reachable/unreachable roles, original LOGIN privileges behind SET ROLE, revocation recovery, and unchanged two-merchant row visibility/rollback. The fixture-only observer remains explicitly outside canonical application routines.

Local node --check PASS for native test. Full TypeScript/unit/native CI execution is now verified on645b534. No local dependency or DB execution claimed. See the accepted evidence above.

## Continuation

Completed: read and verified the new source's exact isolated native marker P0_CASHIER_NONROW_PRIVILEGE_REMEDIATION and AUDIT_SUITE_RESULT records, Foundation/quality/schema/security results. Check status once per continuation; if pending, record and advance independent source work. Preserve failures before correction or a justified bounded retry. Do not rerun passing tests for docs/status alone.

After bounded acceptance, continue alternate routine/trigger/view and complete same-tenant authority review. P0 auth/privacy/offline/grace/sync/retention/provider/storage inventory remains OPEN. Release NO-GO, whole-P0 percentage UNMEASURED. GitHub/Actions only; no hosted connector, deployment, main push, merge, credential rotation or P1/P2.
