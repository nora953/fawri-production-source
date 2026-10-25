## Payment-conflict caller runtime update — 2026-10-25

Internal verified-payment conflict authority now has bounded caller→SQL notice→authenticated actual app→actual frontend validator acceptance on92507e7a:4newfunctional/5TAP,notification lane33TAP,broader715TAP,56/56CI SUCCESS. [Evidence](evidence/P0-PAYMENT-CONFLICT-NOTIFICATION-CALLER-20261025.json). Includes two merchants, denied invalid inputs, exact fields, replay and recovery after scoped notice-write failure following payment commit. Seeded paid state/synthetic authenticity flag do not accept cryptographic ingress, merchant-confirmation, crash or browser rendering. FIELD002 remains OPEN; next actual Meta customer-message caller round trip, reusing existing identity-denial proof.

---

## Optional branch runtime update — 2026-10-25

Omitted/blank conversation/provider fields, default service clock and order/conversations fallback URLs for new-order/payment-conflict/knowledge-gap are now bounded-runtime accepted onb0417241. Two new functional cases; suite8TAP/lane28TAP,broader715TAP,56/56CI SUCCESS. [Evidence](evidence/P0-OPERATIONAL-NOTIFICATION-OPTIONAL-RUNTIME-20261025.json). Next: actual payment-conflict caller through app/frontend, reusing accepted payment and Meta identity regression evidence. FIELD002 remains OPEN; no caller-wide/concurrency/historical/other-template acceptance.

---

## Bounded runtime update — 2026-10-25

Four operational present-option producer round trips are now runtime accepted on04b7fa85: five new functional cases/sixTAP; notification lane26TAP, broader715TAP and56/56CI SUCCESS. See [runtime evidence](evidence/P0-OPERATIONAL-NOTIFICATION-FIELD-RUNTIME-20261025.json). Exact SQL→actual app→actual frontend validator, two merchants and sequential read/producer replay passed. FIELD002 remains OPEN; upstream callers, optional-absent/fallback variants, concurrency, other templates and historical/legacy provenance remain pending. Static map below retains its original source-only provenance and limitations; it is not a current claim that no bounded runtime evidence exists.

---

# Notification producer-to-client field map — 2026-10-25

**RESIDUAL-FIELD-002 remains OPEN.** Static source provenance map only; no new runtime or per-field privacy acceptance. Source64f61f44; accepted executablebd3c518e unchanged.

The current frontend recognizes12types. Nine literal canonical SQL template candidates are reviewed here; three additional type definitions appear in legacy AuthDb notification helpers. This is not proof of a missing feature or a complete producer call graph.

| Type | Reviewed storage/template | Required variable keys | Optional variable keys |
| --- | --- | --- | --- |
| subscription_expiry_reminder | REVIEWED_SQL_TEMPLATE_CANDIDATE | plan_name, expires_at, days_remaining |  |
| subscription_expired | REVIEWED_SQL_TEMPLATE_CANDIDATE | plan_name, expired_at, addon_replies_remaining |  |
| addon_expiry_reminder | REVIEWED_SQL_TEMPLATE_CANDIDATE | addon_batch_id, source, remaining_replies, expires_at, days_remaining |  |
| operational_new_order | REVIEWED_SQL_TEMPLATE_CANDIDATE | order_id, action_url | conversation_id |
| operational_payment_conflict | REVIEWED_SQL_TEMPLATE_CANDIDATE | order_id, action_url | conversation_id, provider |
| operational_knowledge_gap | REVIEWED_SQL_TEMPLATE_CANDIDATE | training_request_id, action_url | conversation_id |
| operational_customer_message | REVIEWED_SQL_TEMPLATE_CANDIDATE | conversation_id, action_url |  |
| inspection_session_request | REVIEWED_SQL_TEMPLATE_CANDIDATE | ticket_id, inspection_request_id, ticket_subject, admin_name, mode, request_expires_at, action_url |  |
| support_reply_reminder | REVIEWED_SQL_TEMPLATE_CANDIDATE | ticket_id, ticket_subject, action_url |  |
| subscription_balance_purchase | LEGACY_AUTHDB_DEFINITION_ONLY_IN_REVIEWED_SOURCE | purchased_replies, emergency_debt_paid, addon_replies_added, emergency_debt_remaining, base_replies_remaining, emergency_replies_remaining, addon_replies_remaining, total_replies_available | addon_batch_id, addon_batch_expires_at |
| subscription_plan_event | LEGACY_AUTHDB_DEFINITION_ONLY_IN_REVIEWED_SOURCE | operation, plan_name, start_date, expires_at, emergency_debt_paid, emergency_debt_remaining, base_replies_remaining, addon_replies_remaining, total_replies_available | previous_plan_name |
| subscription_emergency_activated | LEGACY_AUTHDB_DEFINITION_ONLY_IN_REVIEWED_SOURCE | addon_batch_id, emergency_replies_added, emergency_debt, expires_at |  |

