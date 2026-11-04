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
- FIELD002 notifications: source-side field minimization now enforced and tested for 12 known types, extras and unknown types; historical hosted rows, custom consumers and intended producer scope remain unaccepted.
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

## FIELD003 audit metadata access regression accepted — 2026-11-04
- Commit `db117422c6bd2c6b693e721e9f818f1597665f0f`; management HTTP matrix run `41760160353`, job `126345695351` **SUCCESS**.
- `audit metadata is restricted to permitted readers`: `ok 12`; focused suite **18 PASS, 0 FAIL**. Six suites **120 PASS, 0 FAIL, 0 SKIP** (80+18+6+14+1+1); post-job cleanup observed.
- Bounded conclusion: permitted log reader sees a synthetic admin-log metadata field; nonpermitted assistants and merchant actor receive HTTP denial. This does **not** establish metadata allowlist/redaction across all audit producers, hosted historical data, or complete FIELD003 closure. Gate remains OPEN and release NO-GO.

## FIELD002 per-type notification response minimization — 2026-11-04
- Defect: canonical merchant notification responses copied all non-reserved stored `variables`, including keys outside each recognized notification shape; unknown historical types also exposed stored extension keys. Tenant-level SQL protection remained intact but field minimization was absent.
- Source fix `0c216cf62ec883b6f89d48af66b5ff92bb5fc358`: project only canonical `id/type/created_at/read_at` plus the exact type-specific keys of the previously reviewed 12-type `responseFieldContract` in `P0-NOTIFICATION-PRODUCER-FIELD-MAP-20261025.json`. Unknown types retain canonical fields only, with existing frontend rejection semantics. Inspection lifecycle is still derived from the owned request before filtering. No schema, stored variables, read mutation or retention changes.
- Regression `b412261821416b520d2bab436e0bb3c4acc55b3a`: actual authenticated HTTP + disposable PostgreSQL two-tenant check of recognized fields, extra stored variables, unknown types, own/foreign read, read-at and unchanged stored JSON.
- Expected compatibility break was **not hidden**: earlier runs `41761469572` and `41761546629` failed because three historical suites asserted nonreserved extension keys should be exposed. Test alignment `d0c44616f11911018f81ebc811fdb54a1c8c420d` retains tenant/read/replay/SQL immutability checks and explicitly asserts those extra keys are absent.
- **Accepted bounded CI**: `P0 notification privacy HTTP matrix` run `41762196223`, job `126352213805` SUCCESS, **88 PASS / 0 FAIL** across six suites (31+5+27+6+9+10); new projection regression `ok 6`. Post-job cleanup observed.
- Compatibility scope: this deliberately supersedes the old *extension-field preservation* expectation on the selected source branch, not the historical evidence that described previous behavior. Full historical/hosted writer inventory, custom clients, and FIELD002 producer provenance remain unresolved; no hosted validation, full-field closure, or release approval. **Gate OPEN / NO-GO**.

## FIELD002 inherited historical notification-type resilience — 2026-11-04
- Existing `NOTIFICATION_RESPONSE_VARIABLE_FIELDS[String(notification.type)] || []` read inherited `Object.prototype` properties for unknown `notifications.type` values `constructor`, `__proto__`, `toString`. These values are not arrays; the response mapper would throw while projecting the entire authenticated list. This is a bounded availability/response contract defect, not evidence of cross-tenant data exposure or known hosted exploitation.
- Source fix `951cd26abce54dcb5e5c617dbca973fee3ec1cec` requires an **own** type-contract property before iteration; unknown names retain only canonical identity/timestamps without exposing stored variables, consistent with the accepted FIELD002 response projection. No schema, SQL read/write, read marker, merchant scope, or stored variable mutation.
- Authenticated full-app disposable-PostgreSQL regression `7e1382116ff1f764cc39585265345b66a98b5f3e` covers list with a recognized row, ordinary unknown row, and three inherited-name unknown rows; canonical-only shape; own read/timestamp; unaffected foreign denial and unchanged persisted variable JSON. This closes only the named unknown-type mapper failure scenario.
- Evidence: [notification privacy HTTP run 41765464219](https://github.com/nora953/fawri-production-source/actions/runs/41765464219), job `126362670422` **SUCCESS**, six suites **88 PASS, 0 FAIL, 0 SKIP, 0 CANCELLED** (31+5+27+6+9+10), syntax/checkouts/disposable PostgreSQL/cleanup **SUCCESS**.
- Reviewed all 12 source type-key arrays against `P0-NOTIFICATION-PRODUCER-FIELD-MAP-20261025.json#responseFieldContract.types`: exact key and order match, 12/12. This is source reconciliation, not a new runtime test or browser/hosted proof.
- Remaining **FIELD002-R2**: authorized hosted historical rows/external writer and custom-consumer verification; **FIELD002-R3**: source and policy scope of direct new-order SQL helper and three legacy-only subscription types. **FIELD002 and parent gate remain OPEN**, known register **29 CLOSED_SOURCE / 7 OPEN / 9 BLOCKED**, `completeP0Inventory=false`, `overallPercentage=null`, **NO-GO**. Full-commit CI beyond the targeted lane remains separately checked; do not equate targeted success with global acceptance. No merge/deploy/provider/hosted access.
