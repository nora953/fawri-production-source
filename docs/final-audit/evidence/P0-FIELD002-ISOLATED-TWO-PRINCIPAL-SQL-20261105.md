# FAWRI P0 — FIELD002 isolated two-principal SQL experiment (2026-11-05)

## Authorization, isolation and exact boundary

Owner expressly approved **only** temporary, low-privilege authentication and tenant SQL logins, a second synthetic test merchant, necessary narrowly scoped issuer permissions, testing, and full cleanup on **isolated Neon clone** `br-young-hill-b1x9vhlz` (project `round-fire-18493605`, database `neondb`). Existing original Neon branches, Railway, deployment and merging are excluded. Source checkpoint before execution: PR #550 head `fc7fa682635c92565f7a9ce1e6ea064052ab0021`.

All effects and observations below were executed with explicit clone branch_id. **This is an isolated SQL experiment, not HTTP, full FIELD002/R1/R2/R3 acceptance, or release approval.** No credentials, historical tenant identifiers or raw customer records appear in this report.

## Pre-execution fingerprint and safeguards

Read-only preflight: Drizzle **52** applied; merchants **1**, notifications **28**, audit_events **283**, private issued scopes **0**, new-role names absent, test fixture names absent, other client backends **0**. Notification table foreign keys, account/merchant constraints and defaults were inspected before inserts. The eight exact residual privacy inventory tables already had RLS/policy enabled; earlier ACL repair remained accepted.

## Real actions on clone

1. Created two temporary PostgreSQL **LOGIN** roles, `fawri_field002_tenant_20261105` and `fawri_field002_auth_20261105`, via Neon scoped **read_only** role creation (never default/admin). Immediately removed broad table/sequence grants from both. The tenant role was granted only notification SELECT plus column-level UPDATE(read_at); auth role had **no notification SELECT**, and received schema USAGE plus EXECUTE solely for the non-PUBLIC authentication marker and `fawri_security.issue_scope(name,integer,bigint,text)`. Direct sessions confirmed `session_user=current_user` on both, neither BYPASSRLS nor CREATEROLE, and the intended marker/issuer split.
2. Inserted exactly one marked synthetic `accounts` row, linked `merchants` row, and merchant-audience `notifications` row, each with a unique `FIELD002_ISOLATED_20261105` fixture marker (no external communication or valid account password). Guarded setup transaction verified **2 merchants, 29 notifications, 283 audits, zero issued scopes**, and correct trusted ACL split.
3. **PASS — real unscoped tenant LOGIN:** current_user/session_user direct tenant login, RLS active. `SELECT count(*)` returned **zero** notifications with no issued scope, even though the database contained **29**.
4. **PASS — forged tenant identity refused:** transaction-local `fawri.merchant_id` and legacy `fawri.tenant_id` were set to the synthetic merchant. Both synthetic-own and historical foreign notification SELECTs remained **0**; an attempted `UPDATE read_at` on the synthetic row returned **0 affected**. No persisted data mutation.
5. **PASS — stale trusted issuance rejected:** direct genuine auth LOGIN had the non-PUBLIC auth marker and private issuer EXECUTE. A request to issue scope for an invalid (PID=1, XID=1) target raised SQLSTATE **42501**. The test explicitly caught only that denial and failed if an issuance succeeded.
6. **PASS — revoked auth marker cannot issue:** after atomically removing the marker from **this temporary auth role only**, a further issuer call raised SQLSTATE **42501**, even while its separate issuer EXECUTE remained granted. This tests marker revocation at SQL authority, **not** an application user's HTTP session revocation.
7. **NOT ACCEPTED — actual own/foreign with a valid scope:** attempts to coordinate an open runtime transaction and separately committed auth issuer through this connector did **not** observe a live target backend XID during polling; the runtime read therefore remained unscoped/zero. No valid scope was issued; `fawri_security.transaction_scopes` stayed **0**. Do not relabel this failed test prerequisite as a product defect or successful tenant-positive/foreign-negative proof.
8. **NOT RUN — isolated mounted HTTP** or revoked application-session endpoint. No local GitHub Actions CI was launched and no app/source files were modified in this batch. Existing source/disposable cases (not newly run) include `artifacts/api-server/tests/tenant-transaction-scope-postgres.integration.test.mjs`, `artifacts/api-server/tests/merchant-notification-privacy-http-postgres.integration.test.mjs` and `artifacts/api-server/tests/authentication-operator-pool-postgres.integration.test.mjs`. Their acceptance boundaries remain distinct from hosted evidence.

## Full owned cleanup, independently verified

