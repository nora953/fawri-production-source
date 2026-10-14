# P0 successful COMMIT / lost caller acknowledgment — 2026-10-14

Continuation of draftPR538, parent30020abf documentation checkpoint; application source73023597 previously181PASS/0FAIL/0SKIP and12/12 observed workflows SUCCESS. No production source change in this acceptance revision.

## New bounded driver-outcome proof (NOT_RUN pending CI)
Existing owned PostgreSQL receipt suite adds four cases: SaaS/cashier × receipt/application COMMIT. A child-only pool client wrapper awaits an actual server COMMIT, reports the completed boundary through IPC, then throws SQLSTATE08006 before the authority can report success. Other queries preserve their native query API. Parent requires nonzero exit, injected boundary marker, failure code, no success message and independently reads the committed state. Admission case has1received/0application/0subscription; application case has1applied/1application/1subscription. Two fresh next-day processes must apply once+duplicate or both duplicate respectively, with original paid_at. Final counts must stay1ofeach. No retry bypass, hosted DB/provider or production fault hook.

This is deterministic fault injection at the driver outcome after real SQL COMMIT, not a network proxy dropping PostgreSQL CommandComplete/ReadyForQuery frames. It demonstrates authority behavior under ambiguous caller outcome; genuine wire fault acceptance remains open under523 along with unmatched orphan durability.

## Cashier historical fixture timing correction
Documentation-head CI30020abf run38524878617/job115722776644 failed only the full-void location compensation case: device credential invalid at operation time. Fixture inserts credential issued_at=PostgreSQL now() (microseconds) and immediately timestamps the sale with Node new Date() (milliseconds), so a sale may fall before its credential within the same millisecond. Validator intentionally requires issued_at<=occurredAt. Fixture now derives operation time from PostgreSQL clock_timestamp(), rounds upward to JS milliseconds, and uses the same clock for sale/return/void. Product authorization, all inventory/location/catalog/version/idempotency assertions and rejection conditions unchanged. Treat the observed failure as preserved; corrected runtime remains NOT_RUN until CI. Do not claim documentation head was fully green.

## Validation and remaining work
Local syntax and API typecheck PASS. Real SQL acceptance pending owned offline CI; local PostgreSQL/Docker unavailable. Remaining unmatched orphan inbox, true transport COMMIT loss, and full downstream signed restricted-role Meta/grant review are not closed.
