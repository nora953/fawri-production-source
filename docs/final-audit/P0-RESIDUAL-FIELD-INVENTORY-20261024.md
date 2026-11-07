# Bounded residual privacy field inventory — 2026-10-24

Source revision `53f4f4b0ae3f0d5a62611d978771bba285b98653`; last accepted executable `bd3c518eb784608a68539d6a8b9fb9050fff57e8`.

**8 tables / 86 schema columns enumerated. This is source inventory, not field privacy or release acceptance.**

All fieldPrivacyAccepted flags remain false: existing bounded runtime proofs remain valid, but do not individually accept every field/producer/actor cell. Full HTTP and role/field gates stay OPEN; NO-GO.

Reproduce: `python docs/final-audit/tools/build_residual_privacy_inventory.py --check`.

| Table | Columns | Reviewed route rows | Literal SQL references |
| --- | ---: | ---: | ---: |
| audit_events | 16 | 4 | 17 |
| manual_reply_requests | 11 | 2 | 7 |
| merchant_admin_notes | 5 | 2 | 5 |
| merchant_channel_overrides | 6 | 3 | 4 |
| merchant_deletion_requests | 16 | 4 | 11 |
| notifications | 13 | 4 | 15 |
| order_drafts | 9 | 0 | 1 |
| processed_channel_events | 10 | 0 | 1 |

## Bounded accepted cells

- **RESIDUAL-FIELD-001** (BOUNDED_HTTP_ACCEPTED): Actual-app bulk-read actor/tenant/audience/replay boundary accepted:5new functional cases,11denied requests, exact peer/admin preservation and existing expired-unread inclusion. Full field/producer policy not accepted. Evidence: [P0-NOTIFICATION-BULK-HTTP-20261024.json](evidence/P0-NOTIFICATION-BULK-HTTP-20261024.json). This accepts only the named runtime contract, not every field or the whole HTTP gate.

## Selected open cells

- **RESIDUAL-FIELD-002** (notifications, OPEN): Flattened variables require producer/type/key provenance and collision policy; synthetic sentinel test is not a general allowlist. Next: Actual operational producer4types -> scoped SQL -> app list/single-read -> real frontend validator with peer preservation/dedup; then remaining subscription/Support templates and older SQL helper provenance. Reviewed12client types comprise9SQL-template candidates and3legacy definitions; no full field acceptance. Existing gate: `P0-ACCESS-FULL-ROLE-PRIVACY-MATRIX`.
- **RESIDUAL-FIELD-003** (audit_events, OPEN): Management meta/details, emergency event metadata and incident history have different projections and scopes. Next: Reconcile each producer and current HTTP role/field mapping against existing emergency/management tests. Existing gate: `P0-ACCESS-FULL-ROLE-PRIVACY-MATRIX`.
- **RESIDUAL-FIELD-004** (order_drafts,processed_channel_events, OPEN): No direct SQL row HTTP reader found; separate legacy debug/in-memory and durable ingress pipelines need authority/field/reachability mapping. Next: Trace actual bot debug and order/ingress consumers with accepted-source restrictions; do not build new CRUD endpoints. Existing gate: `P0-RESIDUAL-MERCHANT-PRIVACY-001/http`.
- **RESIDUAL-FIELD-005** (merchant_deletion_requests, OPEN_EXISTING_POLICY_GATE): Phone/name snapshots, audit retention and complete PII schedule remain policy-sensitive despite tested tenant deletion. Next: Keep existing retention/privileged-deletion policy gate open; document exact field policy rather than invent duration. Existing gate: `P0-RETENTION-PRIVILEGED-DELETION-POLICY`.

## audit_events

Schema: `lib/db/src/schema/audit.ts`.

