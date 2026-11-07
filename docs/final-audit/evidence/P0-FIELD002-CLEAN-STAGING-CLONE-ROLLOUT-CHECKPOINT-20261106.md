# FIELD002 — fresh clean staging clone / 0028–0051 migration checkpoint (2026-11-06)

## Authorized target and baseline

The owner approved creating a **new isolated Neon rehearsal clone from the original cleaned staging-runtime branch**, correcting the verified unsafe function default privileges **on the new clone only**, and applying existing source migrations **0028 through 0051**, with explicit exclusion of 0052, original staging, production, Railway deployment and PR merge.

- Project: `round-fire-18493605` (`Fawri-Staging`).
- Parent: `br-falling-dust-b1km4gix` (`staging-runtime`, original, non-default).
- **New clone:** `br-polished-mouse-b1proel7`, `fawri-field002-clean-staging-rehearsal-20261106`, parent verified by Neon metadata; `primary=false`, `default=false`, `ready`.
- Database: explicitly `neondb`, running as existing `neondb_owner`.
- Original before clone: **28** applied Drizzle entries, **0** public notifications, **2** unsafe per-role function default EXECUTE grants; prior eight critical tables RLS/policy **0/8**.
- New clone fresh baseline: same 28 entries and zero notifications; 283 audit events; same two default-grant findings; **zero other client backends** during the security preflight.

## Executed new-clone-only security prerequisite

With explicit branch targeting and a transaction precondition that original-like counts, database/role and the exact two suspect default grants were unchanged, ran a single atomic transaction:

```sql
ALTER DEFAULT PRIVILEGES FOR ROLE neondb_owner IN SCHEMA public
REVOKE EXECUTE ON FUNCTIONS
FROM fawri_staging_rls_runtime, fawri_staging_runtime;
```

Transaction included a strict postcondition requiring zero nonowner creator-default function EXECUTE grants; it returned successfully. Independent SELECT after commit: **0** unsafe default grants, **28** migrations, **0** notifications, intended runtime role still NOLOGIN, existing legacy BYPASSRLS role unchanged. The privilege correction was **not** executed on original staging.

## Migration execution — real bounded commits, not a plan

Used current GitHub source `lib/db/drizzle/meta/_journal.json` and each original committed SQL file, splitting SQL at true statement boundaries (PL/pgSQL dollar bodies preserved). Executed each migration plus exact full-source-text PostgreSQL `sha256(convert_to(source,'UTF8'))` Drizzle ledger insert in its **own transaction**, guarded by expected database, owner, previous ledger count and journal timestamp, unchanged critical seed row counts and zero notifications. Source hashing strategy was previously independently validated: existing 0027 ledger hash matched SHA-256 computed directly from GitHub SQL source bytes.

**Committed successfully, in order:**
- `0028_meta_ingress_bounded_page_resolver`
- `0029_verified_provider_payment_receipts`
- `0030_audited_verified_receipt_reads`
- `0031_audited_receipt_replay_reviews`
- `0032_authorized_receipt_replay_execution`
- `0033_confirmed_provider_order_resolution`
- `0034_cross_authority_payment_identity_guard`
- `0035_order_items_tenant_rls`
- `0036_audited_admin_active_state_guard`
- `0037_audited_admin_transaction_binding`
- `0038_role_bound_admin_directory_issuer`
- `0039_role_bound_authentication_runtime`
- `0040_transaction_scoped_tenant_authority`
- `0041_private_tenant_predicate_cutover`
- `0042_scoped_cashier_approver_lock`

**Executed 15/24 targeted migrations; now 43/53 Drizzle entries.** Every successful transaction contained a guard and a fresh ledger entry. Source `0043_cashier_identity_tenant_rls.sql` was retrieved and reviewed, but the hosted execution tool **refused the intended atomic transaction at its safety checking layer**; this is **not** a PostgreSQL migration execution error or an accepted committed 0043. Execution was stopped without bypassing the refusal, and **0043–0051 were not run**.

An independent post-refusal SELECT on clone confirmed: **43** contiguous migration IDs (last 43, journal timestamp corresponding to 0042), notifications **0**, audits **283**, channel overrides **2**, deletion requests **1**, unsafe function default EXECUTE grants **0**, unauthorized trusted-function EXECUTE grants to the two old roles **0**, other active clients **0**. Critical eight-table RLS+policy completion remains **0/8** at this partial stage; do **not** call the new clone fully privacy-ready.

After 0038/0039, additional direct hosted query confirmed both trusted functions present, **0** unauthorized EXECUTE rights for the legacy runtime roles, **0** PUBLIC execute and **0** unsafe creator-default function grants.

## Parent isolation independently reconfirmed

A subsequent SELECT on the original `br-falling-dust-b1km4gix` still reported exactly **28** migrations, **0** public notifications and **2** pre-existing unsafe function default grants. Therefore no original staging migration or ACL correction occurred; production/default branch was not targeted.

## Exact status / next safe gate

- **Accepted:** new isolated clone created from clean original, two unsafe future-function ACLs removed **on clone only**, migrations 0028–0042 applied and ledgered, trusted-function ACL checks clean, historical fixture still zero, original parent untouched.
- **Open:** 0043–0051 rehearsal remains incomplete due to execution-tool security refusal at 0043. **No workaround or unsafe bypass authorized or attempted.** A trusted, approved execution path and full transaction/ledger safety must be established to resume at exactly 0043, never replay 0028–0042.
- **Still blocked:** migration 0052 function-owner bootstrap. Staging-origin eight-table RLS, role transition, actual deployed connection and commercial restore/import controls are unaccepted. Do not switch runtime role or mark release ready.
- **Canonical P0 unchanged:** FIELD002 OPEN, parent privacy OPEN, 0052 BLOCKED, 29 CLOSED_SOURCE / 7 OPEN / 9 BLOCKED known, global P0 percentage not certified, release **NO-GO**, PR #550 draft/unmerged.

No customer data, raw merchant identifiers, backup, passwords or connection strings were included in this report. No Railway actions, deployment or merge performed.
