# FAWRI P0 FIELD002 — Railway ↔ Neon active endpoint correlation (2026-11-04)

## Authority / scope
- **Read-only** connected Railway service/deployment metadata, DNS and network-flow telemetry, and Neon endpoint/branch/role/catalog data; no credentials, IP address list, notification payload, database row ID, merchant data, session token or connection URL copied into this evidence.
- No deployment, service restart, SQL mutation, role change, branch change, original data change or merge. This is an independent hosted **network destination proof**, not authorized same-/foreign-merchant acceptance. Release remains **NO-GO**.
- Project repository: `nora953/fawri-production-source`; working branch `fix/p0-provider-receipt-order-discovery-20261015`, draft PR #550. Prior source code commit `e778a5c5ba8f95ef6b477ae6c11487705bcc1340` has **59/59 GitHub workflow runs successful**, but its code has **not** been deployed in the Railway service inspected below.

## 1. Observed deployed service and branch
- Railway **project** `fawri-staging` `f1f544d0-19ae-448d-95c3-ea682af98a10`, environment named **`production`** `e3f66140-5fff-472b-ad63-1c16de59a911` (the environment label **does not identify Neon branch**).
- Running service **`fawri-web`** `8acd3301-0af6-49c0-a457-84a0ed17e18c`, Railway deployment `11f22954-446b-49ef-adc6-38aca7c08bff`, reported **SUCCESS**, created **2026-10-10T22:22:49.599Z**, source repo same but source branch **`main`**, deployed commit prefix **`d38d29229bed`**. Its healthcheck config is `/ops/readiness`.
- The service advertises environment variable **names** `DATABASE_URL` and `FAWRI_EXPECTED_POSTGRES_RUNTIME_ROLE`, along with authenticated/operational Postgres authority flags. The connected Railway OAuth API deliberately **redacts values**, so neither the exact connection URL username nor configured expected runtime role can be read from variables. No guesses or secret retrieval.
- `fawri-p0-api` in `fawri-p0-isolated-validation/staging` and `fawri-p0-validation` in `fawri-staging/production` have latest deployment state **CRASHED** and no `DATABASE_URL` listed, so they are **not verified accepting staging test targets**. Do not restart/deploy them implicitly.

## 2. Independently correlated target database endpoint
- Railway `fawri-web` DNS telemetry (read-only, bounded sample on **2026-11-04**, observed query times **10:10–10:51 UTC**) contained repeated lookups of:
  `ep-plain-leaf-b1wtzjr3.c-5.eu-central-1.aws.neon.tech`
- Independently queried the **Neon endpoint inventory** for project `Fawri-Staging` / `round-fire-18493605` (PostgreSQL 18). Neon reported that exact **read-write endpoint** `ep-plain-leaf-b1wtzjr3` belongs to Neon branch **`staging-runtime`**, ID **`br-falling-dust-b1km4gix`**, child of the project's default branch `production` / `br-shiny-lab-b1vxj4wn`.
- In a read-only Railway network-flow sample of **251 records**, resolved destination addresses from that DNS record were correlated with observed network egress. **95 flow records** matched an address returned for the Neon endpoint and **destination TCP port 5432**. This is strong **direct network evidence** that `fawri-web` is communicating with PostgreSQL on the original `staging-runtime` endpoint. **95 is a flow-record count, not 95 distinct connections or users**. Raw IPs and host credentials were not saved.
- The isolated test clone is a **different** branch `br-young-hill-b1x9vhlz` / endpoint `ep-soft-wildflower-b1i4j4xu`; the Railway-observed DNS hostname is **not** the clone and **not** the Neon default branch.
- A public request from the separate browsing source to `/ops/readiness` was **not accessible through that tool**. Do **not** infer that the deployed service was available, down, safe, or successful from this failure; no authenticated end-to-end HTTP probe was conducted.