| Column | SQL type | Nullable | Observed source exposure; not acceptance |
| --- | --- | --- | --- |
| id | text | False | ADMIN_LOG_OR_EMERGENCY_SELECTED_PROJECTION |
| actor_kind | audit_actor_kind | False | FILTER_OR_INTERNAL_NOT_IN_REVIEWED_HTTP_MAPPERS |
| actor_account_id | text | True | ADMIN_LOG_OR_EMERGENCY_SELECTED_PROJECTION |
| merchant_id | text | True | ADMIN_LOG_OR_EMERGENCY_SELECTED_PROJECTION |
| action_type | text | False | ADMIN_LOG_OR_EMERGENCY_SELECTED_PROJECTION |
| entity_type | text | True | FILTER_OR_INTERNAL_NOT_IN_REVIEWED_HTTP_MAPPERS |
| entity_id | text | True | ADMIN_LOG_OR_EMERGENCY_SELECTED_PROJECTION |
| reason_code | text | True | ADMIN_LOG_OR_EMERGENCY_SELECTED_PROJECTION |
| details | text | True | ADMIN_LOG_OR_EMERGENCY_SELECTED_PROJECTION |
| metadata | jsonb | False | ADMIN_LOG_OR_EMERGENCY_SELECTED_PROJECTION |
| ip_address | text | True | FILTER_OR_INTERNAL_NOT_IN_REVIEWED_HTTP_MAPPERS |
| user_agent | text | True | FILTER_OR_INTERNAL_NOT_IN_REVIEWED_HTTP_MAPPERS |
| request_id | text | True | FILTER_OR_INTERNAL_NOT_IN_REVIEWED_HTTP_MAPPERS |
| previous_hash | text | True | ADMIN_LOG_OR_EMERGENCY_SELECTED_PROJECTION |
| event_hash | text | True | ADMIN_LOG_OR_EMERGENCY_SELECTED_PROJECTION |
| created_at | timestamp with time zone | False | ADMIN_LOG_OR_EMERGENCY_SELECTED_PROJECTION |

Observed actor policy:

- merchant: denied direct management/admin audit reads.
- owner: global selected management and emergency projection.
- assistant: permission-dependent management log; emergency audit owner-only.
- worker: multiple SQL event producers; not an HTTP role.

Reviewed consumers:

- `artifacts/api-server/src/services/postgresMerchantManagementAuthority.ts:1445` — `export async function listAdminLogsPostgres`: Selected columns plus joined admin/merchant identity; metadata mapped wholesale to meta.
- `artifacts/api-server/src/services/postgresEmergencyReadAccessAuthority.ts:1231` — `function mapAudit(`: Emergency-specific selected metadata/event/hash projection; separate owner route.
- `artifacts/api-server/src/services/earlyWarningIncidentHistory.ts:201` — `export async function syncEarlyWarningIncidentHistory`: Incident lifecycle selected fields and normalized metadata; separate early-warning consumer.

SQL write producer candidates (lexical nearest-function heuristic, not complete field provenance):

- `artifacts/api-server/src/services/earlyWarningIncidentHistory.ts` / `insertLifecycleEvent`: INSERT INTO; lines 109.
- `artifacts/api-server/src/services/postgresEmergencyReadAccessAuthority.ts` / `appendAuditEvent`: INSERT INTO; lines 314.
- `artifacts/api-server/src/services/postgresMerchantAdminLogAuthority.ts` / `appendMerchantAdminLogPostgres`: INSERT INTO; lines 62.
- `artifacts/api-server/src/services/postgresMerchantManagementAuthority.ts` / `writeAudit`: INSERT INTO; lines 291.
- `artifacts/api-server/src/services/postgresMerchantManagementAuthority.ts` / `purgeMerchantOperationalData`: UPDATE; lines 1170.
- `artifacts/api-server/src/services/postgresMerchantManagementAuthority.ts` / `importLegacyAdminDataPostgres`: INSERT INTO; lines 1362.
- `artifacts/api-server/src/services/postgresOrderPaymentProviderAuthority.ts` / `resolveMerchantPaymentConflictAuthoritative`: INSERT INTO; lines 792.
- `artifacts/api-server/src/services/postgresSubscriptionEntitlement.ts` / `writeAudit`: INSERT INTO; lines 1112.
- `artifacts/api-server/src/services/postgresSupportLifecycleAuthority.ts` / `insertAudit`: INSERT INTO; lines 79.
- `artifacts/api-server/src/services/subscriptionPlanCycleAuthority.ts` / `applySubscriptionPlanCycleInTransaction`: INSERT INTO; lines 309.
- `artifacts/api-server/src/services/subscriptionServiceGuarantee.ts` / `recordSubscriptionServiceGuaranteeAssessmentAudit`: INSERT INTO; lines 970, 988.

| Method | Route | Current guard | Reachability / evidence status |
| --- | --- | --- | --- |
| GET | /api/auth/admin/logs | secure admin + view_logs | ACTIVE / BOUNDED_RUNTIME_EVIDENCE |
| POST | /api/auth/admin/logs | secure admin + manage_subscriptions | ACTIVE / BOUNDED_RUNTIME_EVIDENCE |
| GET | /api/auth/admin/emergency-read-access/audit | secure admin + owner | ACTIVE / SEPARATE_EMERGENCY_EVIDENCE_NOT_ALL_FIELD_ACCEPTANCE |
| GET | /api/auth/admin/early-warning | secure admin + view_logs | ACTIVE / PRODUCER_FIELD_RECONCILIATION_PENDING |

