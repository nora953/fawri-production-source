# Operator verified receipt review UI — 2026-10-14

Stacked on Draft PR540 / source5144e47c81ef234567fd48bcb1fbec9624ceb3c1. The predecessor documentation head has27/27 observed successful CI workflows.

Adds an admin sidebar tab gated by current manage_subscriptions permission, with Arabic/English/Sorani copy. Real device-header/cookie authenticated GET targets the existing audited PostgreSQL read endpoint. Displays only approved response fields, masked reference suffixes and exact UTC timestamp. All verified receipts are listed; no unresolved-only classification or entitlement action is implied.

Loading, empty, denied and unavailable states are distinct. Previous/next use opaque server cursors; refresh resets pagination. Requests abort on tab/account unmount or navigation, late responses cannot restore data, and each request clears previous receipts. Permission removal unmounts the panel. No browser storage, raw server error display, receipt export or subscription mutation.

Local validation: frontend typecheckPASS, production buildPASS (existing sourcemap/chunk-size warnings),4 behavioral HTTP-client testsPASS covering request authority/cache/method/cursor, field allowlist, denied/outage redaction, malformed/oversized pages and cancellation. These are client-function tests, not browser-rendered or full application HTTP acceptance. Existing backend real session/SQL evidence remains separate; no repeated SQL proof credit. CI pending publication.

Manual reconciliation remains OPEN under523. Before a write action exists, require fresh provider confirmation, exact immutable provider/payment/request/order/amount/currency agreement, unambiguous authoritative tenant mapping, current operator permission, durable audit and existing once-only entitlement authority. Never infer ownership or grant from inbox presence or reference suffix alone. No action implementation or hosted provider call in this unit. Ownership/retention and capability deployment review remainOPEN; Meta downstream535 separate.

Next: rendered frontend interaction acceptance, then separately scoped/manual reconciliation authority implementation with synthetic provider fault tests. No merge, deployment, hosted database/grant or real payment.
