## Legacy compatibility source/local-client reconciliation — 2026-10-25

[Legacy report](P0-NOTIFICATION-LEGACY-COMPATIBILITY-20261025.md)/[evidence](evidence/P0-NOTIFICATION-LEGACY-COMPATIBILITY-20261025.json):807runtime source files scanned;3JSON subscription templates are locally structure-compatible, older SQL inspection request_id template is incompatible, raw current inspection template requires authoritative lifecycle enrichment. Actual frontend validator/client4localPASS with synthetic shapes/in-process fetch. No SQL/application HTTP/legacy producer or hosted historical execution; no newCI. Last accepted6182678d and56/56,72notificationTAP,721broaderTAP unchanged. FIELD002 remains OPEN. No guessed migration/repair/cleanup; next concurrent canonical list refresher acceptance beyond accepted sequential replay.

---

## Inspection ending lifecycle runtime update — 2026-10-25

Actual merchant termination, pending timeout and approved-window/preview expiration are bounded-runtime accepted on6182678d:3newfunctional,fixture21TAP,lane72TAP,broader721TAP,56/56CI SUCCESS. Canonical HTTP lifecycle→request/preview SQL→actual app list/read→actual frontend validator; ended preview access denied, peer state and repeated reads/refresh preserved. Owned fixture timestamps aged; real service clocks used. [Evidence](evidence/P0-SUPPORT-NOTIFICATION-ENDING-20261025.json). No app/schema/grant changes, timer cadence/browser/concurrency/hosted/historical acceptance. FIELD002 remains OPEN; next historical/legacy shape and helper reachability reconciliation before any repair policy.

---

## Support caller runtime and inspection lifecycle projection update — 2026-10-25

Canonical inspection HTTP and admin lifecycle reminder callers→SQL→actual app list/read→actual frontend validator bounded-runtime accepted on06c04523. Six new functional cases; lane69TAP,broader721TAP,56/56CI SUCCESS. Initial741c371a runtime exposed missing request_status/current decision fields. List/read now batch-project matching merchant/source/request/ticket lifecycle fields from canonical SQL; stored stale lifecycle keys cannot override them. Pending/approved/rejected, peer/reference denials, notice-write rollback/retry and replay PASS. [Evidence](evidence/P0-SUPPORT-NOTIFICATION-CALLER-20261025.json).

Stored producer variables remain fixed; request_status/consent_decision/responded_at/session_expires_at/ended_at/end_reason are authoritative read-time fields. Older Support helper declarations are separate source provenance; no historical auto-repair or runtime absence accepted. FIELD002 remains OPEN for expiry/termination, historical/legacy and other remaining boundaries; no browser/provider/hosted acceptance.

---

## Subscription list caller runtime and new-order reachability update — 2026-10-25

Actual authenticated list→subscription refresher→3SQL templates→app→actual frontend validator bounded-runtime accepted on ac1cd586:4new functional cases, dedicated lane63TAP,broader721TAP,56/56CI SUCCESS. Two merchants, eligible-batch filters, exact fields/markers, peer preservation/read denial/replay and injected INSERT rollback/retry PASS. Seeded balances; no purchase/scheduler/concurrent/crash/browser/provider/hosted acceptance. [Runtime evidence](evidence/P0-SUBSCRIPTION-NOTIFICATION-CALLER-20261025.json).

[807-file new-order source scan](evidence/P0-NEW-ORDER-NOTIFICATION-REACHABILITY-20261025.json) finds SQL helper declaration only; JSON order/notice flow is distinct and required-mode disabled. No invented canonical application caller or runtime absence/commercial-order acceptance. FIELD002 remains OPEN. Next canonical Support inspection/reply-reminder caller-to-client coverage plus alternate helper provenance; keep existing evidence separate.

---

## Meta knowledge-gap caller runtime update — 2026-10-25

Actual restricted Meta worker→knowledge engine→committed handoff/training request→knowledge-gap SQL notice→authenticated app/actual frontend validator bounded-runtime accepted on d86d7c11. Three new functional cases; Meta suite26TAP,notification lane59TAP,broader721TAP,56/56CI SUCCESS. Two merchants, exact fields, peer notice denial, read/event replay PASS. [Evidence](evidence/P0-META-KNOWLEDGE-GAP-NOTIFICATION-CALLER-20261025.json). Loopback fake Graph/synthetic embedding; no external provider/browser/crash/notice-write-failure/hosted acceptance. FIELD002 remains OPEN; next reconcile actual new-order SQL caller/reachability before missing runtime coverage, then remaining templates. Four inspected order modules alone do not establish unreachability.

---

## Meta customer-message caller runtime update — 2026-10-25

Original restricted Meta worker→inbound SQL message→customer-message notice→authenticated app→actual frontend validator is bounded-runtime accepted one08e554f. Three new functional cases; original Meta suite23TAP,notification lane56TAP,broader718TAP,56/56CI SUCCESS. [Evidence](evidence/P0-META-CUSTOMER-NOTIFICATION-CALLER-20261025.json). Two merchants,exact fields,peer denial,own read replay,signed redelivery/queue dedup pass with loopback fake Graph; no external Meta/browser/forced reprocessing/crash/hosted proof. FIELD002 remains OPEN; next knowledge-gap actual Meta handoff caller, preserving direct-engine learning proof separately.

---

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