Existing evidence: [P0-RESIDUAL-HTTP-PRIVACY-20261024.json](evidence/P0-RESIDUAL-HTTP-PRIVACY-20261024.json), [P0-MANAGEMENT-FULL-APP-HTTP-20261024.json](evidence/P0-MANAGEMENT-FULL-APP-HTTP-20261024.json), [P0-CASHIER-OFFLINE-SIGNED-20261024.json](evidence/P0-CASHIER-OFFLINE-SIGNED-20261024.json).

- Same-name legacy auth-security/emergency JSON audit_events are different authorities; literal table-name matches are not automatically SQL consumers.
- metadata/details producer provenance is not fully accepted; management log tests do not certify all emergency/incident fields.

## manual_reply_requests

Schema: `lib/db/src/schema/manual-conversations.ts`.

| Column | SQL type | Nullable | Observed source exposure; not acceptance |
| --- | --- | --- | --- |
| id | text | False | INTERNAL_REPLY_LIFECYCLE_NO_RAW_ROW_HTTP_SERIALIZATION |
| merchant_id | text | False | INTERNAL_REPLY_LIFECYCLE_NO_RAW_ROW_HTTP_SERIALIZATION |
| conversation_id | text | False | INTERNAL_REPLY_LIFECYCLE_NO_RAW_ROW_HTTP_SERIALIZATION |
| idempotency_key | text | False | INTERNAL_REPLY_LIFECYCLE_NO_RAW_ROW_HTTP_SERIALIZATION |
| text_sha256 | text | False | INTERNAL_REPLY_LIFECYCLE_NO_RAW_ROW_HTTP_SERIALIZATION |
| status | manual_reply_request_status | False | INTERNAL_REPLY_LIFECYCLE_NO_RAW_ROW_HTTP_SERIALIZATION |
| message_id | text | True | INTERNAL_REPLY_LIFECYCLE_NO_RAW_ROW_HTTP_SERIALIZATION |
| external_message_id | text | True | INTERNAL_REPLY_LIFECYCLE_NO_RAW_ROW_HTTP_SERIALIZATION |
| error_code | text | True | INTERNAL_REPLY_LIFECYCLE_NO_RAW_ROW_HTTP_SERIALIZATION |
| created_at | timestamp with time zone | False | INTERNAL_REPLY_LIFECYCLE_NO_RAW_ROW_HTTP_SERIALIZATION |
| updated_at | timestamp with time zone | False | INTERNAL_REPLY_LIFECYCLE_NO_RAW_ROW_HTTP_SERIALIZATION |

Observed actor policy:

- merchant: own conversation projection/control; foreign IDs denied.
- owner: admin cookie cannot substitute for merchant cookie.
- assistant: admin cookie cannot substitute for merchant cookie.
- worker: scoped lifecycle mutations; no public raw table endpoint.

Reviewed consumers:

- `artifacts/api-server/src/services/postgresManualConversationAuthority.ts:193` — `async function updateConversationControl`: Pending/uncertain status gates return-to-Fawri; raw rows are not conversation projection.
- `artifacts/api-server/src/routes/conversation-operations.ts:170` — `const requestKey = idempotencyKey(req);`: Secure merchant owns conversation; replay returns message/conversation, not raw request row.

SQL write producer candidates (lexical nearest-function heuristic, not complete field provenance):

- `artifacts/api-server/src/services/postgresManualConversationAuthority.ts` / `prepareManualReplyAuthoritative`: INSERT INTO; lines 482.
- `artifacts/api-server/src/services/postgresManualConversationAuthority.ts` / `completeManualReplyAuthoritative`: UPDATE; lines 725.
- `artifacts/api-server/src/services/postgresManualConversationAuthority.ts` / `failManualReplyAuthoritative`: UPDATE; lines 811.
- `artifacts/api-server/src/services/postgresMerchantManagementAuthority.ts` / `purgeMerchantOperationalData`: DELETE FROM; lines 963.

| Method | Route | Current guard | Reachability / evidence status |
| --- | --- | --- | --- |
| GET | /api/conversations[/:merchantId]; /api/conversation/:conversationId | secure merchant own tenant | ACTIVE / BOUNDED_RUNTIME_EVIDENCE |
| POST | /api/conversations/:conversationId/{takeover,return-to-fawri,messages} | secure merchant own tenant; reply lifecycle and provider boundary | ACTIVE / BOUNDED_RUNTIME_EVIDENCE |

