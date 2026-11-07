# FIELD002 — actual Railway deploy provenance vs original Neon staging admission (2026-11-07)

## Scope and rule

**Read-only** independent verification using live connected Railway service inventories, deployments, sanitized deployment-log *codes only*, GitHub source at the actual deployed commit, exact GitHub Actions source SHA, and pinned original Neon branch catalog. No Railway variables were changed, no deployment/redeploy/restart/merge, no original/database/backup writes, no dump or passwords accessed or emitted. **DO NOT count GitHub CI as proof that an old or crashed live Railway runtime accepts RLS.**

Source PR #550 (draft/unmerged), branch `fix/p0-provider-receipt-order-discovery-20261015`, head `72ce9320f7feea315db5bea5438139eab8e44719`.

## Railway deployment and exact deployed-source comparison

Neon is Fawri-Staging project `round-fire-18493605` and original nondefault nonprimary `staging-runtime` branch `br-falling-dust-b1km4gix`; it must not be confused with Railway environments labeled `production` inside *test/staging* Railway projects.

1. **Railway project `fawri-staging`, environment labeled `production`, service `fawri-web`:**
   - Railway project `f1f544d0-19ae-448d-95c3-ea682af98a10`, environment `e3f66140-5fff-472b-ad63-1c16de59a911`, service `8acd3301-0af6-49c0-a457-84a0ed17e18c`.
   - Actual latest deployed source: **`main` commit `d38d29229bed0f9575a98e7026e7819fe363bfd4`**, deployment `11f22954-446b-49ef-adc6-38aca7c08bff`, status **SUCCESS**, dated **2026-10-10T22:22:49Z UTC**. Railway metadata shows no staged changes.
   - Independent GitHub source read at **that deployed commit** confirmed `artifacts/api-server/src/index.ts` does have `assertProductionDatabaseRlsReady`, but **does not have** the newer pre-listener `createPostgresAuthorityReadinessCheck().check()` eight-policy admission; `artifacts/api-server/src/services/productionReleaseReadiness.ts` there **does not have** the FIELD002 legacy/owner-role production denylist. These are source comparisons, not proof of actual runtime paths or tenant leakage.
   - Variable **names** include `DATABASE_URL`, `FAWRI_DEPLOYMENT_MODE`, `FAWRI_EXPECTED_POSTGRES_RUNTIME_ROLE`, `FAWRI_OPERATIONAL_POSTGRES_AUTHORITY`, `NODE_ENV`; Railway connected OAuth `list_variables` returned **`valuesRedacted=true`**. Thus variable values alone cannot attest the actual authenticated user, source branch or configuration values; **the source branch endpoint was subsequently independently correlated by live Railway DNS and Neon endpoint metadata below**, while the login user and secret values remain unverified. Do not guess these values from variable presence, deployment source, or an occasional PostgreSQL connection.
2. **Railway project `fawri-staging`, service `fawri-p0-validation`:**
   - Service `ce509626-b470-4c7f-813e-57324c409311`, same environment. Latest source PR head `72ce9320...`, deployment `de4a0c9d-ef3d-4bb9-bd45-aeae997eb875`, status **CRASHED**. Service inventory reported **no variable names**.
   - Sanitized deployment log diagnostic: `PRODUCTION_RELEASE_CONFIGURATION_INVALID` at `runtime_configuration`. This is fail-closed evidence, not a healthy mounted HTTP tenant test. Do not confuse a CI deployment status with actual deployed admission acceptance.
3. **Railway project `fawri-p0-isolated-validation`, service `fawri-p0-api`:**
   - Project `7361e1f8-a638-411e-8260-2fcfc713060f`, staging environment `7d5b9ed0-3b4c-47ef-aa75-0a3f967f7fdb`, service `830acd44-5631-486e-9d97-1c1ac6ce6935`.
   - Latest source PR head `72ce9320...`, deployment `793a54a9-805a-40f5-96fc-81628b3d16b2`, status **CRASHED**. Declared variables only: `FAWRI_AUTH_SECURITY_SECRET`, `FAWRI_DEPLOYMENT_MODE`, `FAWRI_DISABLE_JOB_WORKERS`, `FAWRI_META_CUTOVER_READY`, `FAWRI_PASSWORD_SALT`; no declared `DATABASE_URL` in service inventory.
   - Sanitized diagnostic `RUNTIME_PROVIDER_INITIALIZATION_FAILED` at `application_import`, with `Application module import failed` reported. **Do not assert root cause solely from missing variable names.** Either way this is not a healthy mounted SQL+HTTP target.

## GitHub regression evidence on exactly this PR head