## 3. Actual original staging database role posture — separate evidence
- Original `staging-runtime` read-only `pg_stat_activity` snapshots observed **1–2 other client backend sessions** under login `fawri_staging_runtime` (last sample **2 idle**, no `application_name` tags). This is **not independently attributable** to a particular Railway service/host because database user/value linkage is not exposed by the Railway OAuth variables.
- The `fawri_staging_runtime` role on the original data-bearing Neon branch has `rolcanlogin=true`, **`rolbypassrls=true`, `rolcreaterole=true`**, and `SET` access to a privileged role. The scoped alternative `fawri_staging_rls_runtime` is **NOLOGIN/NOBYPASSRLS/NOCREATEROLE**, with no observed login.
- The original staging branch still has **28 applied Drizzle migration records, 28 notifications, 283 audit rows**. The prior audit showed **all eight residual privacy tables RLS disabled**. The isolated clone has **52 of 53** migrations; last `0052` owner handoff remains **BLOCKED**, while isolated RLS 8/8 and historical data fingerprints match.
- **Inference boundary:** Evidence proves the **service ↔ original Neon branch endpoint** at network level and independently proves a **privileged role is connected to that branch**. It does **not** prove that `fawri-web` uses specifically `fawri_staging_runtime`, that other services do not use it, or that a real merchant can exploit a data leak.

## 4. Historical quota errors — dated, not current status
- Bounded Railway `fawri-web` deployment-log sample on **2026-10-31 at 23:55–23:59 UTC** contained PostgreSQL support lifecycle sweep failures with `Your account or project has exceeded the quota`. These are **historical log messages**, not proof of a current Nov 4 quota outage, and do not by themselves prove the precise failing service/Neon branch issue.
- The inspected log source did **not** return fresh Nov 4 deploy-log entries for a narrower time filter. Therefore **current quota state / deployed readiness cannot be asserted** from these logs.

## 5. Next authorized gate (no remote mutation)
1. **Determine actual deployed DB username and expected-role values from an authorized operator inside Railway**, without transmitting `DATABASE_URL` itself or a password. Compare username **and endpoint hostname** to `fawri_staging_runtime` / original branch. A single redacted name is insufficient if the service uses additional pool/login connections.
2. A controlled, owner-approved rollout plan is needed for old `main` deployment vs validated PR, Neon role hardening, backups, **25** source/host migration gap (24 passed isolated, `0052` owner bootstrap blocked), and reversal/health checks. Do not grant `BYPASSRLS` or `CREATEROLE` to runtime accounts, terminate observed connections, deploy or update the data-bearing original just to pass tests.
3. Execute **real same-merchant allowed / foreign merchant denied / revoked session denied** SQL+HTTP proofs under verified runtime authentication on an isolated/staged environment with two merchants; keep source identity and historical writer provenance (15 missing links) as separate FIELD002 blockers.
4. Maintain parent `P0-RESIDUAL-MERCHANT-PRIVACY-001/http` and FIELD002 **OPEN**, `P0-ACCESS-HOSTED-IDENTITY` partially evidenced but **not fully closed**, original rollout **BLOCKED**, known P0 **29 CLOSED_SOURCE / 7 OPEN / 9 BLOCKED**, overall denominator incomplete and release **NO-GO**.

## Reproducibility without privileged values
- Railway `describe_service` / `list_deployments` for `fawri-web`; `get_logs` with **types `dns` + `network-flow`**, compare `dns[].qname` to `list_postgres_endpoints[].host` from Neon; count outbound flow records for the resolved endpoint IPs and `dstPort=5432`, without publishing the IPs.
- Neon read-only: `list_postgres_endpoints({project_id:'round-fire-18493605'})`, `list_branches`, and `SELECT rolname,rolcanlogin,rolbypassrls,rolcreaterole FROM pg_roles WHERE rolname IN ('fawri_staging_runtime','fawri_staging_rls_runtime')`.
- Railway variable values are redacted on OAuth by design; do **not** claim app username or runtime-role variable contents from name-only inventory.