Existing evidence: [P0-CONVERSATION-HTTP-PRIVACY-20261024.json](evidence/P0-CONVERSATION-HTTP-PRIVACY-20261024.json), [P0-CONSUMER-FULL-APP-HTTP-20261024.json](evidence/P0-CONSUMER-FULL-APP-HTTP-20261024.json).

- idempotency and delivery state are internal; public messages are a different table/projection.
- No new provider-send acceptance; provider/session/failure proofs retain their own limits.

## merchant_admin_notes

Schema: `lib/db/src/schema/merchant-management.ts`.

| Column | SQL type | Nullable | Observed source exposure; not acceptance |
| --- | --- | --- | --- |
| merchant_id | text | False | ADMIN_NOTE_PROJECTION |
| note | text | False | ADMIN_NOTE_PROJECTION |
| updated_by_admin_id | text | True | INTERNAL_AUTHORSHIP_OR_TIMESTAMP |
| created_at | timestamp with time zone | False | INTERNAL_AUTHORSHIP_OR_TIMESTAMP |
| updated_at | timestamp with time zone | False | INTERNAL_AUTHORSHIP_OR_TIMESTAMP |

Observed actor policy:

- merchant: denied.
- owner: global read/write/import.
- assistant: manage_merchant_status read/write; no owner import.
- worker: tenant deletion purges note.

Reviewed consumers:

- `artifacts/api-server/src/services/postgresMerchantManagementAuthority.ts:360` — `export async function getMerchantAdminNotePostgres`: SELECT note; response merchant_id follows validated path.
- `artifacts/api-server/src/services/postgresMerchantManagementAuthority.ts:375` — `export async function setMerchantAdminNotePostgres`: Admin ID is supplied from current authenticated context; import is owner-only.

SQL write producer candidates (lexical nearest-function heuristic, not complete field provenance):

- `artifacts/api-server/src/services/postgresMerchantManagementAuthority.ts` / `setMerchantAdminNotePostgres`: DELETE FROM, INSERT INTO; lines 392, 397.
- `artifacts/api-server/src/services/postgresMerchantManagementAuthority.ts` / `purgeMerchantOperationalData`: DELETE FROM; lines 1158.
- `artifacts/api-server/src/services/postgresMerchantManagementAuthority.ts` / `importLegacyAdminDataPostgres`: INSERT INTO; lines 1399.

| Method | Route | Current guard | Reachability / evidence status |
| --- | --- | --- | --- |
| GET/PUT | /api/auth/merchants/:id/note | secure admin + manage_merchant_status | ACTIVE / BOUNDED_RUNTIME_EVIDENCE |
| POST | /api/auth/admin/local-data-migration | secure owner | ACTIVE / BOUNDED_RUNTIME_EVIDENCE |

Existing evidence: [P0-RESIDUAL-HTTP-PRIVACY-20261024.json](evidence/P0-RESIDUAL-HTTP-PRIVACY-20261024.json), [P0-OWNER-IMPORT-HTTP-20261024.json](evidence/P0-OWNER-IMPORT-HTTP-20261024.json), [P0-MANAGEMENT-FULL-APP-HTTP-20261024.json](evidence/P0-MANAGEMENT-FULL-APP-HTTP-20261024.json).

- Legitimate administrator scope is global; merchant isolation does not mean an authorized owner is restricted to one merchant.

## merchant_channel_overrides

Schema: `lib/db/src/schema/merchant-management.ts`.

| Column | SQL type | Nullable | Observed source exposure; not acceptance |
| --- | --- | --- | --- |
| merchant_id | text | False | ADMIN_CHANNEL_KEYED_PROJECTION |
| platform | channel_platform | False | ADMIN_CHANNEL_KEYED_PROJECTION |
| status | channel_status | False | ADMIN_CHANNEL_KEYED_PROJECTION |
| updated_by_admin_id | text | True | INTERNAL_AUTHORSHIP_OR_TIMESTAMP |
| created_at | timestamp with time zone | False | INTERNAL_AUTHORSHIP_OR_TIMESTAMP |
| updated_at | timestamp with time zone | False | INTERNAL_AUTHORSHIP_OR_TIMESTAMP |

Observed actor policy:

- merchant: denied.
- owner: global override read/write/import.
- assistant: manage_channels read/write; no owner import.
- worker: tenant deletion purges overrides.

Reviewed consumers:

- `artifacts/api-server/src/services/postgresMerchantManagementAuthority.ts:418` — `export async function listMerchantChannelOverridesPostgres`: Projection is merchant_id -> platform -> status, not credentials.
- `artifacts/api-server/src/services/postgresMerchantManagementAuthority.ts:443` — `export async function setMerchantChannelOverridePostgres`: Current admin actor; closed-account checks.

