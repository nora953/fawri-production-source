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


## Recovered live-path inventory — 2026-10-24 (bounded source trace)

Recovered HEAD607e6b8e; executable management HTTP candidate52d09134 and fixture correction7c2f5ccd. Gate remains OPEN. This is a source map, not a completed exhaustive route/field inventory.

| Residual table | Mounted production path / actual authority | New evidence / remaining gap |
| --- | --- | --- |
| merchant_admin_notes | app.ts `/api/auth` → auth-security.ts → auth-merchant-management-postgres-routes.ts GET/PUT `/merchants/:id/note`; owner import POST `/admin/local-data-migration`; postgresMerchantManagementAuthority authentication pool/transaction | New actual-router HTTP fixture checks owner/granted/ungranted assistant, merchant/anonymous, note peer preservation, device/origin, permissions removed in SQL and revoked session. Owner successful import and full parent-app ordering remain outside this test. |
| merchant_channel_overrides | Same mounted management router: GET `/admin/channels`, PATCH `/merchants/:id/channels/:platform`; owner import; trusted authentication authority | New actual-router read/write/peer/role matrix; successful owner import and extra platforms still unaccepted here. |
| merchant_deletion_requests | Same router GET `/admin/deletion-requests`, POST `/merchants/:id/deletion-requests`, POST `/admin/deletion-requests/:requestId/reject`, POST `/merchants/:id/delete`; trusted tenant authentication transaction | New denial/read/owner rejection/peer fixture; complete deletion and policy acceptance remain separate. Existing seq306 real HTTP lifecycle evidence retained, not rerun merely for inventory. |
| audit_events | Management GET/POST `/admin/logs` plus writes from auth/device/OTP, cashier, subscription/payment, Knowledge, Support, emergency and early-warning paths | New management log read/append plus denied-role tests cover only one projection. Full field-level reconciliation across every listed subsystem remains OPEN. |
| notifications | app.ts `/api/auth` → auth-security.ts (PostgreSQL notification router before legacy) → merchant-notifications-pg.ts GET `/notifications`, PATCH `/notifications/:id/read`; postgresMerchantNotificationAuthority uses withMerchantOperationalTransaction | Separate HTTP test prepared for own/foreign/admin audience, expired/read filters, replay, role/device and revoked session. Support notification evidence does not substitute for this full audience check. Other admin/support/realtime consumers still require reconciliation. |
| manual_reply_requests | app.ts `/api` → conversation-operations.ts list/detail/takeover/return/messages/correction; postgresManualConversationAuthority uses withMerchantOperationalTransaction | Private request status participates in return/replay/recovery. Full actor/failure/recovery HTTP matrix still missing; raw private request hash must not be equated with projected conversation fields. Meta transport remains disabled; use no actual provider. |
| order_drafts | No direct active SQL reader/writer found beyond tenant purge in postgresMerchantManagementAuthority; legacy indexModulePart3 uses a separate in-memory orderDraftsByConversation map | A whole-repository source search excluding historical migrations/tests finds schema/readiness/migration and purge references. This bounded absence is not runtime proof. `/bot/debug` is guarded410 in required PostgreSQL mode by legacyBotDebugRouteGuard.ts; do not repair an inactive SQL draft path as if it were production. Reconcile actual active order pipeline and lifecycle deletion. |
| processed_channel_events | No direct active SQL consumer found beyond purge; transitional migration mapping is separate from current durable Meta queue | Source absence only, not acceptance of every webhook/provider path. Retain signed ingress/queue/worker existing evidence; reconcile semantics with active durable job/Meta identity before defining missing HTTP cases. |

All SQL source proofs remain bounded CLOSED_SOURCE; the eight-table HTTP row and complete role/privacy inventory remain OPEN. No new application policy, production SQL, credentials, hosted interaction, deployment, merge or P1/P2 work.
