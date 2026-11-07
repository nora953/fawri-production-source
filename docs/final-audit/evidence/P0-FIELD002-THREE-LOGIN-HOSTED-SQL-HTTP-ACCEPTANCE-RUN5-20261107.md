# P0 FIELD002 — actual 3-LOGIN hosted clean-clone SQL + HTTP acceptance (2026-11-07)

## Exact execution and outcome

**ACCEPTED subcondition — isolated hosted clean-clone SQL/HTTP test**. This is a real GitHub Actions **push-triggered** hosted run, **not** the 57/59 PR code workflows.

- [Successful push workflow run #5, ID 42396468200](https://github.com/nora953/fawri-production-source/actions/runs/42396468200)
- GitHub job `clean-clone-acceptance`, job ID `128474810745`: **COMPLETED SUCCESS**
- Exact approval-only request SHA `c55639816f46f242f39b19082f9960d152a13c2e`
- Exact reviewed predecessor source SHA `391716a12cecf163c116f1c7c728da1d615f6c6f`
- Neon project `round-fire-18493605`; **isolated-only** branch `br-polished-mouse-b1proel7` (`fawri-field002-clean-staging-rehearsal-20261106`), `neondb`
- Runner report status **`BOUNDED_SQL_HTTP_PASS`**, `cleanup: PASS`, `baselineDigest === afterDigest`: **true**. No leaked temporary roles or mutations to test clone baseline.
- No passwords, connection strings or raw SQL diagnostics included in this file.

### Eight real mounted acceptance checks: 8/8 PASS

1. `actual_separate_login_admission` — real separate tenant/authentication SQL connections and roles.
2. `actual_third_operator_login_and_four_scoped_capabilities` — separate authenticated operator SQL identity; exactly four authorized operator directory/receipt functions; no tenant-table, authentication marker or scope-issuer access.
3. `sql_unscoped_denied` — tenant SQL without trusted scope refused.
4. `sql_own_allowed_foreign_read_write_denied` — own tenant allowed, foreign tenant SQL read/write denied.
5. `http_unauthenticated_denied` — HTTP unauthenticated caller denied.
6. `http_both_owners_and_foreign_hint_denial` — both owners accepted only in their own contexts; foreign hint rejected.
7. `http_own_write_replay_peer_unchanged` — scoped HTTP writes / replay, unrelated tenant unchanged.
8. `revoked_session_sql_auth_and_http_denied_peer_allowed` — revoked session refused in SQL, auth and HTTP; peer remains accepted.

### Proven root cause of failed runs #3 / #4

The historical push workflow [#3](https://github.com/nora953/fawri-production-source/actions/runs/42369679892), [#4](https://github.com/nora953/fawri-production-source/actions/runs/42372082485) failed exactly the `actual_third_operator_login_and_four_scoped_capabilities` check with SQLSTATE **42501** (insufficient privilege). They already showed `actual_separate_login_admission: PASS`, `cleanup: PASS`, and `baselineDigest===afterDigest`: true.

The operator identity is **intentionally denied** `USAGE` on private `fawri_security` schema. A startup/check query resolved `fawri_security.issue_scope(name,integer,bigint,text)` through its qualified **function-signature text**, which needs name resolution under the limited operator. Source fix uses the **read-only exact function OID from `pg_proc` / `pg_namespace`** to test `has_function_privilege(session_user, oid, 'EXECUTE')`, and additionally asserts operator still has **no** private-schema `USAGE`. This changes only the safety proof, **not the operator GRANTs, auth/tenant roles, policy, or actual live DB access**.

Fix commits:
- `42392cc1b0a79162f04d358ceef5943ba9691050`: hosted operator probe OID resolution.
- `8f7796b98618dbec34bc2a2eaea11b6bc8d5887a`: commercial prelistener operator probe OID resolution.
- `06469047bc3555efe41d7f52c713266e02afd301` and `391716a12cecf163c116f1c7c728da1d615f6c6f`: negative source regressions.
- Independent read-only SQL on isolated Neon verified OID privilege query returned `operator_can_issue=false`, `operator_schema_usage=false`; startup query also parsed and executed on clone. Owner was appropriately inadmissible.

### Independent after-run database postflight

Pinned read-only SQL on **isolated** `br-polished-mouse-b1proel7`:
- **52** Drizzle migrations, last hash `1773f8314f11c832a1c03453204af2896b204b80695066ebc06cded7b11e62ea`
- **0** notifications, **0** security transaction scopes, **283** audit events, **1** merchant (unchanged baseline)
- **0** temporary `field002_[tao]_[0-9a-f]{24}` LOGINs
- **3** previously created `fawri_field002_*_probe` persistent **NOLOGIN** safety principals, all still restricted
- **0** busy other PostgreSQL clients at sample

Pinned read-only SQL on the **original staging** `br-falling-dust-b1km4gix`:
- **28** migrations, **0** notifications, **283** audit rows
- **0** cloned FIELD002 test roles
- **0/8** critical residual RLS enabled in original
- **0** other clients at that particular sample, **not** proof that an old reconnecting application has been durably disconnected.

Push workflow's optional automated PR comment step reported `FIELD002_SANITIZED_VERDICT_REPORT_UNAVAILABLE` due to GitHub comment API inability, but the authoritative **job conclusion SUCCESS**, eight runner checks, cleanup and snapshot fingerprints all were independently read directly from its logs and documented here. Absence of automatic PR comment does **not** reduce the actual run verdict.

## Boundary and next actual release gate

**CLOSED:** hosted isolated three independent temporary LOGINs, bounded tenant/auth/operator grants and SQL/HTTP own/foreign/revoked, full automatic cleanup and exact before/after snapshot. Not merely static CI or mock tests.

**NOT CLOSED / NO-GO:**
- The **original** Neon staging branch remains 24 migrations behind the clean clone (0028–0051), still has preapproved default-function EXECUTE ACL corrections and unprotected residual RLS tables.
- Need original live `fawri-web` consumer disconnection/reconnect audit and fresh verified rollback baseline **before** any original ACL/migration writes.
- Need permanent reviewed production-style three independent restricted LOGIN credentials provisioned/stored for each service with real prelistener auth/operator/tenant guards, mounted SQL/HTTP acceptance and rollback.
- Need import/restore/archive source gating proof and independently blocked `0052` trusted owner/bootstrap closure. The earlier no-commercial-merchants status does not authorize unsafe live-branch changes.
- Production/default `br-shiny-lab-b1vxj4wn`, original staging and frozen recovery were **not** mutated in this run; `fawri-web` was not changed by the hosted test.

**PR #550 remains DRAFT/unmerged, FIELD002 OPEN, 0052 BLOCKED, commercial release NO-GO.**
