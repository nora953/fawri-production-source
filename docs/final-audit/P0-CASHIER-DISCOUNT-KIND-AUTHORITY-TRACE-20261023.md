# P0 cashier discount-kind authority source trace — 2026-10-23

Remediation4acf13517337a4038f46f2fb672d76fde42db77a is executing native39869692485/job120140702367. Last observation: install/build PASS, priority migrations/tests in progress. No native acceptance or result marker yet; no retry, cancellation, duplicate source run or passing-suite rerun.

## Independent review while native runs
| Reviewed source | Exact blob |
| --- | --- |
| cashierOperatorDiscountAuthority.ts | f90a44ad8afb3b9b2c813e955f92387b6c4eb77f |
| cashierMerchantDiscountSettingsAuthority.ts | e66e20e81764482cd16c177355c5b69f5ba5f2ce |
| cashier-discount-policy-operations.ts | 6618b8819109ef15c7aad213b057d8e2d621bf5a |
| postgresRuntimeRlsSecurity.ts | f517b7567b6d0649e49aac72396375f24f14ffaa |
| schema/cashier-discount.ts | c6c370e489821ac0405a44fa70792b86e759b60c |

Actual validator reads the merchant-wide kind and selects either fixed amount or percentage policy ceiling. Staff policy writes use trusted auth; kind PUT still uses the primary merchant operational transaction. Settings are RLS-protected but remain outside auth-only mutation admission. Legitimate kind changes serialize on the shared advisory lock, require expected version and invalidate only own pending approvals atomically.

A SQL-capable primary might change kind directly and skip those service invariants. Example hypothesis: enabled policy amount100/percentage10000bps, sale base1000/discount250. Current amount validator should require approval; direct kind change to percentage might make the alternate within-limit path accept without approval. This is a **source hypothesis**, not a runtime finding or hosted/HTTP exposure. Own-tenant settings writes have historically been intentional, so do not ban them without preserving authenticated management and read-lock semantics.

## Next diagnostic after current remediation result
First classify4acf exact native marker, all84 clean summaries, complete workflows/canonical/Foundation/security; preserve failures before correction. Then use existing owned disposable actual primary/auth LOGINs and two merchants:
1. Record original amount-kind missing-approval rejection and both scopes.
2. Attempt raw primary own-kind UPDATE, observe readiness, and invoke the same actual validator with unchanged sale values and requested kind matching the new setting.
3. Measure pending approval invalidation separately; do not call missing invalidation a financial exploit without actual consumer evidence.
4. Restore exact setting/version/PostgreSQL microsecond timestamps via trusted auth; verify both merchants and staff/policy/PIN/session/approval invariants.
5. Prove actual behavior before remediation. Any authority transfer must preserve legitimate merchant kind PUT, cold-start default/version0 behavior, optimistic version checks, advisory/settings/approval/staff locks, pending-only invalidation, rollback/replay and manager issuance.

No code or runtime tests added by this review. No new P0 acceptance. NO-GO, full denominator unmeasured; no hosted changes/deploy/main merge/P1/P2.