Latest query of 59 PR-associated workflows for `72ce9320...` returned **57 completed SUCCESS and 2 completed FAILURE**, all completed. Both failures were unrelated *cashier* test groups:
- `Cashier subscription lifecycle`, run `42314465736`.
- `Isolated PostgreSQL engineering audit`, run `42314466019`, failed inside `Cashier licensing, compensation and historical operator proofs`.
- Both failures include the same `cashier-full-lifecycle-postgres.integration.test.ts:399` assertion `false !== true`; an earlier commit `27614b2c...` had the same line/test failure in run `42314087940`. **Do not call all workflows green and do not call this a FIELD002 regression without a demonstrated dependency.**
- Relevant same-SHA workflows **SUCCESS**: `Final quality gates` run `42314466015`, `Observability mounted routes` `42314465971`, `Backup and restore drill` `42314466000`, `Merchant access security` `42314465964`, `Complete migration safety` `42314465561`, `P0 notification privacy HTTP matrix` `42314466217`.

## Original hosted staging current READ-ONLY admission

On **exact original** `br-falling-dust-b1km4gix`, database `neondb`, at this audit:
- Drizzle `28` records, last hash `87a2a16f4278430b770f6e60a4da497ae8cc24cab11aeec6780febe119bd9b3f` (0027).
- Historical `notifications=0`; `audit_events=283`.
- **Two** unsafe creator-default future-function EXECUTE grants; **0/8** remaining critical privacy tables with RLS enabled.
- `fawri_staging_runtime` is still `LOGIN+BYPASSRLS+CREATEROLE+CREATEDB` and has CRUD grants on all **94/94** public tables. `fawri_staging_rls_runtime` is NOLOGIN and also has 94/94 CRUD grants.
- Other clients in `pg_stat_activity` were **0 in the most recent sample**, but earlier samples showed 1 or more; this is **not** a verified maintenance window or proof the old Railway service cannot reconnect.
- **Separate clean isolated clone** `br-polished-mouse-b1proel7` currently has `52` Drizzle migrations, 0 unsafe defaults and **8/8** residual policies. It is not the deployed original staging and cannot be promoted as first-commercial seeded source.
- Previously succeeded *genuine disposable native reset-to-frozen-parent test* `P0-FIELD002-NEON-NATIVE-RESET-TO-FROZEN-PARENT-ACCEPTANCE-20261107.md`: accepted bounded rehearsal, but no evidence of portable/offsite backup or original service failover.

## Next required execution gates — keep each independent

1. **Read-only deployed credential provenance:** conclusively determine actual connection's `session_user`/database branch used by each intended service without exposing any password or full URL; if OAuth redaction prevents this, request a *non-secret* role/branch attestation or use a separately authorized restricted test connection. A variable name is not proof.
2. **Review isolation and change window:** identify legacy `fawri-web` consumer and all workers using original DB; ensure no client reconnects while original ACL, roles or schema are changed. One zero count sample is insufficient.
3. **Original branch authorized change plan:** preserve frozen backup `br-empty-mud-b1it6mg9`; revalidate current source match/recoverability, pin immutable SQL source and 24 SHA-256 ledger records and branch identity, and explicitly obtain **separate original-stage authorization** for minimal default ACL revoke then unchanged 0028–0051 migration (not 0052). Do not reuse a clean-clone authorization.
4. **Restricted identity and service wiring:** separately provision genuinely new tenant and trusted auth login(s) with least privileges and no BYPASSRLS, CREATEROLE, owner reachability or sensitive function authority for the tenant principal; independently prove all eight policy expressions. **Never flip `fawri_staging_rls_runtime` LOGIN on directly** (94/94 CRUD grants). Rollback must not reactivate broad legacy authority.
5. **Actual deployment verification:** deploy the reviewed source to a **distinct** authorized staging service only, with permitted secrets/role/branch, verify healthy HTTP listener, actual `session_user/current_user`, owner/foreign/revoked tenant SQL + mounted HTTP matrix, transaction/pool reuse and no side effects. PR review/CI alone cannot prove this.
6. **Commercial source R2:** prevent first launch from copying historic data-bearing staging/archived/backup sources through *every* actual restore/import/writer route; no fabricated clean-source acceptance from current zero notices. No 0052.
7. Keep PR #550 DRAFT and release **NO-GO** until independently verified.

**FIELD002 OPEN; hosted original migration NOT RUN; deployed runtime role still UNVERIFIED; first commercial deployment NOT AUTHORIZED; 0052 separately BLOCKED.** This is a durable checkpoint of actual service provenance and exact blockers, not a hidden or completed rollout.


