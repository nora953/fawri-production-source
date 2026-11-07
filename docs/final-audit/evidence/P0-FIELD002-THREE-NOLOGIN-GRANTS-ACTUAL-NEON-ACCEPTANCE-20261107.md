# FIELD002 — 3 independent NOLOGIN principals with real bounded SQL grants on isolated Neon (2026-11-07)

## Scope, authorization and pin

The owner previously approved isolated-only role setup and SQL/HTTP tests. On 2026-11-07 the owner ran a guarded, committed seven-statement transaction in Neon SQL Editor against the verified clean isolated branch, creating 3 inert principals with **NOLOGIN**. Independently verified 3/3 via a pinned Neon database role catalog SELECT.

**THIS CHECKPOINT DESCRIBES AN ACTUAL SUCCEEDED PERMISSION GRANT, not a proposed plan.**

Neon project `round-fire-18493605`; exact **nondefault/nonprimary isolated branch** `br-polished-mouse-b1proel7` (`fawri-field002-clean-staging-rehearsal-20261106`); database `neondb`; current owner `neondb_owner`. **The original `br-falling-dust-b1km4gix`, production `br-shiny-lab-b1vxj4wn`, and frozen recovery `br-empty-mud-b1it6mg9` were not SQL write targets.** No commercial service or customer records were edited.

This acceptance is sourced from the exact reviewed transaction file:
`docs/final-audit/evidence/sql/P0-FIELD002-ISOLATED-THREE-NOLOGIN-ROLE-GRANTS-20261107.sql`.
It contains 15 explicitly named `GRANT` statements, bounded preflight and postflight SQL `DO` guards, transaction atomicity, the exact 52-migration immutable ledger hash, eight critical RLS-enabled table check, zero notifications and transaction-scope rows, and no `ALTER ROLE`, LOGIN/password modification, raw data mutation, or production/other-branch SQL.

## Execution and independently verified proof

1. First source transaction `090221f0d2b457249e8fa8fead08ba6c4726d319` was **rejected with SQLSTATE 42601** in its postflight PL/pgSQL `IF ... CASE` clause; **no grants were committed**, proven by direct subsequent Neon `has_table_privilege` and `has_function_privilege` on all three roles (all false). The preflight separately parsed and succeeded. Replaced the ambiguous CASE construct with explicit per-role Boolean checks and checked postflight directly as a standalone read-only catalog validation; it compiled and emitted the **expected `FIELD002_DIRECT_TABLE_GRANT_SCOPE_REJECTED`** on ungranted roles. Repaired and tested in source commits `3189799dbcf39582914e75bf87371aab261c7583` and `cd0f666cc1e77727ad802bebafe0672bb84e79b1`.
2. On exact reviewed source SHA **`cd0f666cc1e77727ad802bebafe0672bb84e79b1`**, executed its guarded `preflight + 15 GRANT + postflight + final SELECT` inside a **single Neon `run_sql_transaction`** pinned to `br-polished-mouse-b1proel7`. The transaction returned **completed** with 20 statement results and no assertion or parser errors. No password, auth URL, secret rotation, login flip, original branch or Railway environment was involved.
3. Independently read back the *actual hosted catalog after commit* using a separate pinned SQL `SELECT`. Exact roles:
  - `fawri_field002_tenant_probe`: **five** effective public table targets (the exact bounded prior clean-clone plan), private `allows_merchant(text)` function EXECUTE; **no** authentication marker, scope issuer or any operator receipts/directory issuer.
  - `fawri_field002_auth_probe`: **three** effective public table targets (accounts, merchants, account_sessions), `fawri_authentication_runtime()` and `fawri_security.issue_scope(name,integer,bigint,text)` EXECUTE; **no** tenant allows_merchant or operator/directory/receipt issuers.
  - `fawri_field002_operator_probe`: **ZERO** effective public table targets; can execute only the four bounded operator directory/receipt functions (directory audit, read, review, replay authorization); **no** tenant or auth issuer functions.
4. For **all 3**: `rolcanlogin=false`, `rolbypassrls=false`, `rolcreaterole=false`, `rolsuper=false`, `rolinherit=false`, `rolconnlimit=0`, **zero** role memberships, **no public CREATE**, direct admin audit table access **false**, direct private scope table access **false**.
5. Clone data ledger postflight: **52** Drizzle, **0** notifications, **283** audit rows, **0** scope rows, **3** pinned test roles. Original separate read-only branch: **28** Drizzle, **0** notifications, **283** audit rows and **0** of these three roles. These are direct queries, not inferred from SQL exit code.
6. Source regression `scripts/tests/field002-isolated-three-nologin-role-grants.test.mjs` is wired into `.github/workflows/backup-restore-drill.yml` to verify source pin, role and function boundaries, transaction guard order, absence of credentials and login modifications, and exact source grant count. [Backup and restore drill on earlier source `090221f0` passed](https://github.com/nora953/fawri-production-source/actions/runs/42367689226). For final repaired SHA `cd0f666`, assess workflow outcome separately before calling final exact-source CI accepted.

## Strict remaining boundary

**CLOSED SUBCONDITION:** real remote clone existence and **bounded, verified GRANTs** for all three NOLOGIN principals. This is significant incremental progress past the prior SQL-tool credential blocker and is verified twice (transaction and independent catalog).

**OPEN:** these are still NOLOGIN placeholders; they cannot serve actual application credentials, no restricted independent PostgreSQL LOGIN/password was generated, no secrets stored in Railway and no actual hosted service SQL/HTTP proof against these three principals was obtained. Any future secure activation must use separate randomized credentials, short expiry for isolated proof, no owner/legacy or broadly privileged roles and a clearly authorized secret-store/admission workflow. Existing earlier 7/7 clean-clone tenant/auth SQL+HTTP acceptance remains valid separately; do not double-count it as evidence for these precise three principals or full production operator admission.

**Also OPEN:** safe original staging default-function ACL repair, migrations 0028–0051, live `fawri-web` credential/rollout isolation, actual mounted service tenant/foreign/revoked HTTP, archive/import/backup commercial source gates. PR #550 remains DRAFT. **FIELD002 OPEN / 0052 BLOCKED / launch NO-GO.**
