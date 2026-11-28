# P0 cashier approval provenance — 2026-10-23

## Confirmed baseline
Executable1716a354153fff43994dc80a33c184f880046dc1 completed47/47 workflows SUCCESS; native39867836738/job120134422668 has84/84 clean invocations (82 unique files), zero failed/skipped/cancelled and complete summaries. Actual checkoutab9913435a238b01d6cca2eac9b02c7d51f0b21b matches source treedd691a701a05f0d8b6c437dad8fd933bd85da4e4. No retry or rerun.

Actual primary SQL LOGIN inserted both pending and pre-consumed approval rows without trusted issuance/PIN. The unchanged actual manual-discount validator accepted both. Primary also rebound an issued approval's operation and reset its consumed marker; the real consumer accepted these. Genuine auth-issued approvals/replay, cross-merchant denial and exact restoration passed. This is a same-tenant SQL authority/provenance defect, **not a demonstrated HTTP/full-sale or hosted exploit**. Diagnostic success is not remediation acceptance. [Immutable observations and all counters](evidence/P0-CASHIER-APPROVAL-PROVENANCE-BASELINE-20261023.json).

## Prepared remediation — native acceptance pending
Add the approval table to the existing authentication mutation admission inventory. The disposable fixture derives its existing restriction from this inventory; trusted auth retains issuance/management. This rejects unsafe direct/PUBLIC/inherited/SET table and column mutation grants; it does not revoke hosted ACLs.

Migration0045 supplies three fixed, STRICT/VOLATILE/SECURITY DEFINER capabilities with pg_catalog search path and private transaction-scope checks:

| Capability | Bound behavior |
| --- | --- |
| lock approval | Exact merchant/id/operation projection; settings then approval row lock |
| consume approval | Independently checks tenant/station/operator/operation/amount/reason/window/kind, preserves exact consumed replay, then current manager status/role/permission/policy/limit and one-way consumed update |
| invalidate pending | Same merchant advisory/settings locks, deletes only that merchant's pending approvals |

All operate on the caller's existing primary transaction. Application binding/window/current-manager checks remain; final SQL independently validates them, preventing raw capability calls from bypassing service checks. No separate auth connection or commerce commit introduced. No primary INSERT/UPDATE/DELETE on approval evidence is required. Public capability EXECUTE is scope-checked; owners must remain unreachable to application roles. New readiness evidence rejects absent/unsafe/non-strict/unexecutable/reachable-owner capabilities. The SQL percentage ceiling uses exact numeric floor rather than overflow-prone multiplication; ordinary amount/percentage service limits remain.

Manual stage/journal/snapshot artifacts prepared using the repository's deterministic manual-stage algorithm; complete canonical reproduction remains CI PENDING. No hosted migration applied. Source now46 migrations; last verified staging remains28 with all28 canonical hashes matching. Hosted missing range becomes0028–0045 if this candidate is accepted; no hosted parity acceptance implied.

## Validation and preservation
Local24/24 source contract assertions PASS; syntax/diff checks PASS. PostgreSQL binaries/dependencies are unavailable locally; no local native/runtime/typecheck/canonical-generation success claimed.

The original diagnostic now requires42501 for forged pending/consumed INSERT, immutable rebinding and consumed reset. Expanded actual-LOGIN tests cover every approval column/table mutation denial, all table/column grants across direct/PUBLIC/inherited/SET/unreachable roles with recovery, direct capability scope/binding/window/kind/current-manager/policy/limit denials and sale rollback, and capability metadata/EXECUTE/existence/strictness. Exact two-merchant snapshots must remain unchanged. Existing native business-RLS/PIN tests retain real auth issue/primary consumption/replay/concurrent-once-only updates/kind invalidation/shared locks; instrumentation follows the new final capability invocation. Older raw SQL policy/approval mutations require explicit ACL denial, not weakened row isolation. Unit fake targets follow the new fixed calls while retaining percentage/amount/window expectations.

**Next exact action:** inspect the containing executable's P0_CASHIER_APPROVAL_PROVENANCE_REMEDIATION marker, every native summary, all workflows and canonical reproduction/Foundation/security. Preserve any failure before focused correction. Do not call the defect closed until that exact source passes. No rerun of accepted bcebf0e or diagnostic1716 for timestamps.

Release **NO-GO**, full P0 denominator still unmeasured. No hosted writes/deploy/restart/ACL/rotation/main push/merge/P1/P2. Settings mutation/alternate-path/full auth/privacy/offline/grace/stock/sync/provider/retention/storage/recovery and complete P0 inventory remain open. Prior source acceptance is bounded; no overall cashier or release certification.