SQL write producer candidates (lexical nearest-function heuristic, not complete field provenance):

- `artifacts/api-server/src/services/postgresMerchantManagementAuthority.ts` / `setMerchantChannelOverridePostgres`: INSERT INTO; lines 474.
- `artifacts/api-server/src/services/postgresMerchantManagementAuthority.ts` / `purgeMerchantOperationalData`: DELETE FROM; lines 1159.
- `artifacts/api-server/src/services/postgresMerchantManagementAuthority.ts` / `importLegacyAdminDataPostgres`: INSERT INTO; lines 1431.

| Method | Route | Current guard | Reachability / evidence status |
| --- | --- | --- | --- |
| GET | /api/auth/admin/channels | secure admin + manage_channels | ACTIVE / BOUNDED_RUNTIME_EVIDENCE |
| PATCH | /api/auth/merchants/:id/channels/:platform | secure admin + manage_channels | ACTIVE / BOUNDED_RUNTIME_EVIDENCE |
| POST | /api/auth/admin/local-data-migration | secure owner | ACTIVE / BOUNDED_RUNTIME_EVIDENCE |

Existing evidence: [P0-RESIDUAL-HTTP-PRIVACY-20261024.json](evidence/P0-RESIDUAL-HTTP-PRIVACY-20261024.json), [P0-OWNER-IMPORT-HTTP-20261024.json](evidence/P0-OWNER-IMPORT-HTTP-20261024.json).

- This administrative override table is not encrypted merchant_channels credentials.

## merchant_deletion_requests

Schema: `lib/db/src/schema/merchant-management.ts`.

| Column | SQL type | Nullable | Observed source exposure; not acceptance |
| --- | --- | --- | --- |
| id | text | False | ADMIN_DELETION_SNAPSHOT_REVIEW_PROJECTION |
| merchant_id | text | True | INTERNAL_LIVE_LINK_OR_COMPLETION |
| merchant_id_snapshot | text | False | ADMIN_DELETION_SNAPSHOT_REVIEW_PROJECTION |
| merchant_name_snapshot | text | False | ADMIN_DELETION_SNAPSHOT_REVIEW_PROJECTION |
| merchant_phone_snapshot | text | False | ADMIN_DELETION_SNAPSHOT_REVIEW_PROJECTION |
| requested_by_admin_id | text | True | INTERNAL_LIVE_LINK_OR_COMPLETION |
| requested_by_admin_id_snapshot | text | False | ADMIN_DELETION_SNAPSHOT_REVIEW_PROJECTION |
| requested_by_admin_name_snapshot | text | False | ADMIN_DELETION_SNAPSHOT_REVIEW_PROJECTION |
| requested_by_admin_phone_snapshot | text | False | ADMIN_DELETION_SNAPSHOT_REVIEW_PROJECTION |
| reason | text | False | ADMIN_DELETION_SNAPSHOT_REVIEW_PROJECTION |
| details | text | False | ADMIN_DELETION_SNAPSHOT_REVIEW_PROJECTION |
| status | text | False | ADMIN_DELETION_SNAPSHOT_REVIEW_PROJECTION |
| reviewed_by_admin_id | text | True | ADMIN_DELETION_SNAPSHOT_REVIEW_PROJECTION |
| reviewed_at | timestamp with time zone | True | ADMIN_DELETION_SNAPSHOT_REVIEW_PROJECTION |
| completed_at | timestamp with time zone | True | INTERNAL_LIVE_LINK_OR_COMPLETION |
| created_at | timestamp with time zone | False | ADMIN_DELETION_SNAPSHOT_REVIEW_PROJECTION |

Observed actor policy:

- merchant: denied.
- owner: review/reject/complete; creation route explicitly assistant-only.
- assistant: manage_merchant_status create/read; cannot reject/complete.
- worker: trusted tenant deletion transaction retains bounded completion record.

Reviewed consumers:

- `artifacts/api-server/src/services/postgresMerchantManagementAuthority.ts:215` — `function deletionRequest(`: Snapshot fields are deliberately remapped to legacy public names; completed_at not returned by this mapper.
- `artifacts/api-server/src/services/merchantPhysicalMediaCleanup.ts:365` — `export async function completeMerchantDeletionWithPhysicalMediaCleanup`: Manifest before actual deletion, local media after transaction commit.

SQL write producer candidates (lexical nearest-function heuristic, not complete field provenance):

