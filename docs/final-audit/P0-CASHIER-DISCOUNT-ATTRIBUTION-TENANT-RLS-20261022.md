# P0 cashier discount and attribution tenant RLS — 2026-10-22

**Executable `bec6e7114be692981df07bc7b25ad456116fda42`: native/runtime verification COMPLETE; overall parent CI conclusions still PENDING.** Isolated39797881955/job119889907395:81/81 invocations exit0/failed0/skipped0/cancelled0/summaryComplete,79 unique files. [Exact saved results](evidence/P0-CASHIER-DISCOUNT-ATTRIBUTION-RESULTS-20261022.json). Start checkpoint60d0a667; prior81aeaf6e47/47+80/80 remains the last globally accepted executable.

Latest observed workflow inventory:44/47 completed SUCCESS, no failures.39797882225 (regional),39797882190 (catalog UI) and39797881966 (security) still report in_progress at run/attempt level, although their latest job resources all report completed/success. Cause of the inconsistent status observations is unknown; do not infer completed parent conclusions or rerun passing jobs. Re-read those three conclusions next. No full acceptance claimed yet.

## Change and source trace

Migration0044 enables established public.fawri_tenant_or_audited_admin(merchant_id) RLS (ALL/USING/WITH CHECK) on merchant_cashier_discount_settings, merchant_cashier_staff_discount_policies, merchant_cashier_discount_override_approvals and cashier_operation_attribution. Schema declarations/linked policies, exact three schema preimages, reviewed SQL SHA-256, deterministic snapshot/journal and production protected-table inventory are committed together and reproduced in CI.

Settings changes and primary approval consumption already use private merchant scope; approval issuance/policy management/hardening/retention use trusted auth LOGIN. Attribution sync persistence, operator sale scope and activity/report reads already bind merchant business transactions. No service logic or transaction/lock order change was needed.0042 staff row lock and discount-kind advisory lock remain. No credential/price/PIN/subscription/grace/offline policy, hosted grant, role or data migration change.

## Executed validation

| Proof | Actual result |
| --- | --- |
| New business RLS suite |8PASS,0FAIL/skip/cancel, parent included; two actual LOGINs/two merchants |
| Catalog/read boundary |Four enabled/active RLS policies; unscoped/forged-GUC rows hidden, both private scopes show only own rows despite contrary GUC, no scope leak |
| Write boundary |Other-merchant UPDATE/DELETE affect0; INSERT/rebind on all4 reject42501; own policy/attribution work rolls back with original rows preserved |
| Auth |Real approval issuance for both merchants; global reads without tenant GUC; revoked marker hides rows and auth authority rejects |
| Real primary consume |Foreign approval denied, rollback restores unused state, two matching concurrent consumes update once, exact replay unchanged, changed reason/window denied; other merchant unchanged |
| Actual kind changes |Rollback restores setting/pending approvals; committed change deletes only own pending approvals, preserves consumed and other merchant, stale version/kind mismatch denied |
| Advisory lock |Primary kind-mutation function blocks independent auth connection with55P03/150ms lock_timeout; release permits auth lock acquisition |
| Drift |Four disabled-RLS cases reject readiness; restoration accepts |
| Full isolated run |81/81 clean invocations,79 unique files; all45 migrations/full committed-schema dump-restore/owned cleanup/Node22 HTTP PASS |
| Existing native/HTTP regression |Identity isolation, credential housekeeping, durable PIN lockout, scoped staff locks, approval rollback/replay/concurrency, real sale/return/void/history/attribution/report flows remain clean in complete isolated run |
| Schema |39797882592/job119889909526 SUCCESS; reviewed SQL/preimages/journal/deterministic snapshot reproduced |
| Foundation/quality |39797882433/job119889909146 final marker/types/build/readiness/native-RLS/integration and final quality39797881969 SUCCESS |
| Security jobs |All4 jobs completed/success; audit119889907757/review119889908090:0 high/0 critical/2 moderate; parent39797881966 conclusion still pending as observed |

Source and actual checkout950170c62cc42c47c7d07a4a96a22e6dd0ecfa7e share tree445ea1378759f227f598547936279977e5c3f1d6. SQL SHA-256abb05446f350956056ddf7c62b36e5f2fbdb8306833ac59a6d5762e3b3e210a1; snapshot5d6a49f45140545737105b1b2aa5ceec6743599c5f79070392fd84e4356de48f.14 source files changed. No observed CI failure or retry in this increment. Local syntax PASS; unattested execution refuses before DB import. Actual runtime assertions use owned network-none PostgreSQL on GitHub Actions. Counts include parents/repeated invocations, not a P0 denominator. Later report/evidence/ledger checkpoints are docs-only[skip ci], not new executable tests.

## Exact continuation and limits

First reconcile run conclusions39797882225/39797882190/39797881966 on this exact source. If successful, update global acceptance/docs only; do not rerun81 passing invocations for metadata. If a real failed step appears, classify its exact evidence before changing source or requesting any bounded retry.

After global acceptance: inventory caller-visible database views/routines and remaining cashier table/column/ownership/TRUNCATE/REFERENCES/TRIGGER privilege reachability under the actual restricted LOGIN. Prove concrete alternate-path denials before remediation. All18 cashier tables in the canonical source snapshot now have RLS enabled, but that is source inventory plus bounded runtime proof, not full cashier authorization or hosted certification. Same-tenant credential/business mutation integrity, alternative access paths, full auth/privacy, offline/grace/sync/retention/provider/storage/full-P0 inventory remain OPEN.

**NO-GO; whole-P0 percentage UNMEASURED.** Hosted runtime BLOCKED_BY_RAILWAY; hosted DB NOT_RUN_SESSION_RESTRICTION_GITHUB_ONLY. GitHub/Actions only; no external-service connector, hosted mutation, deployment, main push, merge, credential rotation or P1/P2.