The clone-only cleanup ran as a guarded atomic SQL transaction: deleted the synthetic notification, merchant and account by exact ID **and fixture marker**; revoked tenant SELECT/column UPDATE, auth issuer EXECUTE/schema USAGE and authentication-marker EXECUTE. Afterward, deleted both newly created PostgreSQL roles through branch-explicit Neon role cleanup. Independent owner-side SELECT confirmed:

| Post-cleanup invariant | Result |
|---|---:|
| Test auth/tenant LOGIN roles remaining | **0** |
| Synthetic fixture account / merchant / notification remaining | **0 / 0 / 0** |
| Private issued scopes | **0** |
| Historical merchants / notifications / audit events | **1 / 28 / 283** |
| Historical channel overrides / deletion requests | **2 / 1** |
| Applied Drizzle migrations | **52** |
| Eight residual tables with RLS and at least one policy | **8/8** |
| Legacy runtime accounts denied both trusted function markers | **2/2** |
| Nonowner default function EXECUTE grants | **0** |

No retained test accounts, custom roles, test fixtures, test grants, migration, or deployment. This report proves enumerated restoration checks and no intentional historical-record mutation; it does not claim a fresh byte-for-byte historical row fingerprint comparison.

## Decision and next exact action

**FIELD002 remains OPEN; 0052 remains BLOCKED; P0 launch NO-GO.** No complete gate closure or new CI acceptance. Known register remains **29 CLOSED_SOURCE / 7 OPEN / 9 BLOCKED**, complete P0 denominator unverified and overall percentage unknown. Notification product conditions R1/R2/R3 remain separate.

For the remaining genuine same-merchant positive / foreign-merchant negative / revoked session HTTP proof, run the **existing** complete PostgreSQL client integration suites on a disposable DB with a runtime that can hold two independent connections concurrently; or use a separately authorized isolated mounted HTTP service. Bind exact code SHA and job result, prove foreign write side effects unchanged, revoke app token, and cleanup. Do **not** weaken trusted issuer or grant the merchant runtime the authentication marker just to force a positive result.

## CI runtime evidence and clone handoff (2026-11-05)

PR head `b2922cfd7f5e3df1accab00fc7336d7da9a8bf87` and the Actions checkout `fdd274e8c832c2c8e6e8afbfa6c584ba96141309` have the identical Git tree `267deaffd4264b2f040c6e8656058a3662ef90ff`. Both recorded jobs completed their cleanup steps. Reused logs, with no repeat of the accepted 59/59 batch:

- [SQL transaction scope job](https://github.com/nora953/fawri-production-source/actions/runs/41993018273/job/127129502515): `tenant-transaction-scope-postgres.integration.test.mjs`, 16 passed, zero failures/skips/cancellations. Four concurrent connections, two reuse rounds, genuine issuer transaction, own CRUD, foreign reads and writes denied and replay rejected.
- [Notification HTTP job](https://github.com/nora953/fawri-production-source/actions/runs/41993018281/job/127129502920): `merchant-notification-privacy-http-postgres.integration.test.mjs`, 11 passed, zero failures/skips/cancellations. With two synthetic merchants and real SQL sessions, own GET/PATCH succeeded, peer/admin PATCH returned 404 and SQL snapshots matched. Revoking a merchant session denied GET/PATCH (401) while the peer retained access. Both suites used disposable PostgreSQL. The HTTP suite mounted the real parent router on loopback.

Clone-only owner SELECT reconfirmed 1 merchant, 28 notifications, 283 audits, 52 migrations, zero scopes and zero harness roles. The security fingerprint query executed on the clone. Operator supplied the Replit TLS probe result. The authenticated clone runner has **not executed**. No product defect shown. No closure count change.

**Operator step.** In Replit use a clean detached worktree at the commit containing this checkpoint. From the existing checkout, feed `scripts/run-field002-replit.sh` from that exact commit to Bash with the same SHA as its argument. The script installs frozen dependencies then reads the direct clone owner's URI silently at the terminal (or uses a dedicated private FAWRI_FIELD002_CLONE_ADMIN_URL). It accepts only the direct FIELD002 clone endpoint. It runs the actual tenant issuer/notification router on loopback with short-lived restricted credentials, then removes owned fixtures/roles and compares baseline fingerprints. Retain the sanitized FIELD002_ACCEPTANCE_RESULT line. If interrupted or cleanup fails, keep the FIELD002_REPORT_FILE path and run ID, stop retries, inspect that run's exact roles/OIDs, fixture IDs and scopes on the clone, remove only verified test objects, and compare the original fingerprints before resuming.

**Outstanding.** R1 external/custom consumer acceptance of response minimization. R2 authenticated clone run and historical provenance/disposition (15 of 28 lack demonstrated source links). R3 expected producer scope: eight identified callers, one direct helper without an identified caller, three legacy read types. No disposition, new caller or retirement selected. FIELD002 OPEN, 0052 BLOCKED, release NO-GO.