- `artifacts/api-server/src/services/postgresMerchantManagementAuthority.ts` / `createDeletionRequestPostgres`: INSERT INTO; lines 753.
- `artifacts/api-server/src/services/postgresMerchantManagementAuthority.ts` / `rejectDeletionRequestPostgres`: UPDATE; lines 838.
- `artifacts/api-server/src/services/postgresMerchantManagementAuthority.ts` / `completeMerchantDeletionPostgres`: UPDATE; lines 1290, 1298.

| Method | Route | Current guard | Reachability / evidence status |
| --- | --- | --- | --- |
| GET | /api/auth/admin/deletion-requests | secure admin + manage_merchant_status | ACTIVE / BOUNDED_RUNTIME_EVIDENCE |
| POST | /api/auth/merchants/:id/deletion-requests | secure assistant + manage_merchant_status (owner excluded by current requireAssistant) | ACTIVE / BOUNDED_RUNTIME_EVIDENCE |
| POST | /api/auth/admin/deletion-requests/:requestId/reject | secure owner | ACTIVE / BOUNDED_RUNTIME_EVIDENCE |
| POST | /api/auth/merchants/:id/delete | secure owner + own password + suspended merchant + matching request + quiescence | ACTIVE / BOUNDED_RUNTIME_EVIDENCE |

Existing evidence: [P0-RESIDUAL-HTTP-PRIVACY-20261024.json](evidence/P0-RESIDUAL-HTTP-PRIVACY-20261024.json), [P0-OWNER-DELETION-HTTP-20261024.json](evidence/P0-OWNER-DELETION-HTTP-20261024.json).

- Snapshot ID/name/phone provenance differs from nullable live foreign keys.
- Complete financial/PII retention schedule remains separately OPEN; do not derive policy approval from deletion runtime PASS.

## notifications

Schema: `lib/db/src/schema/notifications.ts`.

| Column | SQL type | Nullable | Observed source exposure; not acceptance |
| --- | --- | --- | --- |
| id | text | False | MERCHANT_SELECTED_PROJECTION |
| audience | notification_audience | False | AUDIENCE_SCOPE_EXPIRY_OR_INTERNAL_TEMPLATE |
| merchant_id | text | True | AUDIENCE_SCOPE_EXPIRY_OR_INTERNAL_TEMPLATE |
| account_id | text | True | AUDIENCE_SCOPE_EXPIRY_OR_INTERNAL_TEMPLATE |
| type | text | False | MERCHANT_SELECTED_PROJECTION |
| title_key | text | False | AUDIENCE_SCOPE_EXPIRY_OR_INTERNAL_TEMPLATE |
| body_key | text | False | AUDIENCE_SCOPE_EXPIRY_OR_INTERNAL_TEMPLATE |
| variables | jsonb | False | MERCHANT_SELECTED_PROJECTION |
| source_entity_type | text | True | AUDIENCE_SCOPE_EXPIRY_OR_INTERNAL_TEMPLATE |
| source_entity_id | text | True | AUDIENCE_SCOPE_EXPIRY_OR_INTERNAL_TEMPLATE |
| read_at | timestamp with time zone | True | MERCHANT_SELECTED_PROJECTION |
| expires_at | timestamp with time zone | True | AUDIENCE_SCOPE_EXPIRY_OR_INTERNAL_TEMPLATE |
| created_at | timestamp with time zone | False | MERCHANT_SELECTED_PROJECTION |

Observed actor policy:

- merchant: own live merchant audience list; own read and bulk read.
- owner: admin cookie denied merchant notification API.
- assistant: admin cookie denied merchant notification API.
- worker: canonical scoped notification producers; admin audience may share SQL table.

Reviewed consumers:

- `artifacts/api-server/src/services/postgresMerchantNotificationAuthority.ts:254` — `function mapNotification(`: variables is spread at top level; id/type precede spread, timestamps follow it. No arbitrary-key acceptance.
- `artifacts/api-server/src/routes/merchant-notifications-pg.ts:45` — `"/notifications",`: Mounted earlier under auth-security; owns GET list and PATCH individual read.
- `artifacts/api-server/src/routes/auth-support-postgres-routes.ts:484` — `"/notifications/read-all",`: Later support router owns POST bulk read; its GET/PATCH duplicates are shadowed by earlier notification router in required mode.
- `artifacts/api-server/src/services/postgresSupportAuthority.ts:982` — `export async function listMerchantNotificationsPostgres(`: Older SQL notification functions exist; current support routes import canonical authority instead.

SQL write producer candidates (lexical nearest-function heuristic, not complete field provenance):