## New non-secret live connection correlation — 2026-11-07 (read-only, high significance)

The OAuth redaction of `DATABASE_URL` could be bypassed for **endpoint identity only**, without extracting the variable itself:

1. Retrieved `fawri-web`'s **Railway DNS logs** from the live service in the `fawri-staging` project. The observed hostname was exactly `ep-plain-leaf-b1wtzjr3.c-5.eu-central-1.aws.neon.tech`. In the sampled 251 DNS entries, all hostname entries were for that same endpoint and had `NOERROR`. Separately Railway **network flow** included outbound traffic from the same service to port **5432**, proving real network activity toward PostgreSQL; no query payload or credentials were inspected.
2. Independent Neon `list_branch_computes` directly identified compute **`ep-plain-leaf-b1wtzjr3`**, `read_write`/active, as belonging to **the original branch `br-falling-dust-b1km4gix`**, not default Neon `production`, clean clone, or frozen backup. Other branches reported different compute IDs. Thus the deployed `fawri-web` service **does contact the original staging branch's PostgreSQL endpoint**. This is stronger than inferring a connection merely from a variable *name*.
3. On an independent contemporaneous PostgreSQL `pg_stat_activity` query **pinned to the original branch**, one other client backend was observed `idle` and authenticated as **`fawri_staging_runtime`** (application name unspecified). This is a direct fact about the original-hosted connection. **Do not claim the connection is unequivocally the Railway service's session**: the NAT proxy and dynamic pool activity prevent a cryptographic 1:1 attribution from the available evidence.
4. Later read-only spot-check also found one matching legacy-role session. No other user's credentials or secrets were disclosed. This proves that **a possible old-client reconnection is live right now**; one isolated zero-session observation earlier is not a valid maintenance or isolation gate.

**Updated decision:** Original `staging-runtime` is now positively identified as the endpoint consumed by the actual `fawri-web` deployment, whose pinned deployed source is old `main` SHA `d38d292...` and lacks the reviewed FIELD002 explicit eight-policy/legacy-identity admission. **Do not execute original ACL revocation, 0028–0051 migrations, role flag edits, disable login, terminate sessions, or swap database credentials until a reviewed safe service cutover and reconnection isolation is authorized and demonstrated.** The exact authenticated Railway `DATABASE_URL` login remains unproven by the secret-redacted Railway config (despite the independent observed legacy session). This closes the **live endpoint/consumer discovery** subquestion, *not* the final hosted privacy gate.

**FIELD002 OPEN / original-hosted staging changes NO-GO / PR #550 draft.**


## Clean clone current restricted-login admission, and safe bounded next stage

New read-only independent SQL on surviving isolated `br-polished-mouse-b1proel7` returned **52 Drizzle migrations, zero historical notices, 8/8 critical RLS-enabled tables, zero `field002_%` probe roles, zero restricted LOGIN roles, zero other backend sessions and zero `fawri_security.transaction_scopes` rows**.

**Consequence:** the clean isolated clone cannot yet provide an authentic tenant/auth LOGIN session matrix without provisioning **new segregated credentials and column-limited GRANT authority**. The formerly available `fawri_staging_rls_runtime` is NOLOGIN and has blanket CRUD across all tables; merely changing it to LOGIN is expressly unsafe. The production role denylist and SQL startup guard added at `72ce9320` now prevent that legacy shortcut even if role flags are later altered.

### Proposed isolated-only execution, requiring targeted authorization

The least-risk next acceptance sequence is to keep `fawri-web` and original `staging-runtime` untouched and create **new temporary least-privilege tenant/auth LOGIN roles only inside the already-migrated clean isolated Neon clone**, with fresh credentials handled as secrets (never GitHub text, logs or evidence). Verify exact role identities, no elevated reachable roles, minimum column/table grants, no unsafe SECURITY DEFINER EXECUTE, and 8 exact policy digests. Configure **only one isolated Railway test service** (not `fawri-web`) with that clean clone endpoint and the reviewed PR source after verifying startup guards; require a real healthy listener and mounted SQL/HTTP own/foreign/revoked-session tests. All new test roles/fixtures must be tracked for eventual cleanup. A separate trusted auth connection must not be accidentally reused for tenant runtime.

**Do not carry out this stage without explicit owner approval for isolated DB role creation, credential generation and test-service configuration.** Such approval must not cover original staging or production. Original ACL+0028–0051 rollout, real service credential cutover, portable backup, 0052 and commercial data-source promotion remain separately gated. The evidence here is a readiness plan, not a completed login or HTTP acceptance.
