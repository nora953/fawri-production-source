# P0 RESIDUAL-FIELD-003 — historical incident audit SQL merchant scope cannot be forged as public

**Date:** 2026-11-10. **Status:** one bounded field/actor disclosure fixed and accepted with **actual Express HTTP + real disposable PostgreSQL**. Parent `P0-ACCESS-FULL-ROLE-PRIVACY-MATRIX` remains OPEN, original hosted merchant identity/retention policy and commercial release remain NO-GO. Exact tested source HEAD: [`80d242010c65640c841dec5768c2cadbd25baa96`](https://github.com/nora953/fawri-production-source/commit/80d242010c65640c841dec5768c2cadbd25baa96).

## Actual source disclosure gap

`artifacts/api-server/src/services/earlyWarningIncidentHistory.ts` previously read only `entity_id, action_type, metadata, created_at` from the durable `audit_events` ledger, then used `metadata.scope === 'merchant'` alone to classify the returned `incident_history`. But `audit_events.merchant_id` is a distinct, more authoritative SQL field. Older/malformed records can contain **merchant-linked SQL row** + `metadata.scope='system'` (or merchant metadata with `scope='system'`). Then `/api/auth/admin/early-warning` correctly filtered only `scope='merchant'` for an assistant with `view_logs` but **without `view_merchants`**; a falsely system-labeled historical event could cross the permission boundary. An incident key can itself contain a merchant ID. The original log-only/authorized-positive HTTP tests used consistently labeled source records and did not exercise the mismatched SQL/JSON state. This is a **demonstrable synthetic historical inconsistency**, not evidence that an external party could write arbitrary audit events or of a confirmed commercial breach.

[Source fix `145ac64e`](https://github.com/nora953/fawri-production-source/commit/145ac64e8993d971d3b2157d9ff44691104ecfd4) keeps the same route/admin role permissions and returned field structure but:
- Includes durable `audit_events.merchant_id` in latest/history SQL reads.
- Classifies history as merchant-specific whenever **persisted SQL merchant link OR JSON merchant ID/name OR explicit merchant scope** exists. An explicit SQL link overrides disagreeing JSON merchant attribution.
- If *any* OPENED/RESOLVED event with the same historic incident key shows a merchant link, classifies the whole episode as merchant-scoped before sending the HTTP response, even where the older OPENED metadata was incomplete.
- Keeps system-only history and aggregate observability visible to log-only admins, and retains owner/authorized merchant-health access. Does not change original rows, rewrite an audit hash, delete historical data, alter SQL RLS or mint new privileges.

## Real SQL + mounted full-app HTTP proof

[Exact narrow management privacy workflow **#42777515062**](https://github.com/nora953/fawri-production-source/actions/runs/42777515062) **COMPLETED SUCCESS** against real source and independently authenticated disposable PG16: `management-full-app-privacy-http-postgres.integration.test.mjs` **81 passed / 0 failed / 0 skipped** plus five neighboring existing suites (18, 6, 14, 1, 1 passes respectively; 0 failures). The new case exercises a genuine Express request to `/api/auth/admin/early-warning?window=1h` with real signed session cookies and stored PostgreSQL audit_events:

1. An OPENED row with actual `audit_events.merchant_id=A` but JSON `scope='system'` and no JSON merchant link.
2. An OPENED row with SQL `merchant_id=NULL` but historical JSON `scope='system'` and `merchant_id=B`/private merchant name.
3. An OPENED row with missing SQL/JSON link followed by a RESOLVED row carrying SQL `merchant_id=A`, both JSON shapes falsely system-labelled.

For each, an authorized owner with `view_merchants` still sees the real history as `scope='merchant'`. An assistant with **only `view_logs`** cannot read the merchant identity-bearing incident keys or private merchant name through canonical or mixed-case/forged-query HTTP paths, but still receives the legitimate system history. Repeated log-only reads leave the durable ledger snapshot unchanged. Exact log:

`P0_EARLY_WARNING_HISTORIC_SCOPE_DRIFT {"realAppHttp":true,"actualPostgres":true,"persistedMerchantLinkWins":true,"nestedJsonMerchantLinkWins":true,"resolutionLinkProtectsEarlierOpen":true,"viewLogsOnlyCannotSeeMerchantKeys":true,"ownerHistoryRetained":true,"originalRowsUnchanged":true,"hostedAccepted":false}`.

[General full quality run **#42777515864**](https://github.com/nora953/fawri-production-source/actions/runs/42777515864) **4/4 COMPLETED SUCCESS** (full-build, full-typecheck, translation-structure-audit, quality-tool-tests).

## Boundaries and remaining P0 evidence

- The inconsistent records are **privileged synthetic test fixtures**, not recovered real customer audit history. We did not reclassify historic production rows, scan tenant payloads, use a hosted LOGIN or change commercial database/account state.
- Another malformed historic row with **no** SQL or metadata merchant evidence but an ID containing tenant data is outside the verifiable scope; the fix conservatively protects rows with a SQL link or any explicit merchant signal.
- The full **8-table / 86-column** actor, producer/consumer and hosted restricted LOGIN field matrix is **not** thereby accepted. `RESIDUAL-FIELD-003` has one new bounded SQL/HTTP acceptance cell; parent `P0-ACCESS-FULL-ROLE-PRIVACY-MATRIX` remains OPEN. Original retention/deletion purpose/duration/reader approvals and hosted PostgreSQL18 rollout remain pending.
- Source P0 register remains **29 CLOSED_SOURCE / 7 OPEN / 9 BLOCKED of 45 known rows**: 64.4% is known **source-row** coverage only, not actual overall launch readiness; complete inventory=false. Draft PR #550 stays unmerged, no deploy or original Neon/Railway changes, release NO-GO.
- This report is in a **following docs-only commit**, distinct from the immutable tested source SHA. The doc commit's own CI must be observed independently before calling the doc HEAD globally green.
