# FAWRI V1 — missing hosted identity admission / exact next launch blocker

**Checkpoint:** 2026-11-12 (Baghdad). **Gate:** `P0-ACCESS-HOSTED-IDENTITY`. **Status:** BLOCKED / NO-GO. **Authorization:** owner permitted exactly one read-only SQL `SELECT` on the fresh named project; no hosted writes, roles, grants, backups, migration, deployment or production secrets authorized. Work remains on Draft PR #550 and the approved `LAUNCH_PLAN.md`.

## Actual accepted observation — do not repeat unless role state changes

Owner selected the isolated new Neon console project `fawri-production-prep-20261108`, ID `crimson-cherry-65705041`, default `production` branch ID `br-holy-waterfall-b993zglb`, PostgreSQL 18, database `fawri`, owner `fawri_owner`. The new project's primary compute UI shows `ep-polished-poetry-b9jpvn4r`. The old `Fawri-Staging` remains a distinct project; **never inspect or mutate it as the release target**.

The owner ran the approved one-time `SELECT` on `pg_catalog.pg_roles` with exactly three named rows. All three returned `role_exists=false` (and reported security flags false):
- `fawri_restricted_runtime` — missing.
- `fawri_auth_issuer` — missing.
- `fawri_operator_issuer` — missing.

These flags mean **absence**, not secure installed login identities. No tenant data was selected, no SQL was modified, and no role was created. The screenshot of Neon Roles showing only `fawri_owner` is supplementary; the catalog SELECT is the new decisive fact. Accepted negative result: do not loop back to the same role query to reconfirm nothing changed.

The source-only fail-closed parser `scripts/lib/v1-first-merchant-hosted-identity-preflight.mjs` accepts a precisely selected target and **three** complete catalog rows. It distinguishes absent / NOLOGIN / elevated / preliminary safe flags, **never GO** and never interprets SQL as proof of provider project/branch metadata. Its tests use synthetic rows only, no credentials or database service.

## Existing source is not a deployable role solution

- `docs/final-audit/evidence/sql/P0-FT01-NEW-NEON-FOUR-NOLOGIN-ROLE-RESERVATION-HELD-20261109.sql` is a **HELD write script** with four `NOLOGIN` roles and no application grants. Do **not** paste it into SQL Editor. Its completion would **not** make any of the three roles a usable `LOGIN` or close this gate. It includes a fourth cashier retirement writer group because the separate historical 0052 candidate uses one; it is not permission to reactivate cashier/POS in V1.
- `scripts/lib/ft01-clean-bootstrap-source-plan.mjs`, `scripts/lib/ft01-first-commercial-invoker-source-plan.mjs` and `scripts/lib/ft01-first-commercial-disposable-bundle.mjs` pin reviewed candidate migration/journal/role bytes and local PG18 rehearsal. They all **withhold** hosted execution approval. Canonical 0052 cannot be silently substituted or skipped.
- `lib/db/first-commercial/held/0052_cashier_retirement_issuer_grants.sql` is **only a cashier-retirement grant subset**, not complete tenant/auth/operator operational privileges. `0053_receipt_manual_case_operator_grants.sql` is a similarly HELD narrow operator subset. Neither can be promoted as the only role grant file for V1.

## Smallest safe path from this blocker to first merchant

| Order | Deliverable and responsible party | Required evidence to proceed | Current state |
|---|---|---|---|
| 1 | **ENGINEERING / GitHub:** inventory exact app SQL usage for tenant/auth/operator and produce one complete, least-privilege V1 **LOGIN + grants + rollback** source plan, not an open-ended audit. Keep POS UI/API/offline entitlements disabled; ensure the migration chain and held 0052/0053 variants are explicitly dispositioned | Source-pinned, scrutinized, minimum per-role privilege map, no `BYPASSRLS`, no CREATEROLE, no blanket CREATE/ALL grants, no secret strings | **NOT YET READY**; source review and existing tests remain valid |
| 2 | **OWNER / PROVIDER:** separately authorize new-target-only role/migration operations and approve independent backup/restore before the first hosted write. Current Neon Free history retention of 6 h is not an independent recoverable DB+media backup | Explicit approval on exact project+branch+database+approved SHA/operation, retention/recovery destination and rollback point | **NOT AUTHORIZED** |
| 3 | **ENGINEERING after #2:** fail-closed prewrite identity and empty-source/ledger/ownership check on the exact new target; abort on drift. Apply separately approved migration source and roles with bounded privileges and credentials deposited in approved secret storage (not GitHub/docs/chat). `NOLOGIN` reservation by itself must **not** be marked completion | Exact migration hashes, controlled app LOGIN identities distinct from DB owner, least-privilege grants, failure cleanup/rollback without deleting customer records | **NOT EXECUTED** |
| 4 | **ENGINEERING after #3:** independently authenticate **all three actual LOGINs** through the intended direct/pool connection identities; verify `session_user=current_user` as expected, no superuser/BYPASSRLS/CREATEROLE/CREATEDB, only reviewed grants, no cross-role trusted issuer privileges | Same-target actual SQL positive/negative and mounted authenticated HTTP: first merchant succeeds, foreign tenant denied without side effects, revoked sessions rejected, payment receipt controls preserved | **NOT EXECUTED** |
| 5 | **ENGINEERING / OWNER:** prove storage/backup restore, current Meta and real payment reconciliation, first merchant full E2E and owner signoff before any deploy | Separate full `P0` gate acceptance, not only role flags | **NO-GO** |

**Fail-safe stop rules:** no project ID/branch mismatch, no change on `round-fire-18493605`, no import of staging/customer records, no live owner credentials in app runtime, no guessed grants, no `CREATE ROLE` by opening the Console "Add role" UI, no password sent in chat or committed to GitHub, no OAuth scopes granting broad project deletion. A role with `LOGIN` but unsafe privileges is **not** accepted. Likewise, absence of tests on a new source SHA is not a green pass.

**Rollback acceptance to design before any approval:** independently recoverable encrypted restore for the clean new target; record before/after role OIDs/flags, membership/grants, journal, schema hashes and provider endpoint; reverse *only* exact newly owned changes after proving no new merchant or pending financial records are affected. If any new merchant/financial data exists, halt and obtain a separate safe recovery decision—no automatic drop/database reset.

## V1 commercial blocker count (unchanged)

Historical 45 bounded rows: **29 CLOSED_SOURCE / 7 OPEN / 9 BLOCKED**. The **13 V1-essential** rows remain open/blocked; **3 POS rows excluded from selling scope** still require safe isolation evidence and remain historically open/blocked. `completeP0Inventory=false`, `overallPercentage=null`. No new P0 closed by this document or the accepted absence query. PR #550 remains DRAFT, not merged, not deployed.

**Next independent engineering action:** derive the *minimal complete* V1 operational role/GRANT plan from actual existing API code/accepted PG18 CI, and validate only that newly authored plan. Request owner permission for the **specific new Neon write** only after source/backup/rollback are reviewable. Do not re-run accepted source tests or ask for another project selection.
