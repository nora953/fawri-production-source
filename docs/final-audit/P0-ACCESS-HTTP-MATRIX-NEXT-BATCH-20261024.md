# P0 HTTP actor matrix — bounded next-batch checkpoint (2026-10-24)

Status: OPEN / SOURCE INSPECTION ONLY. Release: NO-GO.

## Recovery
Branch: `fix/p0-provider-receipt-order-discovery-20261015`; observed HEAD before this note: `4e2718f1fe8027d4b7109f90ca70dc9193378f8a`; Draft PR #550 open. Authoritative register: `P0-CLOSURE-REGISTER.md` and JSON companion. Accepted executable baseline: `d8001a4163862198f035fb385bbe7738def7b288` (recorded 52/52 CI successes). No new CI run or new closure is claimed here.

## Selected gate
`P0-RESIDUAL-MERCHANT-PRIVACY-001/http`, subordinate to `P0-ACCESS-FULL-ROLE-PRIVACY-MATRIX`. Acceptance requires HTTP owner, assistant and merchant role/session/tenant denial AND authorized positive paths, including alternate routes and revocation, for eight residual tables. Source SQL proof alone is insufficient.

## Verified source trace (bounded)
`artifacts/api-server/tests/residual-business-privacy-rls-postgres.integration.test.mjs` verifies actual restricted primary LOGIN, operational merchant transaction scope and separate trusted authentication transaction. It covers eight tables: audit_events, manual_reply_requests, merchant_admin_notes, merchant_channel_overrides, merchant_deletion_requests, notifications, order_drafts, processed_channel_events. The test is SQL/service level, not the full HTTP actor matrix. Existing Support HTTP proof is recorded in `P0-SUPPORT-PRIVACY-ACCEPTANCE-20261023.md`, limited to Support. No claim that Support covers these eight tables.

## Exact next action
1. Inventory actual mounted HTTP routes and handlers touching these eight tables; trace each through service, authorization middleware, DB pool and transaction authority. Identify read/write/alternate entrypoints and privileged paths.
2. Reconcile existing owner/assistant/merchant HTTP tests by route, action, field, session freshness and tenant. Create only missing negative and positive regression cases with disposable PostgreSQL and real HTTP dispatch where feasible.
3. Run targeted GitHub CI and relevant broader CI for the exact executable SHA. Require actual pass and explicit limitations before updating JSON status. Keep this gate OPEN until complete.

No application code, database, credentials, infrastructure, deployments, main branch or PR merge changed. Hosted verification remains BLOCKED. This checkpoint is a scoped handoff, not acceptance evidence.