- `artifacts/api-server/src/services/postgresMerchantManagementAuthority.ts` / `purgeMerchantOperationalData`: DELETE FROM; lines 1156.
- `artifacts/api-server/src/services/postgresMerchantNotificationAuthority.ts` / `insertMerchantNotification`: INSERT INTO; lines 88.
- `artifacts/api-server/src/services/postgresMerchantNotificationAuthority.ts` / `markMerchantNotificationReadPostgresCanonical`: UPDATE; lines 335.
- `artifacts/api-server/src/services/postgresMerchantNotificationAuthority.ts` / `markAllMerchantNotificationsReadPostgresCanonical`: UPDATE; lines 359.
- `artifacts/api-server/src/services/postgresOperationalNotificationAuthority.ts` / `insertOperationalNotification`: INSERT INTO; lines 65.
- `artifacts/api-server/src/services/postgresSupportAuthority.ts` / `insertMerchantNotification`: INSERT INTO; lines 948.
- `artifacts/api-server/src/services/postgresSupportAuthority.ts` / `markMerchantNotificationReadPostgres`: UPDATE; lines 1018.
- `artifacts/api-server/src/services/postgresSupportAuthority.ts` / `markAllMerchantNotificationsReadPostgres`: UPDATE; lines 1036.
- `artifacts/api-server/src/services/postgresSupportInspectionAuthority.ts` / `createInspectionRequestCanonicalPostgres`: INSERT INTO; lines 134.
- `artifacts/api-server/src/services/postgresSupportLifecycleAuthority.ts` / `insertMerchantNotification`: INSERT INTO; lines 109.
- `artifacts/api-server/src/services/postgresSupportLifecycleAuthority.ts` / `refreshSupportLifecyclePostgresCanonical`: UPDATE; lines 289.

| Method | Route | Current guard | Reachability / evidence status |
| --- | --- | --- | --- |
| GET | /api/auth/notifications | secure merchant; audience=merchant + own merchant + expiry filter | ACTIVE / BOUNDED_RUNTIME_EVIDENCE |
| PATCH | /api/auth/notifications/:id/read | secure merchant; own merchant/audience | ACTIVE / BOUNDED_RUNTIME_EVIDENCE |
| POST | /api/auth/notifications/read-all | secure merchant; own merchant/audience | ACTIVE / BOUNDED_HTTP_ACCEPTED_RESIDUAL_FIELD_001 |
| GET/PATCH | same list/individual paths in support router | secure merchant | SHADOWED_IN_CURRENT_REQUIRED_MODE / REACHABILITY_SOURCE_REVIEW |

Existing evidence: [P0-RESIDUAL-HTTP-PRIVACY-20261024.json](evidence/P0-RESIDUAL-HTTP-PRIVACY-20261024.json), [P0-CONSUMER-FULL-APP-HTTP-20261024.json](evidence/P0-CONSUMER-FULL-APP-HTTP-20261024.json), [P0-NOTIFICATION-BULK-HTTP-20261024.json](evidence/P0-NOTIFICATION-BULK-HTTP-20261024.json).

- Subscription, operational order/payment/knowledge/customer-message, Support lifecycle and inspection notification producers require explicit variable-key provenance reconciliation.
- Bulk-read route has bounded actual-app runtime acceptance on bd3c518e; notification JSON variable producer/key policy remains separately OPEN.

## order_drafts

Schema: `lib/db/src/schema/orders.ts`.

| Column | SQL type | Nullable | Observed source exposure; not acceptance |
| --- | --- | --- | --- |
| id | text | False | NO_DIRECT_HTTP_SQL_READER_IDENTIFIED_IN_SCAN |
| merchant_id | text | False | NO_DIRECT_HTTP_SQL_READER_IDENTIFIED_IN_SCAN |
| conversation_id | text | False | NO_DIRECT_HTTP_SQL_READER_IDENTIFIED_IN_SCAN |
| customer_external_id | text | False | NO_DIRECT_HTTP_SQL_READER_IDENTIFIED_IN_SCAN |
| awaiting_field | text | False | NO_DIRECT_HTTP_SQL_READER_IDENTIFIED_IN_SCAN |
| draft_data | jsonb | False | NO_DIRECT_HTTP_SQL_READER_IDENTIFIED_IN_SCAN |
| expires_at | timestamp with time zone | False | NO_DIRECT_HTTP_SQL_READER_IDENTIFIED_IN_SCAN |
| created_at | timestamp with time zone | False | NO_DIRECT_HTTP_SQL_READER_IDENTIFIED_IN_SCAN |
| updated_at | timestamp with time zone | False | NO_DIRECT_HTTP_SQL_READER_IDENTIFIED_IN_SCAN |

Observed actor policy:

- all_http_actors: no direct SQL row route identified; no HTTP PASS inferred.
- trusted_deletion: actual tenant-scoped purge exists.
- legacy_or_worker: separate storage/event pipelines require source/reachability reconciliation.

