# PostgreSQL migration cutover handoff

## Final status

**PostgreSQL-owned work is complete. No PostgreSQL-owned blocker remains.**

- Repository: `nora953/fawri-production-source`
- Branch: `parallel/db-migration-cutover`
- Coordination base: `b08c854f177953d3690c5dffde905fdb0c93eb09`
- Tested DB code SHA: `cdcf99337012b3616d2a6d20e5bef5f761158146`
- Remote HEAD immediately before this handoff-only commit: `cdcf99337012b3616d2a6d20e5bef5f761158146`
- Ahead / behind at tested DB code SHA: **44 ahead / 0 behind**
- PR #5: **Draft / Open / Unmerged**
- PR base: `hardening/postgresql-foundation`
- PostgreSQL-owned failures: **0**
- Integration-only failures: **2**

This handoff is a documentation-only successor of the tested DB code SHA. The exact post-handoff Final Remote HEAD is read from GitHub after this commit and reported in the final delivery message. No DB code changes are permitted after the tested DB code SHA above.

## Latest GitHub Actions evidence

Only the latest runs associated with tested DB code SHA `cdcf99337012b3616d2a6d20e5bef5f761158146` are counted.

| Workflow | Run ID | Result | Classification |
| --- | ---: | --- | --- |
| PostgreSQL migration candidate | `31203394983` | **SUCCESS** | DB-owned green |
| Complete migration safety | `31203394726` | **SUCCESS** | DB-owned green |
| Complete schema candidate | `31203394923` | **SUCCESS** | DB-owned green |
| PostgreSQL schema validation | `31203394706` | **FAILURE** | only two integration-only Orders/Settings failures |
| Merchant settings | `31203394724` | **FAILURE** | outside DB ownership |

### `migration:test`

Latest broad migration suite result:

- tests: **81**
- passed: **79**
- failed: **2**
- skipped: **0**
- PostgreSQL-owned failures: **0**

The only failures are:

1. `active orders page is server-authoritative`
2. `extensionless settings imports resolve to the server-authoritative page`

Both are integration-only Orders/Settings contracts outside the DB allowlist. This lane did not modify Orders/Settings frontend authority, `app.ts`, conversation operations, `merchantReplyEntitlement`, or any other out-of-lane application file.

The `Merchant settings` workflow failure is likewise outside DB ownership and is not treated as a database migration failure.

## Executed PostgreSQL acceptance

All items below were actually executed against disposable PostgreSQL; they are not inferred from skipped workflow steps.

| Gate | Result | Evidence |
| --- | --- | --- |
| weak legacy sessions are not migrated | **PASS** | source identity changes, but no authoritative `account_sessions` rows are produced |
| profile exclusivity | **PASS** | merchant account cannot become an admin profile; rejected by `admin_profiles_account_kind_fk` |
| catalog variant option uniqueness | **PASS** | duplicate normalized option name rejected |
| catalog tenant integrity | **PASS** | cross-tenant variant/product references rejected |
| catalog image safety | **PASS** | `data:` image URL rejected and cross-tenant product image reference rejected |
| catalog idempotency constraints | **PASS** | duplicate key, cross-tenant result product, and excessive retention rejected |
| outbound delivery uncertainty constraints | **PASS** | valid `uncertain` outcome accepted; invalid pending/failure finalization combinations rejected |
| RLS tenant isolation | **PASS** | tenant `m1` sees/updates only its own product rows |
| audited/admin boundary contracts | **PASS** | cross-lane PostgreSQL acceptance remains green |
| dual-stage Drizzle generator | **PASS** | non-interactive and deterministic |
| committed migration reproducibility | **PASS** | committed dual-stage chain reproducible from committed `0001` baseline |
| committed chain apply | **PASS** | `0001 -> 0002_cross_lane_stage -> 0003_cross_lane_cleanup` applied on disposable PostgreSQL; journal/history contains four entries including `0000` |
| cross-lane PostgreSQL contracts | **PASS** | disposable acceptance green across Auth, Channels, Orders/Settings schema contracts, Catalog, Knowledge and tenant isolation |
| Knowledge provenance fail-closed | **PASS** | ambiguous legacy Knowledge suggestion provenance rejected |
| source mutation fail-closed | **PASS** | changed source data, lineage, and Drizzle schema identity rejected |
| rollback | **PASS** | disposable rollback acceptance executed successfully |
| commit-test | **PASS** | disposable commit rehearsal executed successfully |
| reconciliation | **PASS** | disposable reconciliation executed successfully |
| cleanup | **PASS** | disposable cleanup executed successfully |

The PostgreSQL edge gate itself executed and passed inside GitHub Actions against the healthy `postgres:16-alpine` disposable service. It was **not skipped**.

## Dependency-resolution correction for edge acceptance

The root test `scripts/tests/cross-lane-postgresql-edge-gates.test.mjs` no longer depends on accidental root hoisting. It resolves `drizzle-orm` and `pg` explicitly from the `@workspace/db` package context (`lib/db/package.json`), where those dependencies are owned. No root `package.json`, lockfile, or package manifest was changed for this correction.

A follow-up fixture correction preserved the original profile-exclusivity semantics while ensuring the test reaches the intended account-kind composite FK rather than failing earlier on the profile ID check.

## Safety and environment confirmation

- Production PostgreSQL contacted: **NO**
- Replit PostgreSQL contacted: **NO**
- Disposable PostgreSQL used: **YES** — GitHub Actions `postgres:16-alpine`, local `fawri_ci` plus disposable child databases/roles
- Force push used: **NO**
- `main` modified: **NO**
- `hardening/postgresql-foundation` modified: **NO**
- PR merged: **NO**
- out-of-lane Orders/Settings fixes attempted: **NO**

## Integration disposition and freeze

The database lane is **ready for integration from the PostgreSQL-owned gate perspective**.

PR #5 must remain **Draft / Open / Unmerged** until the integration coordinator decides sequencing. The broad `PostgreSQL schema validation` workflow remains red only because of the two known integration-only Orders/Settings contracts listed above; it must not be described as globally green.

After this documentation-only handoff commit, freeze `parallel/db-migration-cutover`. Do not add further commits unless a new, explicitly DB-owned failure is discovered and the branch is intentionally reopened for DB work.
