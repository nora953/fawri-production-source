# P0 residual merchant privacy HTTP actor and route matrix — 2026-11-04

Gate `P0-RESIDUAL-MERCHANT-PRIVACY-001/http`: OPEN; release NO-GO. This is a finite reconciliation of the committed inventory, not new runtime proof.

| Table | HTTP route | Guard | Reachability | Evidence status |
|---|---|---|---|---|
| `audit_events` | `GET /api/auth/admin/logs` | secure admin + view_logs | ACTIVE | BOUNDED_RUNTIME_EVIDENCE |
| `audit_events` | `POST /api/auth/admin/logs` | secure admin + manage_subscriptions | ACTIVE | BOUNDED_RUNTIME_EVIDENCE |
| `audit_events` | `GET /api/auth/admin/emergency-read-access/audit` | secure admin + owner | ACTIVE | SEPARATE_EMERGENCY_EVIDENCE_NOT_ALL_FIELD_ACCEPTANCE |
| `audit_events` | `GET /api/auth/admin/early-warning` | secure admin + view_logs | ACTIVE | PRODUCER_FIELD_RECONCILIATION_PENDING |
| `manual_reply_requests` | `GET /api/conversations[/:merchantId]; /api/conversation/:conversationId` | secure merchant own tenant | ACTIVE | BOUNDED_RUNTIME_EVIDENCE |
| `manual_reply_requests` | `POST /api/conversations/:conversationId/{takeover,return-to-fawri,messages}` | secure merchant own tenant; reply lifecycle and provider boundary | ACTIVE | BOUNDED_RUNTIME_EVIDENCE |
| `merchant_admin_notes` | `GET/PUT /api/auth/merchants/:id/note` | secure admin + manage_merchant_status | ACTIVE | BOUNDED_RUNTIME_EVIDENCE |
| `merchant_admin_notes` | `POST /api/auth/admin/local-data-migration` | secure owner | ACTIVE | BOUNDED_RUNTIME_EVIDENCE |
| `merchant_channel_overrides` | `GET /api/auth/admin/channels` | secure admin + manage_channels | ACTIVE | BOUNDED_RUNTIME_EVIDENCE |
| `merchant_channel_overrides` | `PATCH /api/auth/merchants/:id/channels/:platform` | secure admin + manage_channels | ACTIVE | BOUNDED_RUNTIME_EVIDENCE |
| `merchant_channel_overrides` | `POST /api/auth/admin/local-data-migration` | secure owner | ACTIVE | BOUNDED_RUNTIME_EVIDENCE |
| `merchant_deletion_requests` | `GET /api/auth/admin/deletion-requests` | secure admin + manage_merchant_status | ACTIVE | BOUNDED_RUNTIME_EVIDENCE |
| `merchant_deletion_requests` | `POST /api/auth/merchants/:id/deletion-requests` | secure assistant + manage_merchant_status (owner excluded by current requireAssistant) | ACTIVE | BOUNDED_RUNTIME_EVIDENCE |
| `merchant_deletion_requests` | `POST /api/auth/admin/deletion-requests/:requestId/reject` | secure owner | ACTIVE | BOUNDED_RUNTIME_EVIDENCE |
| `merchant_deletion_requests` | `POST /api/auth/merchants/:id/delete` | secure owner + own password + suspended merchant + matching request + quiescence | ACTIVE | BOUNDED_RUNTIME_EVIDENCE |
| `notifications` | `GET /api/auth/notifications` | secure merchant; audience=merchant + own merchant + expiry filter | ACTIVE | BOUNDED_RUNTIME_EVIDENCE |
| `notifications` | `PATCH /api/auth/notifications/:id/read` | secure merchant; own merchant/audience | ACTIVE | BOUNDED_RUNTIME_EVIDENCE |
| `notifications` | `POST /api/auth/notifications/read-all` | secure merchant; own merchant/audience | ACTIVE | BOUNDED_HTTP_ACCEPTED_RESIDUAL_FIELD_001 |
| `notifications` | `GET/PATCH same list/individual paths in support router` | secure merchant | SHADOWED_IN_CURRENT_REQUIRED_MODE | REACHABILITY_SOURCE_REVIEW |
| `order_drafts` | No direct SQL row HTTP route identified | HTTP actor N/A pending hosted/external writer inventory | Not established | No HTTP PASS inferred |
| `processed_channel_events` | No direct SQL row HTTP route identified | HTTP actor N/A pending hosted/external writer inventory | Not established | No HTTP PASS inferred |

## CI evidence confirmed after inventory
- Notification forged tenant header/query regression: commit `e127daee58239682bca1bee3c25131ae365c89b3`; Actions run `41756073566` SUCCESS; focused suite 9 PASS, 0 FAIL.
- Management forged owner/permission header regression: commit `d3e4d71b789de9260a9781770b10f6c96500b467`; Actions run `41757360965`, job `126336513848` SUCCESS; six suites 117 PASS, 0 FAIL, including focused management 15 PASS; isolated PostgreSQL cleanup SUCCESS.
- Reuse existing conversation HTTP proof `P0-CONVERSATION-HTTP-PRIVACY-20261024.json` (10 TAP PASS). Bounded proof does not imply all field acceptance.

## Unresolved field and actor cells
- FIELD002 notifications: unknown/nonreserved response field policy, historical hosted rows, intended producer scope; candidate contract not enforced.
- FIELD003 audit_events: generic `/api/auth/admin/logs` metadata/details and incident cross-consumer projection versus `view_logs`/`view_merchants`; reuse accepted emergency/early-warning evidence.
- FIELD004 order_drafts/processed_channel_events: no direct SQL row HTTP route established; hosted/external writer and residual lifecycle inventory pending. Do not invent HTTP PASS.
- FIELD005 merchant_deletion_requests: PII identity snapshot and audit retention schedule require explicit policy, not guessed duration.
- Complete eight-table × actor × own/foreign × read/write × field × alternate-route matrix remains unaccepted. Each N/A needs source justification.

## Next executable test target
Reconcile FIELD003 `audit_events` producer metadata/details with `/api/auth/admin/logs` response for `view_logs`-only and `view_merchants`-capable actors. Identify a genuinely missing field cell before adding an actual-app PostgreSQL regression; do not duplicate accepted tests.

Canonical P0 29/45 CLOSED_SOURCE (64.4%), 7 OPEN, 9 BLOCKED; overall percentage uncertified; NO-GO.
