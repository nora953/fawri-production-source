# FIELD002 — hosted portable object-owner and effective ACL restoration PASS (2026-11-08)

## Source, execution and safety target

- **Actual GitHub push-run:** https://github.com/nora953/fawri-production-source/actions/runs/42476639030
- **Run ID:** `42476639030`; **job ID:** `128719357053`; status `completed/success`, all substantive steps `success`. Checked-out SHA `255e77eac18b509b7f341c4189990ac4dcd2acb9`.
- Dedicated exact-one-file authorization commit checks expected `approved_parent_sha` and clean-clone branch `br-polished-mouse-b1proel7`.
- Neon source: nondefault isolated `br-polished-mouse-b1proel7`, direct compute `ep-withered-union-b1jh284c`, database `neondb`, role `neondb_owner`, PostgreSQL 18.6; 52 migrations and zero notifications required. **Source read-only** (SELECT, `pg_dump`); no original/default Neon writes or other target connections.
- Destination: newly created disposable `fawri_field002_portable_restore`, on ephemeral local loopback PostgreSQL 18 container. Temporary role *names* preprovisioned as `NOLOGIN NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE` (including `neon_superuser`, `cloud_admin`, `neon_service` with **no** source administrative powers). No real-role passwords transported.
- Custom `pg_dump` restored with `pg_restore --exit-on-error`, **without `--no-owner` or `--no-privileges`**. Run cleanup and container stop completed. No database dump or credentials uploaded as artifacts.

## Observed hosted proof — PASS

Actual job log emitted:

```text
FIELD002_EXACT_ONE_FILE_OBJECT_ACL_REQUEST_ACCEPTED
FIELD002_HOSTED_CLEAN_CLONE_READONLY_DUMP_CREATED_NO_ARTIFACT
FIELD002_PORTABLE_CLONE_OBJECT_ACL_PASS {"tables":97,"rows":461,"completeTableRowChecksumsMatch":true,"sourceStableBeforeAfter":true,"portableArchiveRestoredToFreshPostgres18":true,"objectOwnerAclPolicyDigestParity":true,"roleGlobalsRestored":false,"externalDurableBackupProven":false,"originalStagingTouched":false,"commercialReleaseAuthorized":false}
FIELD002_EPHEMERAL_FILES_CLEANUP_REQUESTED_NO_DATA_UPLOADED
```

Two independent comparisons before/after source and after local restore:
1. Full row counts and ordered digest on **97/97 tables (461 rows)** match exactly.
2. SELECT-only PostgreSQL security catalog in [the reviewed SQL file](sql/P0-FIELD002-ISOLATED-PORTABLE-OBJECT-ACL-CATALOG-20261108.sql) matches all **5/5** normalized categories:
   - `default_acl`: 4 entries, digest `2c3a21d7a1011f2fbbd745ed7280dfd3`.
   - `policies`: 74 entries, digest `f6ace2b1988536ae51e23938d2e94f7e`.
   - `relations`: 98 entries, digest `da9c9f2bdb4ba57a0cc4ff2b876065d9`.
   - `routines`: 19 entries, digest `c93ee0374b4194dacf05a743e81304dd`.
   - `schemas`: 3 entries, digest `6efdbd38f95288b67c1b1c74fc2e245f`.

Catalog comparison includes object role owners, row-level protection flags, SECURITY DEFINER/STRICT/source digest and search-path configuration, effective explicit/implicit function/table ACL privileges, schema owners and ACLs, default privileges and RLS policy definitions. ACL comparison deliberately normalizes **explicit owner default privileges vs PostgreSQL NULL implicit ACL via `acldefault`**, and removes GRANTOR identity, which can differ across legal restore executors. It does **not** claim byte-identical `pg_proc.proacl` or replication of source runtime privileges.

## Fail-closed diagnostic trail (kept, not concealed)

- First hosted object-owner restore `42475555429` failed: local PostgreSQL lacked Neon system role `neon_superuser`; no original mutation.
- Second run `42475817251` found missing local platform `cloud_admin`; exact source role list reviewed. Added local-only NOLOGIN nonprivileged role placeholders.
- Third run `42476008059` restored all objects successfully but full catalog comparison failed: 5 functions and `fawri_security.transaction_scopes` had NULL vs explicit default ACL representation. No actual privilege weakening was accepted.
- Diagnostic run `42476443580` identified those six objects' **ACL** field only; owner, source body, RLS, policies, schema ACL and default ACL otherwise matched. Diagnostics emitted object names and field names, **never** function bodies or data.
- Final source SQL `8e425db` normalizes `COALESCE(explicit_acl,acldefault(object_kind,owner))`. The actual final hosted run **42476639030** passed all 5 categories, 97 tables and 461 rows.

