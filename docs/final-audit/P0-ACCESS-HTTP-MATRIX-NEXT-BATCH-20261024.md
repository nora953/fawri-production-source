## P0 actual-app management privacy accepted — 2026-10-24

Accepted executable `dd8bd690af323fd3ab65628c0fe441f5c09a566f`: **56/56 returned workflows completed SUCCESS**,0pending/failure/cancellation at acceptance. Six new bounded functional cases run through actual src/app.ts, restricted primary LOGIN and separate authentication LOGIN with mixed-case merchant IDs.

[Actual-app/management/import/deletion40098967597/job120886999544](https://github.com/nora953/fawri-production-source/actions/runs/40098967597/job/120886999544): **28 functional cases / 32 TAP PASS across4files**,0fail/skip/cancel; new actual-app6+parent=7, previous management11/import6/deletion8 retained. Actual-app cases verify authorized note projection and mutation, merchant/anonymous/unprivileged administrative denial, case/trailing-slash handling, exact path/SQL actor identity despite foreign body/query IDs, wrong-device/combined-role/legacy-credential denial with unchanged snapshots after each request, retired/unknown auth fallthrough, SQL permission/session revocation, independent owner positive, no root JSON stores and global nosniff header. Checkout `2dcfbae6ee3c3383e4c443ba35edca8508ac4747` matches executable tree `8c1009e219dd1536a4d1b5df4437b240ac97dd82`.

Two observed application defects corrected minimally: managed-surface classifier compared case-sensitively before Express case-insensitive/non-strict routes (authorized variants wrongly410); normalize only a comparison copy, preserving original IDs. Early routes accepted mixed merchant/admin cookies before the later compatibility layer's existing confusion rejection; common authenticate now rejects the same combination401 ROLE_SESSION_CONFUSION before token validation, without clearing/revoking separate sessions. Existing valid single-session operations retained. This is policy alignment, not a claim that observed acceptance required no owner credentials. No schema/grant/purge/transaction/financial-retention-policy change.

Initial b16c2ea2/run40098457152 had3functionalPASS/3FAIL (3TAP PASS/4FAIL incl parent); corrected classifier9bf269db/run40098659676 had5functionalPASS/1FAIL (5TAP PASS/2FAIL incl parent). Intermediate750dec08 superseded with same negative-case failure; cancelled broader workflows never counted asPASS. Failures and prior independent25TAP successes preserved in [P0-MANAGEMENT-FULL-APP-HTTP-20261024.json](evidence/P0-MANAGEMENT-FULL-APP-HTTP-20261024.json). No assertions weakened; negative assertions named and exact no-mutation checks strengthened. Local syntax/whitespacePASS, auth-cutover-contract10PASS/1existingSKIP (no local DATABASE_URL); CI isolated lane requires0skips.

[Full isolated40098967576/job120887080916](https://github.com/nora953/fawri-production-source/actions/runs/40098967576/job/120887080916): **92 clean invocations/90 unique files/715 TAP PASS**,0fail/skip/cancel; owned cleanupSUCCESS, identical checkout/tree to targeted lane. New targeted HTTP cases counted separately from92. All56 workflowsSUCCESS, including broader legitimate merchant/cashier/admin journeys; no blanket zero-skip claim for unrelated optional quality tests.

Full eight-table HTTP and exhaustive role/field inventory gates remain **OPEN/PARTIAL_HTTP_VERIFIED**;29CLOSED_SOURCE/7OPEN/9BLOCKED,completeP0Inventory=false. Reuses actual-app merchant/cashier and signed-Meta journeys; new proof covers only stated management projections/denials/route wiring. No whole-app-all-features, full audit-field provenance, browser/device, operator-pool, provider or hosted certification. Original b2470a3a deletion acceptance retained.

Next exact batch: reconcile notification and conversation alias/consumer paths through actual app.ts against existing router/parent-router proofs; add only missing current own/foreign field-projection/session/case/fallthrough checks. Then complete eight-table actor/field inventory, including order_drafts and processed_channel_events consumer exposure rather than assuming SQL success covers every HTTP field. Earlier PREPARED/PENDING headers are historical for this bounded accepted scope. **NO-GO**; PR550Draft/unmerged/base unchanged; no main/merge/deploy/hosted/P1/P2.

---

## Shared session-confusion guard corrected; exact-source CI pending — 2026-10-24

Candidate `dd8bd690af323fd3ab65628c0fe441f5c09a566f` adds the existing compatibility layer's combined merchant/admin session rejection to common authenticate(), before token validation. Returns401 ROLE_SESSION_CONFUSION; no session clear/revoke, schema/grants/purge/transaction changes. This aligns early actual-router behavior with existing later bridge policy. Case/path classifier correction retained. Negative requests now have labels and unchanged snapshots after each request; independent owner positive retained.

Source9bf269db/run40098659676/job120886229735 proved case routing, mixed-case IDs, authorized mutation, legacy guard and SQL revocation; only combined-session negative failed (5functionalPASS/1FAIL;5TAP PASS/2FAIL incl parent). Intermediate750dec08 showed same failure and was superseded; cancelled broader runs are not PASS. Earlierb16c2ea2 classifier failure retained separately. Local syntax/whitespace PASS; auth-cutover-contract10PASS/1existingSKIP locally (no DATABASE_URL); actual CI isolated runtime still pending. No privacy bypass claim: observed unexpected acceptance required valid owner session plus merchant cookie. FullHTTPgateOPEN/NO-GO.

---

## Actual-app classifier corrected; mixed-case identity runtime pending — 2026-10-24

Candidate `9bf269db125f071a5a2e6ae642fcbee7840a9f70` contains minimal correction750dec08: normalize a copy of req.path only for managed-surface classification to match Express case-insensitive/non-strict routes; original IDs/path stay unchanged. New fixture uses mixed-case Full-App-HTTP IDs and exact response/SQL actor assertions. No schema/grant/purge/transaction/product-policy change.

Initial sourceb16c2ea2/run40098457152/job120885517895 executed6new functional cases:3PASS/3FAIL, TAP3PASS/4FAIL including parent. Authorized case-variant reads/mutation returned410 instead of200; revoked-permission path410 instead of403. Existing management/import/deletion25TAP PASS; no observed private disclosure. This is legitimate reachability/correct-authority mapping defect, not a claim of authorization bypass. Original failure retained in evidence; no assertions weakened. Corrected source CI_PENDING;750dec08 intermediate not accepted. Last fully accepted executableb2470a3a retained. FullHTTPgateOPEN/NO-GO; no hosted/main/merge/deploy/P1/P2.

---

## Actual-app management privacy prepared — 2026-10-24

Recovery HEAD76fbd10c, accepted executableb2470a3a retained; PR550Draft/current base/unmerged verified. Existing global-merchant-postgres-http journey imports app.ts for login/catalog/cashier/report/logout, meta-full-app imports real app in isolated child for signed ingress; neither is the current private management case/legacy-fallthrough matrix. auth-cutover-path-case independently tests guard middleware, while accepted management privacy suite mounts the router in synthetic Express. Reuse those proofs; do not count new test repetition as closure.

Six new bounded cases import actual src/app.ts after restricted primary LOGIN/separate auth LOGIN setup: case-variant private reads with legitimate owner/assistant and merchant/anonymous/unprivileged denials; wrong-device/combined-role/forged-legacy denial with unchanged rows; authorized mixed-case note update binds path identity despite foreign body/query IDs and records real SQL actor; retired security and unknown legacy fallthrough denied while current route remains available; SQL permission revocation; revoked SQL session with independent owner positive and no root JSON stores. Own two-merchant fixtures and cleanup; stop actual Support startup sweep before assertions/disposal. Complete eight-table/field/browser/provider/hosted inventory remains OPEN.

No application/schema/ACL/policy changes. Add suite to existing management privacy lane, syntax check and relevant app/middleware/coordinator path triggers. Local syntax/whitespace PASS; new actual runtime PREPARED/CI_PENDING. Next inspect per-file TAP and marker, classify fixture/product failures, verify exact source/checkout tree and broader CI. NO-GO; no main/merge/deploy/hosted/P1/P2.

---

## P0 owner deletion HTTP accepted — 2026-10-24

Accepted executable `b2470a3a1e6f4a35a630e463752837771c74b96a`: **56/56 returned workflows completed SUCCESS**, 0 pending/failure/cancellation at acceptance. Seven new functional deletion cases run through actual management router, restricted primary LOGIN and separate authentication LOGIN on disposable PostgreSQL; no operator-pool execution claimed.

[Management/import/deletion run40097378176/job120882349884](https://github.com/nora953/fawri-production-source/actions/runs/40097378176/job/120882349884): **22 functional cases / 25 TAP PASS across3files**, 0 fail/skip/cancel; deletion7+parent=8, existing management11 and owner import6. Verifies owner password/session/device/origin, foreign deletion request, queued-work denial, actual target private-data purge/account tombstone/local-media removal, intact peer/blocked tenant, repeat404/no extra audit and revoked-owner denial. Checkout `825339493b8d470f92797d760694432f29e30cd8` matches source tree `bebcb78b13e5c7bdb9bbd9429d51c86dcddc2faa`.

Actual failure discovered before correction: source3da2b78e initial authorized deletion and peer/media assertions passed, but repeat returned500 instead of404. Minimal application correction uses existing MerchantManagementError for pre-capture missing/closed404 and non-suspended409; no schema/grant/purge/transaction/product-policy changes. Repeat assertion retained and exact error code added. Initial b4e8fffe active-session fixture failure and the real3da2b78e regression are both preserved in [P0-OWNER-DELETION-HTTP-20261024.json](evidence/P0-OWNER-DELETION-HTTP-20261024.json); failed parents are not independent functional cases. Local syntax/whitespace and physical-media contract1PASS.

[Full isolated run40097378250/job120882350309](https://github.com/nora953/fawri-production-source/actions/runs/40097378250/job/120882350309): **92 clean invocations / 90 unique files / 715 TAP PASS**, 0 fail/skip/cancel and owned cleanup SUCCESS, same checkout/tree as targeted lane. Targeted HTTP cases are separate from this92total. All56 workflows SUCCESS; no blanket zero-skip claim for unrelated optional quality tests.

Full eight-table HTTP and role/field inventory gates remain **OPEN/PARTIAL_HTTP_VERIFIED**; 29 CLOSED_SOURCE / 7 OPEN / 9 BLOCKED, completeP0Inventory=false. This accepts actual-router synthetic HTTP/current52-migration SQL/local-media behavior only. Financial retention duration, complete per-table PII policy, hosted object storage/ACL rollout, operator pool, whole-app middleware/browser/provider acceptance excluded.

Next exact batch: reconcile existing whole-app proofs before adding missing production-app middleware/alternate-path actor and private-field tests. Inspect app.ts authSecurityRouter ordering, enforceAuthCutoverCompatibility and enforceLegacyAuthProductionCutoverGate; verify no legacy fallthrough or foreign-field exposure with authorized positive controls. Earlier PREPARED/PENDING headers remain historical for this bounded accepted scope. **NO-GO**; PR550 Draft/unmerged, current base preserved; no main/merge/deploy/hosted/P1/P2.

---

## Owner deletion repeat error corrected; exact-source CI pending — 2026-10-24

Candidate `b2470a3a1e6f4a35a630e463752837771c74b96a` minimally returns existing typed404 MERCHANT_NOT_FOUND for missing/closed merchants and typed409 MERCHANT_MUST_BE_SUSPENDED for non-suspended capture, before manifest creation. Actual router already handles MerchantManagementError; no grant/schema/purge/transaction changes. Repeat regression still requires404, additionally exact code and unchanged SQL/media snapshots.

Prior source3da2b78e/run40081015574/job120834410716 executed7 deletion cases:6 passed; authorized initial purge, local-media removal, peer protection and single audit assertions passed, but repeat returned500 instead of404. TAP6PASS/2FAIL includes failed parent; not8 independent cases. Its55/56 broader workflow successes do not accept this source. Original b4e8fffe session-state fixture failure retained separately. Local syntax, whitespace and physical-media contract1PASS. New targeted/broader CI PENDING; last fully accepted executable remainsc0754a14. Full HTTP gateOPEN; NO-GO; no hosted/main/merge/deploy/P1/P2.

---

## Deletion fixture prerequisite correction

Initial b4e8fffe run40080821537/job120833831203: management11TAP and import6TAP PASS; deletion setup0PASS/1parentFAIL,0functional deletion cases executed. AUTH_POSTGRES_ACCOUNT_UNAVAILABLE at session issuance correctly rejects suspended accounts. Correct fixture issues sessions on active approved accounts, then suspends through actual updateMerchantStatusPostgres before request creation. No app/guard/schema changes. Earlier failure retained; corrected runtimeCI_PENDING, full gateOPEN/NO-GO.

---

## Restricted owner deletion HTTP prepared — 2026-10-24

Recovery HEADad246884, accepted executablec0754a14 retained; PR550Draft/unmerged. Selected P0-RESIDUAL-MERCHANT-PRIVACY-001/http gate remains OPEN. Reuses SEQ306–311 root-owned HTTP proof and current merchant-deletion-tenant-rls service/SQL proof. New7functional actual-router cases connect current restricted primary LOGIN+separate authentication LOGIN to real owner password/session/device/origin checks, peer request-ID mismatch, queued-work quiescence, target tombstone/private-data/local-media deletion, repeat/no extra deletion audit and revoked-owner denial. Three owned synthetic merchants: target, intact peer and blocked active-job merchant. Bootstrap only seeds/inspects/cleans; application operations retain actual LOGIN pools. This observed path uses authentication deletion authority; no operator-pool execution claimed.

Entrypoint app.ts/api/auth→auth-security→auth-merchant-management-postgres-routes POST/merchants/:id/delete→requireOwner/ownerPasswordValid→completeMerchantDeletionWithPhysicalMediaCleanup→scoped primary manifest capture→withMerchantAuthenticationTransaction quiescence/purge/tombstone/audit→post-commit local cleanup. No app/schema/ACL/provider/product-policy change. Existing old valid-password HTTP behavior is reused; new proof targets current LOGIN/grants, peer/private/media preservation and current52-migration schema. Financial-retention policy, full per-table PII inventory, object storage, whole-app/browser and hosted acceptance excluded.

Local syntax/whitespace PASS. New runtimePREPARED/CI_PENDING; do not count expected results as PASS. Next inspect targeted management lane per-file TAP/owner-deletion marker/cleanup on exact source; classify fixture vs product failures and verify broader CI before acceptance. NO-GO; no main/merge/deploy/hosted/P1/P2.

---

## P0 correction approval and owner import accepted — 2026-10-24

Accepted executable `c0754a143dc8dcb6214c66ba94bb365bd4c353d0`: **56/56 returned workflows completed SUCCESS**,0pending/failure/cancellation at acceptance. **11 newly added functional cases across two bounded batches**, with no application/schema/ACL/product-policy/provider changes. Earlier approval executablec8698263 independently completed56/56 before owner-import batch began; its evidence is retained.

- [Conversation/approval40079121573/job120828775502](https://github.com/nora953/fawri-production-source/actions/runs/40079121573/job/120828775502):21functional cases/23TAP PASS across2files,0fail/skip/cancel. Includes6new approval cases: actual own knowledge create/update, identical-question tenant isolation, resolved replay/conflict, real SQL review-write fault and sequential recovery, revoked session. Knowledge and review commits are separate; tested retry converges with one saved answer, not an atomic-single-transaction claim.
- [Management/import40079121403/job120828774803](https://github.com/nora953/fawri-production-source/actions/runs/40079121403/job/120828774803):15functional cases/17TAP PASS across2files,0fail/skip/cancel. Includes5new owner-import cases: role/device/origin denials, actual owner positive, peer/conflict preservation, exact/altered replay, real mid-transaction note-write fault rolling back earlier audit insert and recovery, revoked owner. Existing ON CONFLICT DO NOTHING behavior preserved.
- [Full isolated40079121455/job120828775095](https://github.com/nora953/fawri-production-source/actions/runs/40079121455/job/120828775095):92clean invocations/90unique files/**715TAP PASS**,0fail/skip/cancel; owned cleanupSUCCESS. Targeted HTTP suites are separate from that92total. Checkout35da677e3b2b7152d414e2ffce0e42618edbe314 shares source tree76ee69ce73d55a4dd0c5626c1794a4842693916b; both targeted lanes use that identical checkout. No blanket zero-skip claim for unrelated optional quality tests.

Evidence: [P0-CORRECTION-APPROVAL-HTTP-20261024.json](evidence/P0-CORRECTION-APPROVAL-HTTP-20261024.json), [P0-OWNER-IMPORT-HTTP-20261024.json](evidence/P0-OWNER-IMPORT-HTTP-20261024.json). Full eight-table HTTP and role/field gates remain **OPEN/PARTIAL_HTTP_VERIFIED**;29CLOSED_SOURCE/7OPEN/9BLOCKED,completeP0Inventory=false. Concurrent approval races, every import platform/limit, full-app/UI/provider/hosted acceptance are excluded.

Next exact batch: reconcile [SEQ306–311 deletion HTTP evidence](SEQ_306_311_CURRENT_MANAGEMENT_HTTP_20261013.md) with current restricted LOGIN/auth/operator roles and52-migration source. Earlier15HTTP cases (including correct-password owner deletion) used root-owned DB role/28migrations and explicitly excluded least-privilege/peer deletion proof; current service/SQL restricted-role evidence is separate. Reuse accepted observations; add only missing current actual owner deletion HTTP/password/session/peer-preservation cases. Retention policy/real object storage/hosted deletion remain separate unaccepted gates. Prior PREPARED/PENDING headers below are historical for these verified scopes. **NO-GO**; no main/merge/deploy/hosted/P1/P2.

---

## Owner import targeted acceptance

Sourcec0754a14 targeted40079121403/job120828774803 SUCCESS: new5cases+parent=6TAP, retained management10+parent=11TAP; combined15functional/17TAP PASS,0fail/skip/cancel. Source/checkout tree equality,52migrations and owned cleanup verified. Owner positive, conflict replay/peer preservation, actual mid-transaction fault rollback and retry, role/origin/device/revocation denial PASS. BroaderCI pending. Evidence [P0-OWNER-IMPORT-HTTP-20261024.json](evidence/P0-OWNER-IMPORT-HTTP-20261024.json). Earlier approvalc8698263 is accepted56/56. Full gateOPEN/NO-GO. Next missing privileged deletion HTTP after reconciling prior evidence, then full-app alternatives.

---

## Owner import batch prepared

Next independent gate scope: actual restricted-LOGIN management router POST/admin/local-data-migration owner positive creates own logs/note/channel while pre-existing peer conflicts remain byte-identical. Five new cases require role/device/origin denials, exact/altered conflict replay with no overwrites, synthetic note-write fault rolling back earlier audit insert and convergent retry, revoked-owner denial and valid assistant read. Reuses current authentication pool/session/trusted-device authority. Owned disposable PostgreSQL only; no source/schema/ACL/provider changes. New runtimePREPARED/CI_PENDING. Approvalc8698263 acceptance above is retained. Full gateOPEN/NO-GO; no main/merge/deploy/hosted/P1/P2.

---

## Correction approval exact-source accepted

Executablec8698263:56/56workflowsSUCCESS; isolated40078455748/job120826780627:92invocations/90files/715TAP PASS,0fail/skip/cancel. Targeted approval6+parent=7TAP and retained conversation15+parent=16TAP PASS; exact checkout/tree equality and cleanup verified. Evidence [P0-CORRECTION-APPROVAL-HTTP-20261024.json](evidence/P0-CORRECTION-APPROVAL-HTTP-20261024.json). Full HTTP gate remains OPEN/NO-GO. Next actual owner import positive/replay/rollback while peer conflicts remain unchanged. No source/policy/schema/provider changes.

---

## Correction approval targeted acceptance

Sourcec8698263 targeted40078455776/job120826780504 SUCCESS: new6cases+parent=7TAP, prior15+parent=16TAP; combined21functional/23TAP PASS,0fail/skip/cancel. Exact source/checkout tree verified;52migrations/owned cleanupSUCCESS. Own create/update, identical-question peer isolation, resolved replay/conflict, real review-write fault and sequential convergence, revoked session PASS. Separate knowledge/review commits remain explicit; concurrent approval and atomicity not certified. BroaderCI pending. Evidence [P0-CORRECTION-APPROVAL-HTTP-20261024.json](evidence/P0-CORRECTION-APPROVAL-HTTP-20261024.json). Full gateOPEN/NO-GO. Next owner import positive/replay/rollback, then deletion/full-app alternatives.

---

## Correction approval/knowledge isolation prepared — 2026-10-24

Recovery HEADce3d73dd, accepted executable2a0453ed retained; PR550Draft/unmerged. Gate P0-RESIDUAL-MERCHANT-PRIVACY-001/http remains OPEN. New independent attested restricted-LOGIN HTTP suite has6functional cases:4foreign/mixed review-ID denials with unchanged business/knowledge snapshots; own creation despite identical peer normalized question; own update/version increment and peer preservation; approved replay/conflicting dismissal without extra knowledge/audit/version changes; actual post-knowledge/pre-review SQL fault and convergent retry; revoked-session denial with valid peer replay. Existing15conversation cases run separately in same targeted lane.

Trace: /api conversation-operations.ts → requireMerchantSession → reviewMerchantCorrectionAuthoritative → scoped message context → applyMerchantCorrection scoped knowledge transaction → separate resolveReviewMetadata transaction. Fault injection is an owned disposable trigger rejecting only the synthetic review update after knowledge commit. The expected intermediate pending review+one durable saved answer is explicit; no atomic-single-transaction claim. Retry must reuse saved answer/version then resolve review. Embeddings/provider transport disabled; synthetic HTTP/SQL only. No app/schema/ACL/product-policy changes.

New runtime PREPARED/CI_PENDING. Local syntax/whitespace PASS. Next inspect targeted raw per-file TAP and fault-recovery marker/cleanup on containing commit; distinguish fixture vs product failure, then verify broader exact-source CI and reconcile register. Whole-role/full-app/concurrent approval/provider/hosted acceptance excluded; NO-GO; no main/merge/deploy/P1/P2.

---

## P0 populated conversation metadata accepted — 2026-10-24

Accepted executable `2a0453ed276a0b85a6e24467faf2498692ff445e`: **56/56 returned workflows completed SUCCESS**,0pending/failure/cancellation at acceptance. [Conversation HTTP40077528008/job120824032599](https://github.com/nora953/fawri-production-source/actions/runs/40077528008/job/120824032599): **15 functional cases+parent=16TAP PASS**,0fail/skip/cancel; **5 new populated-metadata cases** and6synthetic messages. Checkout4410cc8015e9825e39f0e84f5ef46b233dc8ef79 matches tree06b6b7b2b2c33886c3eea34c9a59b1b1e729ec45. New tests verify exact own correction/image/knowledge/learning projection through list aliases/detail, real foreign/mismatched correction IDs denied without SQL changes, authorized dismissal/replay with UI review status/peer metadata retained, malformed decision/context denial, and revoked-session denial. No application/schema/ACL/product-policy/provider changes.

[Broader isolated40077528124/job120824033716](https://github.com/nora953/fawri-production-source/actions/runs/40077528124/job/120824033716):92clean invocations/90unique files/**715TAP PASS**,0fail/skip/cancel. Conversation tests run separately from that92total. Signed-native first job120824032355 timed out before browser prerequisites (browser=null/results=[]), after24signing unitsPASS. Exactly one scoped retry120824279721 succeeded on identical checkout: Chrome155.0.8059.39,8native casesPASS and24signing unitsPASS. Original failure retained; no assertion/timeout changes. Synthetic native ACK still does not prove server sync or physical-device acceptance.

Evidence [P0-CONVERSATION-METADATA-HTTP-20261024.json](evidence/P0-CONVERSATION-METADATA-HTTP-20261024.json). Previous e8bc8b06 proof is retained separately. Full HTTP and role/field gates remain **OPEN/PARTIAL_HTTP_VERIFIED**;29CLOSED_SOURCE/7OPEN/9BLOCKED,completeP0Inventory=false. Production-shaped fixture projection is not execution/certification of every metadata producer, arbitrary-field allowlist, successful correction approval/knowledge creation, audio/video, whole app, UI/browser, provider or hosted environment.

Next exact batch: actual PostgreSQL/HTTP **successful correction approval with knowledge isolation**. Trace conversation-operations → reviewMerchantCorrectionAuthoritative → applyMerchantCorrection; require legitimate own saved-answer creation/update and approval projection, peer records unchanged (including identical normalized questions), exact replay/no duplicates and conflicting review denial. Use disabled embeddings/providers and owned synthetic fixtures. Then privileged import/deletion and full-app alternate paths. Prior PREPARED/PENDING notes below are historical for this accepted scope. **NO-GO**; no main/merge/deploy/hosted/P1/P2.

---

## Populated metadata targeted acceptance

Source2a0453ed: run40077528008/job120824032599 SUCCESS,15 functional cases+parent=16TAP PASS,0fail/skip/cancel; five newly added metadata cases PASS. Exact checkout/tree verified,52 migrations and owned cleanup SUCCESS. Evidence: [P0-CONVERSATION-METADATA-HTTP-20261024.json](evidence/P0-CONVERSATION-METADATA-HTTP-20261024.json). Broader CI pending. Initial signed-native job120824032355 failed browser prerequisite timeout before0browser assertions;24signing units PASS. One scoped failed-job retry requested; no assertions/timeouts changed. Preserve first failure. Full gate remains OPEN/NO-GO. No app/schema/ACL/provider change.

---

## Populated conversation metadata HTTP batch prepared — 2026-10-24

Recovered HEADcc621084; accepted executablee8bc8b06 retained. Gate P0-RESIDUAL-MERCHANT-PRIVACY-001/http remains OPEN. Five new actual-SQL/router cases add six synthetic messages with production-shaped correction/image/knowledge/learning metadata. Require exact own projection on list aliases/detail, real foreign/mismatched correction-ID denials and unchanged SQL, legitimate dismissal/replay/conflict behavior retaining UI correction_review.status and sibling metadata, malformed decision/context refusal, revoked-session read/review refusal and legitimate peer access.

Trace: conversation-operations.ts uses requireMerchantSession; postgresManualConversationAuthority mapMessage projects scoped metadata; merchantCorrectionReview loads merchant+conversation+message context and updates correction state in merchant-scoped transactions. Current UI reads correction_review.status. Fixture setup/bootstrap only; actual operations use restricted primary LOGIN/separate authentication LOGIN. No application, schema, ACL, redaction/product-policy or provider changes. Media fixture covers image provenance only, not live media/provider processing or every possible metadata field. Authorized approve/knowledge creation, full-app/alternate paths and whole-role privacy remain unaccepted.

Local syntax/whitespace PASS; new runtime PREPARED/CI_PENDING, not accepted. Exact next: inspect targeted P0 conversation privacy HTTP matrix raw TAP/cleanup on containing commit, classify fixture vs product failures, verify relevant broader CI and update register. No hosted/main/merge/deploy/P1/P2; NO-GO.

---

## P0 corrected manual conversation source fully verified — 2026-10-24

Accepted executable `e8bc8b060d7f4ead1f8b19c447ae17bead436a42`: **56/56 workflows completed SUCCESS**,0pending/failure/cancellation at acceptance. Targeted [conversation HTTP40076278947/job120820201546](https://github.com/nora953/fawri-production-source/actions/runs/40076278947/job/120820201546): **10 functional cases+parent=11TAP PASS**,0fail/skip/cancel. Checkout124dbc3db19f3ead88235c71cea1512b0161bfb3 matches source treecca16927b147185a44f97a9fc3fc7b9161a1282c. [Full isolated40076279113/job120820201771](https://github.com/nora953/fawri-production-source/actions/runs/40076279113/job/120820201771): **92clean invocations/90unique files/715TAP PASS**,0fail/skip/cancel; owned container cleanup SUCCESS. Targeted conversation cases run separately from that92 total. Quality/security/schema/native/remaining workflows SUCCESS; no blanket zero-skip claim for unrelated optional quality tests.

Minimal production-path correction compares the stored conversation_id and message hash before returning an existing manual reply request. Keeps merchant-wide idempotency uniqueness, error code and legitimate replay; no schema/grant/provider/credential change. New actual-SQL HTTP regression confirms rejection for a different own conversation with unchanged SQL; valid same-conversation replay and prior privacy/recovery cases still PASS. Standalone pre-fix regression793f264b had no observed run before correction: no pre-fix runtime failure claimed. Local TypeScript syntax/whitespace and operational-boundary contract1PASS. Earlier8c070aee nine-case/56CI evidence and745f74ef management/notification evidence retained separately.

Evidence [P0-CONVERSATION-HTTP-PRIVACY-20261024.json](evidence/P0-CONVERSATION-HTTP-PRIVACY-20261024.json) preserves original proof and corrected followup. Full HTTP and complete role/field gates remain **OPEN/PARTIAL_HTTP_VERIFIED**;29CLOSED_SOURCE/7OPEN/9BLOCKED,completeP0Inventory=false. This accepts only the tested conversation privacy/recovery and replay-binding contract, not provider sending, operator reconciliation UI, whole-app, hosted, device or whole-P0 release requirements.

Next single actionable batch: populated correction/media/learning metadata HTTP fixtures against actual PostgreSQL, after reconciling producer fields and ConversationsPage correction_review.status consumer; prove own projection/foreign and stale-session denial before any projection change. Then privileged import/deletion and full-app/alternate consumers. Prior PREPARED/PENDING/next-test headers below are historical and superseded only for this verified scope. **NO-GO**; no main/merge/deploy/hosted/P1/P2.

---

## Populated metadata follow-up trace (source only)

Current writers identified: postgresMetaAutoReplyIntent.ts adds knowledge stage/source/reason/confidence, grounding/matched/source-message/training IDs and handoff flag; inbound media shape includes content kind/attachment count/identity hash, with scoped image/audio provenance updates. metaVideoReplyGrounding.ts adds scoped video observation/hash/frame count/provider/model/alternatives. postgresManualConversationAuthority.ts writes correction_review and learning reason/request/answer IDs; merchantCorrectionReview.ts updates the scoped correction state. ConversationsPage.tsx currently consumes metadata.correction_review.status. This is a bounded source trace, not proof that every producer/field is inventoried or that arbitrary metadata is approved for disclosure.

Next single actionable batch after candidate CI acceptance: add populated correction/media/learning metadata fixtures to the actual PostgreSQL conversation HTTP matrix; verify legitimate own projection and foreign-route/session denial without deleting required correction UI state. Reconcile actual producer fields first; do not introduce a blanket metadata redaction policy from an empty fixture. Then continue privileged import/deletion and full-app/alternate consumers. Complete actor/field gate remains OPEN.

---

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
