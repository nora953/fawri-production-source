# P0 hosted release evidence checklist — 2026-10-19

**Decision: NO-GO until every hosted gate below has concrete evidence.** Passing disposable CI is necessary but not sufficient. No permission to merge, deploy, run hosted migrations, or change grants is implied by this checklist.

## Baseline

- Repository: `nora953/fawri-production-source`, audit branch `fix/p0-provider-receipt-order-discovery-20261015`.
- Confirmed 41/41 green CI on code commit `c2d13827184d2917a767b1584c44ef47e38f0eb8`. Later documentation/SQL-probe commits require their own status verification.
- Railway `fawri-staging` / `production` / `fawri-web`: `DATABASE_URL` and `FAWRI_EXPECTED_POSTGRES_RUNTIME_ROLE` variable **names** confirmed; connector redacts values. Their presence does not prove the actual database role or endpoint.
- Previously inspected isolated Neon branch `br-snowy-voice-b1bovtwi`: role `fawri_staging_runtime` has `BYPASSRLS`, `CREATEDB`, `CREATEROLE`; it is **not established** that Railway uses that role.

## Required evidence and acceptance criteria

| Gate | Read-only evidence | Acceptance | Current state |
| --- | --- | --- | --- |
| H-01 actual Railway DB role | Run `sql/p0_hosted_runtime_role_readonly_check.sql` via application's actual DB connection in approved operator session; retain only role/privilege booleans | No SUPERUSER, BYPASSRLS, CREATEDB, CREATEROLE; audit effective inherited grants | **OPEN**: runtime role unverified |
| H-02 migration ledger | Read-only ledger inspection and reconciliation with committed Drizzle journal, including 0028–0034 | Every required migration applied exactly once in intended order, no unreviewed drift | **OPEN**: hosted state not reconciled |
| H-03 0034 guard installation | Run `sql/p0_0034_hosted_schema_readonly_check.sql` on target branch | Both triggers exist and are enabled (`O` or valid deployment mode); guard SECURITY DEFINER with intended settings; PUBLIC EXECUTE false | **OPEN**: no hosted result |
| H-04 pre-activation identity collisions | Run `sql/p0_0034_identity_collision_preflight.sql` before any approved activation | Zero duplicate payment or request identities across both authorities | **OPEN**: not executed on hosted data |
| H-05 cross-tenant authorization | Implement `p0-tenant-isolation-negative-test-spec-20261019.md` on disposable database and run API negative tests | No cross-merchant reads or writes; no bypass via forged context; legitimate flows pass | **OPEN**: spec only |
| H-06 deployment acceptance | Verify target deployment SHA, env separation, readiness, migration/rollback plan, and operational owner approval | Exact reviewed SHA deployed with explicit approval and rollback evidence | **OPEN**: no deployment authorized |

## Execution order and stop rules

1. Obtain authorized, credential-safe **read-only** evidence for H-01 and H-02. Do not copy `DATABASE_URL` into issue comments, logs, chat, or artifacts.
2. Review H-03/H-04 on the exact target database before requesting approval for any migration. If identity collisions exist, stop and prepare a reconciliation plan; do not delete or rewrite financial records automatically.
3. Implement H-05 using two synthetic merchants on disposable PostgreSQL. Never use live merchant data as test fixtures.
4. If the actual runtime role bypasses RLS, treat as a release blocker even if CI is green; design a least-privilege role/grants plan separately and request explicit authorization before applying.
5. Only after all gates have evidence, present a reviewed rollout/rollback plan for a separate explicit go/no-go decision.

**Security note:** Keep the intelligent-replies/bot subscription authority separate from cashier licensing; cross-authority identity checks protect shared payment references, not a merged subscription model.