## Precisely accepted, and remaining hard block

**ACCEPT:** a second bounded **portable owner/object-ACL/policy-preserving** full schema+data restore *of the migrated clean isolated clone*, with verified effective object-level security equivalence on a fresh PostgreSQL 18 environment. This supersedes the earlier data-only portability limitation for this specific clone. It does NOT prove global role flags, global memberships, raw grantor history, or restore of the original staging.

**Still NOT accepted:** safe export and restore of global role flags/memberships (the local roles were deliberately NOLOGIN/no escalation); encrypted durable/offsite backup and provider recovery proof for ORIGINAL ACL0 staging; tested live no-reconnect maintenance; three separate permanent login credentials and exact leased runtime consumers; original 0028–0051 migrations; original hosted SQL+HTTP tenant/auth/access/rollback checks; actual commercial R2 restore/import/first-launch topology. Note: if restoring full global flags later, privileged `cloud_admin`/`neon_superuser` must **not** be transported into commercial runtime identities.

**No original or default Neon write, Railway change, external credential publication, production launch or PR merge. FIELD002 OPEN, PR #550 DRAFT, 0052 BLOCKED, commercial NO-GO.**

## 2026-11-08 follow-up: source drift and privileged runtime login denial

**Current gate:** `P0-ACCESS-HOSTED-ROLLOUT` (BLOCKED) and dependent `P0-RESIDUAL-MERCHANT-PRIVACY-001/http` (OPEN); this is a **bounded source + isolated-hosted prerequisite**, not a new release requirement or parent closure.

**Unmet requirement and reused evidence:** Prior clean clone portable restore #42476639030 already proved 97/97 table rows (461 records) and 5/5 effective object owner/ACL/RLS category parity. However a *faithful copy of changed permissions* could have passed the previous original-vs-restored check without proving that the source permissions were the separately reviewed safe catalog.

**Implemented:**
- `0e81b028`: The pinned isolated portable owner/ACL workflow now compares all **five separately reviewed source count/digest rows** against its source snapshot **before invoking pg_dump**. Mismatch prints only `FIELD002_CLONE_SOURCE_ACL_BASELINE_DRIFT_BLOCKED` and exits. Source values: 4 default ACLs, 74 policies, 98 objects, 19 routines and 3 schemas, all with exact reviewed digest. This is not merely a source/restore equality comparison.
- `d7a60a19` and `1c2487e5`: New continuous negative/static regression asserts exact digests, check-before-dump ordering, SELECT-only catalog, and no archive upload. Verified [Backup and restore drill #42478023877](https://github.com/nora953/fawri-production-source/actions/runs/42478023877) `completed/success`, **46/46** unit safety tests PASS, zero failure.
- [Actual isolated-hosted portable rerun #42478018640](https://github.com/nora953/fawri-production-source/actions/runs/42478018640) on SHA `194397d5fae31c7f4ecb4e24f2cbf90cfe50efe3`: `completed/success`, all job stages SUCCESS. Log explicitly emitted `FIELD002_PORTABLE_CLONE_OBJECT_ACL_PASS` with 97 tables/461 rows, source stable and `objectOwnerAclPolicyDigestParity=true`; temporary dump cleanup SUCCESS. This proves **positive exact source fingerprint admission on the hosted isolated clone**, not a live malicious drift rejection or source lockdown. Still `roleGlobalsRestored=false`, `externalDurableBackupProven=false`, `originalStagingTouched=false` and `commercialReleaseAuthorized=false`.
- `4582b243` + `18fd16af`: Production prelistener login guard now rejects known elevated Neon identities `cloud_admin`, `neon_service`, and PostgreSQL owner/superuser identities `pg_database_owner`, `postgres` for tenant/auth/operator URLs. Previous forbidden staging/owner roles retained. Tests explicitly require unsafe-role denial even when URL and expected login match. Product-side hosted deployment **not** changed; latest whole-PR CI must be verified separately.

**Unchanged OPEN/BLOCKED requirements:** no independently encrypted durable offsite backup and original ACL0 full restore/globals; no exclusive original service no-reconnect proof; no three permanent restricted LOGIN cutover on original; no original 0028–0051 rollout/rollback or exact original SQL+mounted HTTP; no commercial R2 import/recovery enforcement. The separate FIELD002 R1 response compatibility policy, R2 historical record disposition, and R3 notification producer-scope decisions remain unapproved in the authoritative closure register. Do not infer approval from “continue”, do not activate changed notification behavior, and do not issue original write authorization. Field002 and parent remain OPEN/BLOCKED, PR #550 DRAFT, migration 0052 BLOCKED, commercial NO-GO, P0 percentage unverified.
