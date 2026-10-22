# P0 private tenant predicate: native validation — 2026-10-22

**Release: NO-GO. Whole-P0 completion percentage: unmeasured.**

## Saved implementation and verified native behavior

Executable `43065bda4b032244016d0fc78823f5579b01deca`, source tree `b5f8bfa86d716ce62098d057bd8207a02dc0016d`, introduces canonical migration0041 and removes all six transitional production tenant GUC writes. The public RLS predicate now delegates tenant authority to the committed private scope tied to actual LOGIN/backend/full transaction ID/merchant/expiry. Authentication and audited operator branches are retained verbatim. No runtime issuer grants, hosted writes or deployment were added.

[Isolated run39713145055](https://github.com/nora953/fawri-production-source/actions/runs/39713145055), job119608939313 completed **SUCCESS:75/75 invocations exit0/fail0/skip0/cancel0/summaryComplete**. Receipt executor15, tenant scope protocol16, admin audit9, central merchant6, and all other actual invocation counters are in [the native evidence](evidence/P0-PRIVATE-PREDICATE-NATIVE-VALIDATION-20261022.json). Counts include parents and repeated runtime invocations; they do not measure unique P0 completion.

Actual PR checkout `b19291f158a231ad87ddfd9c468c3e4d14c97263` has the exact source tree above. All42 committed migrations passed. Full dump/restore seed and verify fingerprint both equal `2baa42c9264b13141566b754de96010528e1fc8330e8885126cd93eb05afe960`;95 tables,46 policies and12 public functions preserved. Canonical migration generator/schema validation, full build and typecheck results must be read with exact workflow statuses in the evidence.

The former successful raw-GUC tenant forgery now yields no unauthorized rows through canonical public RLS. Positive own-merchant CRUD/reads, auth/admin journeys, subscription/cashier/billing, receipt provider races, original grant/admission/COMMIT rollback and exactly-once recovery, wire-loss, knowledge, Meta, retention and Node22 journeys retain their assertions. Knowledge fixture no longer replaces public policies; dump/restore and legacy edge fixtures use actual tenant/auth LOGINs.

## Current complete CI outcome

Exact-source workflows ended39 SUCCESS/7 FAILURE. Six workflows failed HTTP503 fetching pnpm before code execution after their bounded retry; the seventh is security, whose dependency-audit/review jobs failed closed without vulnerability counts. None remain running. Full build/typecheck and canonical schema/generator validation succeeded. No further retries were queued.

## Failed attempts retained and bounded retries

First executable365e7473 had41/46 successful workflows and73/75 clean isolated invocations. Second9cbfb3b0 had43/46 and74/75. Their exact evidence remains in P0-PRIVATE-PREDICATE-ATTEMPT-20261022.json and P0-PRIVATE-PREDICATE-SECOND-ATTEMPT-20261022.json. No failed attempt is called accepted.

Receipt fault injection originally matched a removed GUC. The first correction called the private predicate directly from a deferred invoker trigger, but the executor intentionally has no private-schema privileges; it aborted before the intended durable phase. The final fixture uses the canonical public predicate without new grants. This executor has neither auth nor directory capability, so only its issued scope selects the later phase. Original no-event/no-application/durable-event/once-only assertions now all pass.

Several current-source CI jobs failed before code execution while fetching pnpm10.26.1 from registry.npmjs.org (HTTP503), including after one bounded retry. Dependency auditing also previously failed closed without vulnerability counts. No unavailable dependency scan is represented as clean; see exact current run states and retained failures in the evidence. Stop repeating these infrastructure attempts indefinitely. The75 clean native invocations are accepted at their exact scope; **full46-workflow acceptance is not claimed**. Last previous full acceptance remains c60914b8; it does not cover0041.

## Next bounded batch and release limits

1. Fetch live audit HEAD. Read this checkpoint and the exact current43065bda workflow states; retry only failed infrastructure jobs when npm is available. Inspect actual dependency advisory counts and require all necessary gates before full-source acceptance. Keep this75-invocation proof unless source changes require rerunning it.
2. Refresh read-only Neon/Railway branch/deployment/runtime identity evidence; never print credential values. Last hosted evidence is from2026-10-21, not a fresh inspection:28 migrations, missing private scope schema/resolver, unsafe candidate role attributes/non-RLS grants and old main deployment. Source now has42 migrations. No hosted tenant isolation is certified by this isolated result.
3. Reconcile remaining auth/privacy/cashier credentials and sessions/offline stock and sync/retention/provider/storage/owner-ACL-pooler gates and the complete P0 requirement/proof denominator. Historical85% is unverified. No new remaining-hours guarantee is inferred.

No main push/merge, Neon write/grant/migration, Railway deploy or live provider/storage operation occurred. Work was saved after each executable/failed-run review; final containing checkpoint is documentation/evidence only and must not be described as a new executable test run.
