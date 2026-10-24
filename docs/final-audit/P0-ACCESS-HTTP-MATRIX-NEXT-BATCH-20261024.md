## P0 conversation-bound manual replay correction — 2026-10-24

Candidate `e8bc8b060d7f4ead1f8b19c447ae17bead436a42` adds a minimal source guard: compare persisted conversation_id and text hash before returning an existing manual reply. Merchant-wide idempotency uniqueness/error code and authorized own replay preserved; no schema/grant/provider/credential change. Regression793f264b was saved but no standalone pre-fix run was observed; no red baseline claimed.

Targeted [run40076278947/job120820201546](https://github.com/nora953/fawri-production-source/actions/runs/40076278947/job/120820201546) SUCCESS:10 functional cases+parent=11TAP PASS,0fail/skip/cancel;52migrations and owned cleanup SUCCESS. Includes cross-conversation key rejection, unchanged SQL, valid replay/return and all nine prior privacy/recovery cases. Checkout124dbc3db19f3ead88235c71cea1512b0161bfb3 matches source treecca16927b147185a44f97a9fc3fc7b9161a1282c. Local TypeScript syntax/whitespace and operational-boundary contract1PASS. Broader exact-source CI PENDING; do not yet mark the whole corrected executable accepted.

Previous executable8c070aee completed56/56 workflows SUCCESS; isolated40075632085/job120818236391:92invocations/90unique/715TAP PASS,0fail/skip/cancel. Prior745f74ef evidence retained. [P0-CONVERSATION-HTTP-PRIVACY-20261024.json](evidence/P0-CONVERSATION-HTTP-PRIVACY-20261024.json) preserves baseline and corrected targeted proof separately. Full HTTP/role/field gate remains OPEN;29CLOSED_SOURCE/7OPEN/9BLOCKED,completeP0Inventory=false. Next verify broader candidate CI; then populated message.metadata/audit field matrix, successful privileged import/deletion and full-app/alternate-path proofs. Existing UI reads correction_review.status; source media/learning provenance fields require explicit reconciliation before any projection change. NO-GO; no hosted/main/merge/deploy/P1/P2.

---

## P0 conversation HTTP bounded acceptance — 2026-10-24

Executable `8c070aee75f67f1d1efcad525a0467baf8b45954`; run40075632155/job120818236959 SUCCESS,9 functional cases+parent=10TAP PASS,0fail/skip/cancel. All52 committed migrations and owned cleanup succeeded. PR checkout c998dc00293c3b2abb7adeb804e243340ae1c060 and source have identical tree20b4d647fa87d3142233c5f247aa01e273313377. Evidence: [P0-CONVERSATION-HTTP-PRIVACY-20261024.json](evidence/P0-CONVERSATION-HTTP-PRIVACY-20261024.json). This supersedes the conversation PREPARED section below only within its tested scope. Broader exact-source CI still pending at this checkpoint.

Two tenants/real SQL sessions/restricted LOGIN:12 foreign read/mutation/correction denials with unchanged SQL; anonymous/admin-cookie, wrong-device, role-confused cookie and revoked session denial; legitimate list aliases/detail/takeover; pending/uncertain return refusal; failed/sent return success; exact delivered HTTP replay and changed-content rejection. No provider send or credentials. Uncertain-to-failed reconciliation uses explicit fixture SQL; this is not implemented operator recovery. Whole HTTP gate remains OPEN.

### Bounded field and alternate-path reconciliation

| Surface | Source projection/authority | Evidence and remaining condition |
| --- | --- | --- |
| Conversation list + merchant-ID alias + detail | postgresManualConversationAuthority mapConversation: id,merchant_id,platform,page_id when present,customer_name,customer_handle,status,assigned_to_human,needs_training,updated_at,messages. Read via merchant-scoped transaction joined to own channel. | New own/foreign HTTP tests verify both aliases/detail and ignore foreign query hints. Raw manual request rows/hashes/keys are not part of mapConversation. Not every field has a populated fixture assertion. |
| Conversation messages | mapMessage: id,external_message_id when present,conversation_id,sender,text,created_at,counted_as_auto_reply,reply_type/status when supported,metadata object when present. | Delivered replay/own detail positive proof; raw request key/hash absent. Arbitrary message.metadata privacy allowlist is NOT certified by a fixture containing empty metadata. Keep field inventory OPEN. |
| Manual request state | status/idempotency/hash used internally by return guard and prepare/complete/fail SQL services; no direct request-row HTTP endpoint in conversation-operations.ts. | pending/uncertain block return; confirmed failed/sent permit return. Recovery transitions are service/fixture level, not provider or operator workflow acceptance. |
| Correction review | POST /conversations/:conversationId/messages/:messageId/correction-review; actual review service scopes merchant+conversation+sent merchant-message. | Foreign request404 included; complete authorized approve/dismiss/training/metadata matrix not newly accepted. |
| Parent middleware | app.ts mounts retention access, OAuth callback access, operational access, catalog session before /api conversation router. Router uses requireMerchantSession itself. | Source ordering inspected; new harness executes router+real session middleware, not those parent guards. No whole-app acceptance claimed. |
| SQL order_drafts/processed_channel_events | Current API TypeScript search finds tenant purge in postgresMerchantManagementAuthority plus readiness declaration; no direct active SQL HTTP reader/writer found. | Preserve existing SQL isolation/lifecycle evidence. Source absence is not runtime/provider-pipeline acceptance; legacy memory draft map and durable Meta queue are separate representations. |

Exact next: reconcile populated message.metadata/audit field projections, successful privileged import/deletion and full-app/alternate consumers against accepted tests. Add missing positive/negative runtime proof only where a live path and acceptance condition are identified. Do not repeat these nine cases merely for counts; do not close the full eight-table or complete P0 role/field gate. **NO-GO**.

---

## P0 manual conversation HTTP privacy/recovery prepared — 2026-10-24

Recovery HEAD `b3be73ef94e0c576633f5d18679b23386a0da1ae`, Draft PR550 open/unmerged. Prior accepted executable745f74ef/55 successful workflows retained. Gate `P0-RESIDUAL-MERCHANT-PRIVACY-001/http` remains OPEN.

New attested actual-router test uses two synthetic merchants, real SQL sessions, restricted primary LOGIN and separate authentication LOGIN. Nine functional cases cover list aliases/detail projection, owner/anonymous/role-cookie/device/session denial, foreign read/mutation/correction paths with unchanged SQL, own takeover, pending/uncertain return refusal, failed/delivered recovery, sent-message HTTP replay and changed-content rejection. Existing SQL services perform completion/failure; fixture SQL explicitly reconciles uncertain to failed. No provider send, credentials, production policy or application change. This is not an implemented operator reconciliation UI or whole-app/complete eight-table acceptance.

Changed: manual-conversation-privacy-http-postgres.integration.test.mjs; targeted p0-conversation-privacy-http.yml; explicit owned-runner selector. Syntax/whitespace PASS locally; runtime PREPARED/CI_PENDING, no PASS counted. Required acceptance: all runtime cases zero fail/skip/cancel, owned cleanup succeeds, raw marker/TAP and exact-source CI reconciled. Next inspect targeted Actions results, classify fixture vs product failures, then continue alternate-route/field inventory. Hosted BLOCKED; NO-GO; no merge/deploy/P1/P2.

---

# Current bounded result — 2026-10-24

Gate OPEN / PARTIAL_HTTP_VERIFIED. Executable745f74ef:55/55 workflows SUCCESS. Management10 functional cases+parent and notification6+parent PASS, no targeted fail/skip/cancel. Detailed evidence: [P0-RESIDUAL-HTTP-PRIVACY-20261024.json](evidence/P0-RESIDUAL-HTTP-PRIVACY-20261024.json). Source map below is bounded; complete field/role/alternate-path inventory remains OPEN. Latest PROGRESS header governs current status; earlier recovery/PREPARED text below is historical. Next missing actual-SQL conversation HTTP contract is at the end. **NO-GO**.

---

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


## Exact next missing runtime contract

The existing `manual-conversation-operations.integration.test.mjs` builds/starts the actual server but seeds legacy merchant/runtime JSON. Preserve its accepted evidence; do not count it as restricted PostgreSQL manual-reply HTTP proof. Next add an attested disposable actual-LOGIN test of mounted `conversation-operations.ts`: two merchants; own list/detail/takeover positive controls; foreign path/list/detail/takeover/return/messages deny without SQL changes; pending/uncertain request refuses return while a peer's request cannot block own recovery; failed/delivered reconciliation permits legitimate return; raw idempotency/hash fields stay private; revoked merchant session stops reads/writes. No actual provider send, transport, hosted services or speculative sequencing/policy repair. Whole-app middleware and complete subsystem audit projections remain explicit follow-ups.
