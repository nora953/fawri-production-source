# P0 FIELD003 — historical tenant proof outside 2000-event incident window (RED → GREEN)

**Checkpoint:** 2026-11-10. **Scope:** one bounded authenticated-admin privacy disclosure fixed in source. **Release status:** NO-GO; parent `P0-ACCESS-FULL-ROLE-PRIVACY-MATRIX` OPEN. Source/tests only, no hosted target, provider or commercial data touched.

## Failure actually reproduced

`syncEarlyWarningIncidentHistory` reads the newest `MAX_HISTORY_EVENTS=2000` audit lifecycle rows and `buildHistory` previously derived `merchantLinkedKeys` only from these rows plus current incidents. An older tenant-linked `audit_events` OPENED/RESOLVED can disappear from the recent page once 2000+ newer, unrelated records exist. A later same-key OPENED episode with stale `merchant_id=NULL` and `metadata.scope='system'` can then be classified as public even though an earlier durable SQL audit event proves the incident key is tenant-associated. The incident key itself contains a tenant ID and must not be visible to a `view_logs`-only admin.

**Real RED:** [test-only SHA `6b64c082`](https://github.com/nora953/fawri-production-source/commit/6b64c082c9ce4011752adc258c66293f48a34924), [P0 management PostgreSQL/HTTP #42820001462](https://github.com/nora953/fawri-production-source/actions/runs/42820001462) **COMPLETED FAILURE**. Newly added integration test creates old SQL+JSON linked tenant OPENED/RESOLVED, **2005 newer unrelated RESOLVED events**, then a same-key system-labelled OPENED. It explicitly verifies old linked rows were excluded from the bounded 2000 rows. Through real signed-owner full-app Express HTTP, failure is **actual='system', expected='merchant'**. This is a reproducible synthetic legacy-audit drift, **not a confirmed external breach**. Synthetic rows are cleaned in test `finally`.

## Narrow source fix

[Exact production code SHA `59582ec3`](https://github.com/nora953/fawri-production-source/commit/59582ec32bf2c76e1de52a80accedd6f26ebf910):

- Keeps the original 2000-row display limit and episode rendering. It does **not** expand returned data or permissions.
- After loading the bounded recent window, performs a separate parameterized SQL lookup for **only the distinct keys in that window**, considering **all** durable lifecycle rows for those keys. Uses persisted SQL `merchant_id`, historic JSON `merchant_id`, `merchant_name`, and explicit `scope='merchant'`; any such evidence permanently marks the key merchant-scoped for this read.
- Conservatively unions these historical protected keys with current authoritative merchant incidents and merchant evidence in recent rows. `view_logs`-only response filtering then excludes merchant-linked history even if the newest stored JSON claims system.
- No audit rewriting, entitlements, role escalation, wider RLS grant, financial action, or migration.

**Real GREEN:** [same-commit isolated PostgreSQL + mounted authenticated HTTP #42820124334](https://github.com/nora953/fawri-production-source/actions/runs/42820124334) **COMPLETED SUCCESS**: main `management-full-app-privacy-http-postgres.integration.test.mjs` **83 passed, 0 failed, 0 skipped**, plus neighboring suites **18, 6, 14, 1, 1** all passed. Exact accepted marker: `P0_EARLY_WARNING_TRUNCATED_MERCHANT_HISTORY_BOUNDARY {"realAppHttp":true,"actualPostgres":true,"olderMerchantEvidenceOutside2000":true,"ownerEpisodeClassifiedMerchant":true,"logOnlyKeyDenied":true,"existingRowsUnchanged":true,"hostedAccepted":false}`. The authorized owner still sees a private merchant episode; log-only request via canonical and mixed-case paths cannot see the tenant-bearing key or archived private name. No HTTP-induced changes in the selected audit rows. Synthetic test fixtures are cleaned.

[General final-quality run #42820123897](https://github.com/nora953/fawri-production-source/actions/runs/42820123897) **COMPLETED SUCCESS; all 4/4 jobs**: full-build, full-typecheck, translation-structure-audit and quality-tool-tests, on exact source/test SHA `59582ec3`. Earlier test-only failure is not included as accepted. Earlier accepted suites were not manually repeated outside automatic path-triggered CI.

## Explicit scope and remaining launch blockers

This repairs **one bounded FIELD003 access-control disclosure**, not the complete 8-table/86-field actor/producer/consumer privacy matrix, independently corroborated hosted role/SQL+HTTP, retention/deletion owner signoff, deployment, payments, Meta/KMS, recovery, or device acceptance. The additional all-history attribution read should be load-assessed on a future authorized commercial-sized target; passing isolated PG does not certify hosted performance.

**P0 register remains 29 CLOSED_SOURCE / 7 OPEN / 9 BLOCKED of 45 known source rows (64.4% of known source rows only, NOT total project launch readiness).** Complete P0 inventory remains uncertified. PR #550 **DRAFT**, overall **NO-GO**. Original Neon/Railway, hosted SQL, merchant data, secrets, settlement, deployment and merge were not touched.
