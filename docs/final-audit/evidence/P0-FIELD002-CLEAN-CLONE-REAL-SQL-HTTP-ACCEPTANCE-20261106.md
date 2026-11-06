# FIELD002 — actual isolated Neon SQL + HTTP tenant acceptance PASSED (2026-11-06)

## Exact proof

The product owner explicitly approved temporary synthetic identities/notifications **only** on clean nondefault Neon branch `br-polished-mouse-b1proel7` in project `round-fire-18493605`, database `neondb`. Previously recorded approved request first failed **before connecting** because `FAWRI_FIELD002_CLEAN_CLONE_ADMIN_URL` was empty in GitHub Actions. The owner set the secret privately, and the second single-file owner-approved request was committed as [`777e8d48e3d25ec4fe1e2201efcd869b13628cf1`](https://github.com/nora953/fawri-production-source/commit/777e8d48e3d25ec4fe1e2201efcd869b13628cf1). The workflow on that exact SHA was [FIELD002 clean isolated Neon clone SQL + HTTP acceptance, Actions run #42284922653](https://github.com/nora953/fawri-production-source/actions/runs/42284922653), job `128123149926`.

**Actual GitHub job: SUCCESS.** Exact source checkout, owner authorization, **7/7 source preflight unit tests**, dependency installation, and real hosted SQL/HTTP execution all succeeded. The hosted runner's sanitized result was `status=BOUNDED_SQL_HTTP_PASS`, `cleanup=PASS`, `field002Closed=false`, `release=NO-GO`; no admin connection URL, passwords or customer record values are in this checkpoint.

## Seven actual hosted positive and negative checks

| Hosted check as logged by runner | Result |
| --- | --- |
| `actual_separate_login_admission` — independent least-privilege tenant/auth PostgreSQL LOGINs | PASS |
| `sql_unscoped_denied` — no merchant scope sees zero notifications | PASS |
| `sql_own_allowed_foreign_read_write_denied` — own tenant allowed, peer read/write/insert forbidden | PASS |
| `http_unauthenticated_denied` — unauthenticated mounted notifications endpoints return 401 | PASS |
| `http_both_owners_and_foreign_hint_denial` — both owners see their own rows, foreign hints denied | PASS |
| `http_own_write_replay_peer_unchanged` — own read writes and idempotent replay, peer unchanged | PASS |
| `revoked_session_sql_auth_and_http_denied_peer_allowed` — revoked session refused, peer still works | PASS |

Temporary roles, synthetic merchant accounts and synthetic notifications were created only inside this isolated test and removed by its verified cleanup path. The runner's deterministic full catalog/data/security snapshot digest was **identical before and after**: `b6e777587d358878c7397b840de012cf5764f5be0d4743c0c4aa4367cc269722` (the hash represents runner-local deterministic snapshot, not an external data dump). Cleanup reported **PASS**. Generated temporary credentials expired by design; none were recorded in GitHub.

## Independent, separately sourced post-run Neon SQL

A new read-only query against **explicit branch ID** `br-polished-mouse-b1proel7` after the Actions job completed returned:

| Condition | Independent value |
| --- | --- |
| Applied Drizzle migrations | 52 |
| Last migration SHA-256 | `1773f8314f11c832a1c03453204af2896b204b80695066ebc06cded7b11e62ea` |
| `public.notifications` rows | 0 |
| `public.merchants` rows | 1 |
| `public.audit_events` rows | 283 |
| `fawri_security.transaction_scopes` rows | 0 |
| Leftover ephemeral `field002_[ta]_[a-f0-9]{24}` SQL roles | 0 |
| Other actively querying/transaction-holding clients at observation | 0 |

All tracked baseline values match the pre-run checkpoint. No rollback or manual cleanup was necessary. No original staging, default/production Neon, Railway, application deployment, or 0052 migration was modified.

## Closure scope and remaining gates

**CLOSED SUBCONDITION (actual, not source-only):** clean isolated Neon clone least-privilege SQL and real mounted HTTP own/foreign/unauthenticated/revoked isolation, plus complete cleanup integrity and all seven tests. Previously accepted subconditions also include this branch's 0043–0051 hosted migrations, 52/53 ledger and 8/8 exact policy fingerprints.

**FIELD002 remains OPEN:** an isolated clone is not the original staging environment or commercial deployment. Still need an independently approved controlled original staging RLS/role/ACL rollout and full release acceptance, plus fail-closed R2 commercial import/seed/backup restore and historical archived-source promotion control. The distinct `0052` bootstrap remains BLOCKED. Do not substitute temporary isolated roles for a permanent approved production tenant LOGIN; no merge or production rollout is authorized.

**P0 launch remains NO-GO.** Historical register 29 CLOSED_SOURCE / 7 OPEN / 9 BLOCKED; certified overall percentage not available. PR #550 stays draft/unmerged.
