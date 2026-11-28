# P0 FIELD002 — actual hosted isolated-clone notification SQL + HTTP acceptance

**Executed:** 2026-11-05 (not a plan or a disposable PostgreSQL substitution).

**Environment:** Fawri-Staging **isolated clone only**, Neon project `round-fire-18493605`, branch `br-young-hill-b1x9vhlz`, database `neondb`; no original Neon/Railway/deploy/merge. Owner had approved scoped temporary credentials/fixtures and cleanup.

## Reproducible source and execution anchors

- Workflow: [FIELD002 isolated clone acceptance — run 42013858636](https://github.com/nora953/fawri-production-source/actions/runs/42013858636), job `127199329181`, **completed/success**.
- Pinned tested source: `4e82daec11044c751ff743c0108d90a73c504a11`, selected by trigger commit `814904f8cbda279d6a96cd362c8e4052d30a9301`. PR #550 stays draft, unmerged.
- Test runner: `artifacts/api-server/scripts/field002-isolated-notification-acceptance.mjs`, using separate unprivileged tenant/auth connections with run-specific temporary logins and a local HTTP server, and a fixed restricted grant plan.
- Before this acceptance, the test script incorrectly fingerprinted PostgreSQL sequence rows with `to_jsonb(t)` (SQLSTATE `42809`). Commit `8b31a94cc08d4b8cbbcd80ecff451aa968276866` fixed sequence fingerprints using explicit `last_value, log_cnt, is_called` state while retaining full-row table hashes. Other preflight failures were traced to an overly strict other-client assertion; commit `4e82daec11044c751ff743c0108d90a73c504a11` retains rejection of active or transactional clients but tolerates idle autocommit sessions. Preflight milestones log **stage names only**, not identities/secrets.

## Executed SQL and HTTP acceptance matrix

Each of the following `FIELD002_CHECK_PASS` markers was emitted in the completed workflow log:

| Case | Result |
|---|---|
| `actual_separate_login_admission` | PASS |
| `sql_unscoped_denied` | PASS |
| `sql_own_allowed_foreign_read_write_denied` | PASS |
| `http_unauthenticated_denied` | PASS |
| `http_both_owners_and_foreign_hint_denial` | PASS |
| `http_own_write_replay_peer_unchanged` | PASS |
| `revoked_session_sql_auth_and_http_denied_peer_allowed` | PASS |

The authenticated SQL test retained the live tenant transaction backend PID/XID, committed an authority binding from a separate safe authentication connection, proved own notification access and foreign read/UPDATE/INSERT denial. The mounted **loopback** HTTP server used the actual notifications router/session middleware and synthetic merchant accounts; it rejected missing/revoked sessions, peer-hint forgery and foreign notification mutation, preserved peer data and kept own notification-read replay stable. This is **hosted database + local mounted HTTP**, not a public live deployment.

Full execution result: `status=BOUNDED_SQL_HTTP_PASS`, `cleanup=PASS`, `field002Closed=false`, `release=NO-GO`.

## Strict cleanup and independent verification

The runner compared a full data/schema/security snapshot before and after owned cleanup (including PostgreSQL sequence state and semantic ACLs):

- `baselineDigest=ad991ac64f6fc851b9d1d52a4f1a3c94932f95521740d54cadd8729637832709`
- `afterDigest=ad991ac64f6fc851b9d1d52a4f1a3c94932f95521740d54cadd8729637832709`

Independent read-only queries after run, **not the runner's own report**, verified exactly:

| Invariant | Post-run |
|---|---:|
| Test LOGIN roles | 0 |
| Test account/merchant/notification fixtures | 0 / 0 / 0 |
| Live private scope rows | 0 |
| Original merchants / notifications / audit_events | 1 / 28 / 283 |
| Merchant channel overrides / deletion requests | 2 / 1 |
| Applied Drizzle migration ledger | 52 |
| Exact eight residual tables with enabled RLS and policy | 8/8 |
| Both trusted functions denied to original runtime roles | 2/2 |

No credentials, secret URL, original merchant ID, fixture passwords or raw records are included here.

## Acceptance decision and remaining work

**Accepted only as a completed bounded hosted notification SQL+loopback-HTTP cell.** This fills the previously unproven authorized-own, foreign-denied and revoked-HTTP test for **notifications**, without expanding the claim to the seven other residual tables or actual original staging/production. Existing disposable-CI eight-table SQL assertions remain separate.

The complete FIELD002 field/producer and history contract is **not closed**:
- R1: approve/enforce complete response-field compatibility policy for nonreserved extension variables and unknown historical types, preserving intended app consumers.
- R2: verify/dispose of alternate writer and stored historical/custom-client notification provenance with an authorized policy; the 28 hosted historical rows and seven types alone do not prove every possible writer.
- R3: product decision on whether direct helper `operational_new_order` becomes an active canonical producer and whether three subscription legacy types remain read-only compatibility.
- Parent residual merchant HTTP privacy requires any still-unproved actor/route/table matrix and deployment readiness; migration 0052 remains blocked. Release **NO-GO**, PR #550 draft/unmerged.

Known canonical P0 register: **29 CLOSED_SOURCE / 7 OPEN / 9 BLOCKED**; full denominator unknown, certified overall percentage unavailable. No claim of new complete P0 closure.
