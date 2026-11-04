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

## FIELD003 bounded runtime checkpoint — 2026-11-04
- Commit `ccc0a695f8a4146f732fd536c14e234c4ca07ade` added actual HTTP + disposable PostgreSQL regression `view_logs alone does not expose merchant incident records` in `artifacts/api-server/tests/merchant-management-privacy-http-postgres.integration.test.mjs`.
- GitHub Actions `P0 management privacy HTTP matrix` run `41758815504`, job `126341301468`: SUCCESS; new subtest `ok 10`; focused suite 16 PASS/0 FAIL, six suites **118 PASS/0 FAIL** (80+16+6+14+1+1); cleanup SUCCESS.
- This proves one missing incident record boundary. It does **not** settle generic audit metadata/details field policy, all eight tables, hosted acceptance, or FIELD003 as a whole. Gate stays OPEN, P0 29/45, NO-GO.

## FIELD003 ordinary-audit positive preservation — 2026-11-04
- Commit `53c15255b041529a5db44d47b253d0c59a1aec04` added mounted HTTP regression `ordinary audit remains readable after merchant incident filtering`.
- GitHub Actions `P0 management privacy HTTP matrix` run `41759404801`, job `126343235150` SUCCESS: focused suite **17 PASS / 0 FAIL**, six suites **119 PASS / 0 FAIL** (80+17+6+14+1+1). New subtest `ok 11` in logs.
- This is bounded positive preservation alongside earlier incident exclusion. No claim of generic audit metadata/details policy closure, eight-table acceptance or hosted GO. Gate OPEN; P0 29/45, NO-GO.

## FIELD003 metadata HTTP regression pending CI — 2026-11-04
- Source commit `db117422c6bd2c6b693e721e9f818f1597665f0f` adds `audit metadata is restricted to permitted readers` to actual management HTTP suite.
- GitHub Actions management matrix run `41760160353`, job `126345695351`: **IN_PROGRESS at observation**, not accepted as PASS. Isolated PostgreSQL engineering run `41760160340`: PENDING at observation.
- Acceptance condition: confirm test TAP success, zero failures, disposable database cleanup; only then add bounded field evidence. Do not close FIELD003 or the eight-table gate from this test alone.
