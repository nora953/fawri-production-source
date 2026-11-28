# FIELD002 — mandatory production runtime role and eight-policy readiness guard (2026-11-06)

## Narrow bug fixed

The existing `assertSafePostgresRuntimeRole` guard checked dangerous PostgreSQL privileges for all environments, but required its **exact 8/8 critical RLS policy fingerprints only when** `FAWRI_EXPECTED_POSTGRES_RUNTIME_ROLE` was populated. A hosting configuration missing this optional field could therefore bypass the eight-policy **readiness check** even with `NODE_ENV=production`. This is an operational fail-open gate and must not be confused with proof of actual SQL disclosure.

On GitHub branch `fix/p0-provider-receipt-order-discovery-20261015`:
- Source fix [`85a9515bd0ce5e1ea6d12c5df727773056a2f42a`](https://github.com/nora953/fawri-production-source/commit/85a9515bd0ce5e1ea6d12c5df727773056a2f42a) makes production-mode readiness require a nonempty explicit `FAWRI_EXPECTED_POSTGRES_RUNTIME_ROLE` and exact 8/8 reviewed policy fingerprints. Without the role, it throws `POSTGRES_RUNTIME_ROLE_CONFIGURATION_REQUIRED`; with an incorrect role it retains `POSTGRES_RUNTIME_ROLE_MISMATCH`; with incomplete/mismatched policies it throws `POSTGRES_RUNTIME_PRIVACY_RLS_NOT_READY`. Existing owner, `BYPASSRLS`, sensitive auth/operator capability, unsafe membership and privilege prohibitions remain untouched.
- Test [`0aa45c428960b74632067bbc90b172a2e9b6ccd4`](https://github.com/nora953/fawri-production-source/commit/0aa45c428960b74632067bbc90b172a2e9b6ccd4) covers production with omitted role, correct role, wrong role and seven-of-eight policies; local `NODE_ENV=test` remains allowed to run isolated synthetic non-commercial fixtures without the hosted policy baseline.
- **This guards a readiness endpoint / admission condition, not a guarantee that arbitrary hosted load balancers stop traffic on failed readiness.** Actual deployed service admission and SQL+HTTP principal acceptance remain separate P0 gates. No hosted deployment is claimed.

## Verified exact-source GitHub CI

The following CI workflow checks completed **SUCCESS** for exact code SHA `0aa45c428960b74632067bbc90b172a2e9b6ccd4`:
- [Final quality gates, run 42251644029](https://github.com/nora953/fawri-production-source/actions/runs/42251644029) — success
- [Observability mounted routes, run 42251643695](https://github.com/nora953/fawri-production-source/actions/runs/42251643695) — success
- [P0 notification privacy HTTP matrix, run 42251643853](https://github.com/nora953/fawri-production-source/actions/runs/42251643853) — success
- [Complete migration safety, run 42251643639](https://github.com/nora953/fawri-production-source/actions/runs/42251643639) — success
- [Backup and restore drill, run 42251643649](https://github.com/nora953/fawri-production-source/actions/runs/42251643649) — success

**No all-green claim.** At this inspection, `Cashier native IndexedDB engineering audit` and `Cashier subscription lifecycle` failed at the same SHA; both are tracked outside this FIELD002 readiness fix. Additional workflows may still be in progress at this checkpoint.

## Hosted disposition and remaining blockers

The original non-default `staging-runtime` branch `br-falling-dust-b1km4gix` remains **28/53 Drizzle**, **0/8** reviewed critical policy fingerprints and **0** experimental notifications. New isolated clean clone `br-polished-mouse-b1proel7` remains **43/53**, after successfully applying 0028–0042 with fixed function default ACLs only on that clone; 0043 was **refused by Neon execution-tool safety checks**. Historical isolated `br-young-hill-b1x9vhlz` previously attained **52/53** and **8/8** but cannot substitute for clean-clone or original-hosted rollout. This source-only change executed **no new Neon SQL writes**, migration, role change, restore, deployment or merge. No attempt to circumvent the 0043 tool refusal.

Commercial restore/import/seed source exclusion and mandatory promotion checks are still not deployed. Migration 0052 owner/membership issue remains BLOCKED. Current strict closure: FIELD002 **OPEN**, parent full-role privacy matrix **OPEN**, 0052 **BLOCKED**, P0 release **NO-GO**, historically counted 29 CLOSED_SOURCE / 7 OPEN / 9 BLOCKED; **do not invent an overall P0 percentage or assert formal section closure**.