## Boundary observations

- The API mapper puts id/type before variables spread and timestamps afterward. Reviewed literal variable key sets contain no reserved id/type/created_at/read_at collision. Generic stored JSON is not filtered per notification type.
- The frontend validates required type-specific shape and safe local action URLs, then returns original response records. It is a shape validator, not a privacy sanitizer or unknown-key allowlist.
- Internal producer parameters can carry merchant/customer/ticket values, but fixed literal keys differ from arbitrary user-controlled key names. Actual caller identity/ownership and historical rows remain unverified in this map.
- The older SQL inspection helper in postgresSupportAuthority.ts differs from the current canonical Support inspection path. Do not label a helper or historical row safe/unsafe without tracing reachability.
- Existing client mocks, synthetic HTTP rows and JSON-store operational tests are not actual SQL-producer-to-client acceptance.

## Reviewed source anchors

- subscription_expiry_reminder: `artifacts/api-server/src/services/postgresMerchantNotificationAuthority.ts:151` / `type: "subscription_expiry_reminder",`. Canonical subscription row and service clock; literal key names.
- subscription_expired: `artifacts/api-server/src/services/postgresMerchantNotificationAuthority.ts:179` / `type: "subscription_expired",`. Canonical subscription state/time and remaining count; literal key names.
- addon_expiry_reminder: `artifacts/api-server/src/services/postgresMerchantNotificationAuthority.ts:229` / `type: "addon_expiry_reminder",`. Scoped reply batch row, source enum and service clock; literal key names.
- operational_new_order: `artifacts/api-server/src/services/postgresOperationalNotificationAuthority.ts:90` / `export async function notifyMerchantNewOrderPostgres`. Internal call parameters normalized with text(); fixed relative action URL with encoded order ID. Caller identity/ownership chain still requires reconciliation.
- operational_payment_conflict: `artifacts/api-server/src/services/postgresOperationalNotificationAuthority.ts:115` / `export async function notifyMerchantPaymentConflictPostgres`. Internal normalized parameters; relative action URL with encoded IDs; variable keys fixed by producer. Caller/input provenance not accepted yet.
- operational_knowledge_gap: `artifacts/api-server/src/services/postgresOperationalNotificationAuthority.ts:145` / `export async function notifyMerchantKnowledgeGapPostgres`. Internal training/conversation IDs; fixed keys and encoded relative action URL. Caller/input provenance not accepted yet.
- operational_customer_message: `artifacts/api-server/src/services/postgresOperationalNotificationAuthority.ts:171` / `export async function notifyMerchantNewCustomerMessagePostgres`. Internal conversation/event IDs, fixed keys and encoded relative action URL. Caller/input provenance not accepted yet.
- inspection_session_request: `artifacts/api-server/src/services/postgresSupportInspectionAuthority.ts:140` / `'notifications.inspection_session_request.title'`. Ticket/request/admin rows; merchant-controlled ticket subject is a value, not a key; canonical mode independent_read_only. Lifecycle and tenant provenance still need runtime linkage.
- support_reply_reminder: `artifacts/api-server/src/services/postgresSupportLifecycleAuthority.ts:235` / `type: "support_reply_reminder",`. Scoped support ticket/lifecycle clock; fixed keys and encoded local ticket URL.
- subscription_balance_purchase: `artifacts/api-server/src/routes/authRuntimePart3.ts:581` / `export function appendMerchantBalanceNotification`. AuthDb merchant_notifications array definition; not evidence of canonical SQL producer.
- subscription_plan_event: `artifacts/api-server/src/routes/authRuntimePart3.ts:628` / `export function appendMerchantSubscriptionPlanNotification`. AuthDb appendMerchantNotificationRecord; no canonical SQL type producer claimed.
- subscription_emergency_activated: `artifacts/api-server/src/routes/authRuntimePart3.ts:656` / `export function appendMerchantEmergencyActivationNotification`. AuthDb appendMerchantNotificationRecord. Same string in PostgreSQL subscription audit action_type is not a notifications.type producer.

## Next exact runtime batch

Use actual notifyMerchant*Postgres functions with two owned merchants, inspect exact SQL variable keys, actual app list/single-read response and actual frontend isMerchantNotificationRecord validation; verify identity, safe action URLs, peer preservation and replay/deduplication. No network provider. Then remaining subscription/Support templates and alternate helper provenance.

All source anchors, the12-type client set and reserved-key disjointness were checked locally; SHA256 input digests are in the [JSON evidence](evidence/P0-NOTIFICATION-PRODUCER-FIELD-MAP-20261025.json). No application/schema/grant changes or new CI/runtime PASS claimed. Full HTTP/field gates OPEN; NO-GO.
