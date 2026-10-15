# P0 operator replay: device/session expiry race — executable acceptance plan

Status: **NOT RUN**. New isolated branch based on accepted PR #546 source `2e3acfea62c6c7e1ad14e2f088e33fb0998ba3d8`. No source implementation or passing-test claim in this document.

## Baseline to preserve
- Existing real authenticated HTTP route, restricted nonowner/NOBYPASSRLS PostgreSQL, owned synthetic provider and actual COMMIT wire proxy from PR #546.
- Existing original receipt/event identity, exact six-fractional-digit paid timestamp, durable audit, once-only entitlement, tenant isolation and session/device authorization.
- Never modify hosted database, actual payment provider, production secrets or `main`.

## New regression scenarios (write test before product repair)
1. Create verified assigned SaaS receipt and existing order with genuine admin device/session and finance permission. Invoke original explicit operator replay route, blocking synthetic provider status *after request leaves application* and before response returns.
2. On separate PostgreSQL connection revoke current device or expire session; COMMIT revocation before releasing provider response. Require original route to fail closed, no entitlement grant and no applied receipt event; preserve attempted audit and redacted response. Check SQL snapshots and provider calls.
3. Re-enable permission with a *new* genuine device/session. Replay exact immutable provider/event/order; require one entitlement, original first verified receipt timestamp and duplicate retry without additional grants. Repeat for cashier authority.
4. Run separate current permission revocation while provider response is blocked. Validate no lock inversion/deadlock (bounded timeout), no stale actor authorization after external I/O.
5. Distinguish *operator session expiry* from *order/payment expiry*. A late provider-confirmed order must remain in reconciliation, not be auto-applied by changing clock alone. Explicit policy and existing authority path must be verified before expected status is asserted.
6. Wrong-merchant receipt/order or changed provider identity must never be resolved by inferred tenant, and must not modify any tenant.
7. Capture exact test name, source SHA, disposable DB guard, workflow run/job, pass/fail/skip, and before/after SQL evidence. Run existing PR546 tests as regression; never count overlapping runs additively.

## Acceptance gate
- **No implementation verified yet.** Do not label PASS or close #523.
- Prove that revocation/expiry is checked after provider I/O under current locked DB authority, not only at initial HTTP authentication.
- Preserve immutable verified receipt independently of entitlement transaction and support idempotent authorized recovery.
- Document any reproduced failure *before* repairing; keep failing evidence.
- Update `docs/final-audit/WORK_HANDOFF.md` and issue #523 with evidence, keeping PR draft and unmerged.
