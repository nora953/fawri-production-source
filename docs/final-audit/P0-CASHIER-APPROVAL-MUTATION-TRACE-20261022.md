# P0 manager approval mutation authority source review — 2026-10-22

Policy diagnostic executable d051f0c32e29e66ddda60787f6f873c6948a841f is still running. One status inventory observed25/47 SUCCESS,22 pending,0 failures. Native39826479484/job119990994336 is executing migrations/selected tests. No second status read, retry, cancellation or duplicate test run. Last accepted isolated executable645b534 remains47/47+82/82.

During that run, reviewed five exact-source files for the subsequent manager-approval mutation group. [Exact blobs, source facts and next proof matrix](evidence/P0-CASHIER-APPROVAL-MUTATION-TRACE-20261022.json).

| Operation | Existing authority and invariants |
| --- | --- |
| Issue | Trusted auth checks manager role/permission/PIN and policy, validates request binding, inserts approval |
| Consume unused approval | Primary setting lock then approval lock, exact merchant/station/operator/operation/amount/reason/window, scoped staff lock and manager permission/policy/limit, then consumed_at update |
| Exact replay | Binding/window checks precede consumed_at early return; retain intentional idempotence |
| Kind change | Shared merchant advisory lock, setting FOR UPDATE/version, only own pending approval deletion in the same transaction |
| Schema | Tenant foreign keys, distinct operator/approver, positive amount, bounded reason, expiry and consumed-time constraints |

The source raises a separate conditional mutation-integrity question: can a SQL-capable primary LOGIN insert an approval that never passed trusted PIN issuance, or alter immutable fields/consumed_at? RLS/foreign keys restrict tenant and row validity but do not establish that issuance took place. The approval table is not in the auth mutation restriction inventory. Actual forged approval consumption/PIN bypass, HTTP exploit and hosted grants are NOT_PROVEN.

Do not change the consumed replay shortcut alone: it belongs to existing exact-replay behavior. Any eventual restriction must protect row provenance and mutation authority while retaining locks, rollback, concurrent once-only consumption and kind-change atomicity. A blanket transfer of all consume work to a separate auth connection could break the primary transaction and is not justified here.

## Next proof, after current policy result

First classify the existing policy diagnostic's actual marker/summary. Then use owned network-none PostgreSQL/actual LOGINs/two merchants for approval provenance: real auth-issued consume/replay positives; primary synthetic INSERT without issuance; primary immutable binding/consumed-marker changes; actual consumer decisions; cross-tenant denial; unchanged PIN/permissions/manager state; full rollback/cleanup; retained revocation/concurrency/kind-change atomicity. Only a concrete executed gap justifies a narrow locked consumption/invalidation capability design.

This checkpoint is documentation only [skip ci]; no new production code/tests/schema/grants and no native/hosted claim. P0 remains OPEN, release NO-GO, whole-P0 percentage UNMEASURED. GitHub/Actions only; no external connector/hosted change/deploy/main push/merge/credential rotation/P1/P2.
