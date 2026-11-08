# FIELD002 — Original staging portable owner/ACL restore (bounded acceptance)

**Date:** 2026-11-08  
**Source branch:** `fix/p0-provider-receipt-order-discovery-20261015`  
**Exact workflow request SHA:** `ed75c5313bfc7bb2cd8c55abd7c876275dae3096`  
**Original nondefault staging target:** `br-falling-dust-b1km4gix` (never production/default)  
**Workflow:** `.github/workflows/field002-original-staging-readonly-restore.yml` (source reviewed at request SHA)  
**Result:** **BOUNDED PASS: source read-only → disposable local PostgreSQL 18 owner/ACL restore**. Do **not** interpret this as FIELD002 gate closure or an external durable backup.

## Evidence and verification

The owner supplied screenshots of the **second push-triggered workflow run**, clearly showing `Success` for `ci(field002): retry pinned original staging read-only portable restore...` (`ed75c53`, runtime 1m03s); the job `original-readonly-local-restore` is also `Success` (1m00s). Expanded job view shows individual green successful statuses for:

1. Exact push SHA checkout and **strict one-file request**.
2. Exact original staging direct-host credential/source-catalog pin (earlier missing-secret error no longer present).
3. Read-only source preflight, source row checksum, security-catalog pin and portable PostgreSQL 18 archive.
4. Fresh local PostgreSQL18 owner/ACL-preserving archive restore.
5. Full table-row checksum and security-catalog owner/ACL/policy parity verification, plus original source stability recheck.
6. Metadata-only PR recording step, ephemeral dump/connection cleanup and PostgreSQL container teardown.

**Security-critical workflow contract reviewed from exact request SHA:** source identity is pinned to the approved original nondefault Neon direct endpoint, database `neondb`, login `neondb_owner`, and SSL; preflight requires 28 migrations / 0 notifications; source row catalog exactly **95 tables / 437 rows** with separately reviewed SHA-derived digest; five security-catalog digests are pinned before dump; source-before, restored and source-after row and security digests must all match; the job fails on any mismatch. It reports a success marker only after all these conditions. This is stronger than a green summary alone because screenshot shows the invariant-enforcing verification step succeeded.

**Source safety:** The source uses read-only SQL/pg_dump; restore is into a fresh disposable loopback-only PostgreSQL service. No original staging SQL writes/migrations, production/default source work, Railway deployment or PR merge occurred as part of this request. There is no published backup artifact; temporary runner-local files were deleted by the successful cleanup step.

**Evidence limitation:** GitHub connector cannot enumerate push-triggered workflow runs by SHA in this environment. Screenshots directly establish per-step pass but do not expose exact job/run IDs or the printed `FIELD002_ORIGINAL_STAGING_LOCAL_OWNER_ACL_RESTORE_PASS` log line. Therefore **do not claim raw log independent review or exact run ID**. The full job log may be preserved by GitHub Actions retention policy and can be reviewed later, but no rerun is needed absent drift/regression.

## Acceptance boundary and next operational critical path

- **CLOSED (bounded):** missing-secret blocker and original staging **ephemeral source read-only portable data/object-owner/ACL/policy restoration** proof, against pinned original data/security baseline.
- **OPEN:** durable encrypted offsite original backup with verified recovery and global role attributes/memberships; original historical-credential no-reconnect/fenced maintenance proof; permanent separate tenant/auth/operator restricted LOGIN cutover; guarded original migrations 0028–0051 + safe rollback; original hosted tenant SQL/HTTP own/foreign/revoked checks; first-commercial R2 fresh-source/import policy actual release enforcement; remaining R1/R2/R3 notification decisions.
- Existing accepted isolated clone SQL/HTTP 7/7, isolated portable restore and 49/49 control tests are retained, **not rerun**.
- `0052` remains **BLOCKED**; `PR #550` **DRAFT**; **FIELD002 OPEN** and commercial **NO-GO**.

### Links

- [Pinned request commit](https://github.com/nora953/fawri-production-source/commit/ed75c5313bfc7bb2cd8c55abd7c876275dae3096)
- [GitHub Actions workflow](https://github.com/nora953/fawri-production-source/actions/workflows/field002-original-staging-readonly-restore.yml)
- [Prior pending checkpoint](https://github.com/nora953/fawri-production-source/pull/550#issuecomment-6723341820)