Reviewed consumers:

- `artifacts/api-server/src/services/postgresMerchantManagementAuthority.ts:911` — `async function purgeMerchantOperationalData`: Tenant deletion includes table; no raw table reader found in scanned current server SQL source.
- `artifacts/api-server/src/routes/indexModulePart3.ts:684` — `router.get("/bot/debug",`: Legacy debug reads merchant-filtered in-memory orderDraftsByConversation and db_path, not SQL order_drafts. Reachability/field policy remains open.

SQL write producer candidates (lexical nearest-function heuristic, not complete field provenance):

- `artifacts/api-server/src/services/postgresMerchantManagementAuthority.ts` / `purgeMerchantOperationalData`: DELETE FROM; lines 962.

Existing evidence: [P0-0051-VERIFICATION-20261024.json](evidence/P0-0051-VERIFICATION-20261024.json), [P0-ACCESS-CONTROL-PROOF-INVENTORY-20261023.json](evidence/P0-ACCESS-CONTROL-PROOF-INVENTORY-20261023.json).

- SQL schema/readiness/deletion refs alone do not prove route absence globally or require a new public CRUD API.
- Current canonical SQL table and legacy/in-memory business structures must be reconciled; no whole-feature acceptance.

## processed_channel_events

Schema: `lib/db/src/schema/conversations.ts`.

| Column | SQL type | Nullable | Observed source exposure; not acceptance |
| --- | --- | --- | --- |
| id | text | False | NO_DIRECT_HTTP_SQL_READER_IDENTIFIED_IN_SCAN |
| merchant_id | text | False | NO_DIRECT_HTTP_SQL_READER_IDENTIFIED_IN_SCAN |
| channel_id | text | False | NO_DIRECT_HTTP_SQL_READER_IDENTIFIED_IN_SCAN |
| external_event_id | text | False | NO_DIRECT_HTTP_SQL_READER_IDENTIFIED_IN_SCAN |
| event_type | text | False | NO_DIRECT_HTTP_SQL_READER_IDENTIFIED_IN_SCAN |
| payload_hash | text | False | NO_DIRECT_HTTP_SQL_READER_IDENTIFIED_IN_SCAN |
| processing_status | text | False | NO_DIRECT_HTTP_SQL_READER_IDENTIFIED_IN_SCAN |
| error_code | text | True | NO_DIRECT_HTTP_SQL_READER_IDENTIFIED_IN_SCAN |
| received_at | timestamp with time zone | False | NO_DIRECT_HTTP_SQL_READER_IDENTIFIED_IN_SCAN |
| completed_at | timestamp with time zone | True | NO_DIRECT_HTTP_SQL_READER_IDENTIFIED_IN_SCAN |

Observed actor policy:

- all_http_actors: no direct SQL row route identified; no HTTP PASS inferred.
- trusted_deletion: actual tenant-scoped purge exists.
- legacy_or_worker: separate storage/event pipelines require source/reachability reconciliation.

Reviewed consumers:

- `artifacts/api-server/src/services/postgresMerchantManagementAuthority.ts:911` — `async function purgeMerchantOperationalData`: Tenant deletion includes table; no raw table reader found in scanned current server SQL source.

SQL write producer candidates (lexical nearest-function heuristic, not complete field provenance):

- `artifacts/api-server/src/services/postgresMerchantManagementAuthority.ts` / `purgeMerchantOperationalData`: DELETE FROM; lines 966.

Existing evidence: [P0-0051-VERIFICATION-20261024.json](evidence/P0-0051-VERIFICATION-20261024.json), [P0-ACCESS-CONTROL-PROOF-INVENTORY-20261023.json](evidence/P0-ACCESS-CONTROL-PROOF-INVENTORY-20261023.json).

- SQL schema/readiness/deletion refs alone do not prove route absence globally or require a new public CRUD API.
- Current canonical SQL table and legacy/in-memory business structures must be reconciled; no whole-feature acceptance.

## Verification and limits

- Snapshot columns are exact; field/role observations are manually reviewed source mappings.
- Literal SQL scan and nearest function heuristic are not an AST, call graph or dynamic SQL proof.
- Reviewed route rows are not an exhaustive endpoint/actor denominator.
- No same-name legacy JSON store is treated as the SQL table.
- Nested JSON keys and producer/input provenance remain explicit open work.
- Existing runtime acceptance is bounded by its original evidence; no new runtime PASS from this inventory.

No application/schema/grant/policy change. No hosted access, deployment, merge or P1/P2 work.
