# CASHIER-SYNC-SEQUENCE-001 — recovery contract candidate

Status: CONCRETE_DESIGN_REVISION_1_WITH_SEQ_D1_INTERNAL_READ_ONLY_ACCEPTED_REMAINING_PROTOCOL_NOT_IMPLEMENTED_NOT_RELEASE_ACCEPTED. Gate OPEN; release NO-GO. This document authorizes no financial/timeline repair, tombstone, device reset, production write or hosted rollout. A diagnostic PASS is not recovery acceptance.

## Current source path

`cashierIndexedDbAuthority.ts` consumes a shared device sequence for sales and manual inventory adjustment; adjustment writes its own inventory movement/outbox envelope. Pending envelopes are sorted by device sequence. Both `cashierOperatorCloudSync.ts` and `cashierCloudOutboxSync.ts` stop on unsupported operations instead of silently skipping them; operation ACK follows accepted/idempotently replayed response. This is a source trace, not new native-browser fault execution.

The canonical sale and compensation services serialize each merchant/device with an advisory transaction lock, then call `recordCashierOperationTimelineInTransaction`. Exact matching sequence identity is replayable. A new sequence greater than the existing maximum can be accepted with a gap; a later missing sequence at or below that maximum is rejected. The old SQL helper diagnostic observes accept1/accept3/reject2. The new canonical sale-service diagnostic separately measures financial/stock effects and peer/replay preservation; its execution result must be read from the evidence checkpoint, not inferred from this source description. No HTTP or client outbox proof is claimed by that service test.

## Decisions to adopt before changing admission

| Option | Required semantics | Main unresolved requirement |
|---|---|---|
| Contiguous admission across every sequence-producing operation | Hold a future sequence until missing real operations or explicitly authorized non-commerce records have been validated | A supported, authenticated contract for manual adjustment and every other sequence producer; starting/checkpoint semantics for existing devices |
| Controlled historical backfill | Validate late operation identity, historical authority, time, dependent sale/return/void and stock/accounting effects before committing once | A reviewed financial ordering/recovery model; accepting a number into a gap alone is unsafe |
| Explicit reconciliation hold | Preserve unresolved operation and later local queue, expose a durable reason and require reviewed reconciliation | Complete operator workflow and recovery authority; current permanent rejection alone does not close this gate |

The option comparison is retained as background. The concrete proposed direction below selects versioned contiguous admission for future verified streams and explicit reconciliation hold for ambiguous legacy state; it is not implemented or release accepted. Simply replacing the server check with `max+1` can strand legitimate non-commerce gaps; simply deleting the backwards check can change financial ordering. Neither patch is authorized by this candidate.

## Required invariants for any adopted option

- Never acknowledge, delete or silently drop a locally committed sale, return, void or inventory adjustment merely to close a numeric gap.
- Exact authenticated merchant/device/station/operation identity and immutable payload match are required for replay. A changed payload or reused sequence cannot receive an ACK for a different operation.
- Ambiguous transport after server commit retains the local operation until exact replay ACK; repeated retries create no duplicate order, stock mutation, payment or compensation.
- A recovery/tombstone record cannot be supplied as an untrusted permission to bypass a missing financial operation. Any non-commerce record needs its own authorized schema, immutable identity, allowed purpose and audit.
- No synthetic sale, stock delta, sequence reset or peer timeline rewrite. Preserve tenant, station, historical entitlement and current negative-stock/clock checks.
- Define first-device sequence, restart/restore checkpoint, missing envelope/window boundary, concurrent same-device submission and different-device stock behavior explicitly.

## Required executable acceptance matrix

| Case | Required observation |
|---|---|
| Ordered1,2,3 and exact retries | Correct durable state, complete ACK identity and zero duplicate effect |
| Arrival1,3 then2 | Chosen contract is explicit; no permanently lost real operation, no partial financial writes |
| Real non-commerce2 between sales1 and3 | Correct authenticated handling or durable reconciliation hold; never silent skip |
| Server commit with lost ACK, restart then retry | Exact replay ACK, one durable effect, local envelope cleared only after that ACK |
| First request fails before commit | Full selected SQL rollback; queue and later operations preserved in native IndexedDB |
| Altered identity/payload, foreign tenant/device/station | Denial without own/peer mutations or leaked ACK |
| Same-device overlap and different-device final-stock race | Observed SQL overlap, exact winner/loser semantics and no double stock consumption |
| Historical backfill involving return/void or revoked entitlement | Adopted dependency/time/authority rules and accounting reconciliation enforced |
| Backup restore/missing envelope/expired local authority | Defined recovery behavior without sequence reuse, forged proof or blanket ACK |

Acceptance requires native IndexedDB/browser fault tests, canonical HTTP with real session/device binding, restricted-role SQL, exact-source broader CI, and separately authorized hosted rollout evidence. Existing service diagnostics are reused only at their own proof layer.

Accepted diagnostic execution: [exact-source service/SQL evidence](evidence/P0-CASHIER-SEQUENCE-SALE-DIAGNOSTIC-20261026.json), source `e14ca5301d6b4da8a93c93b19cf9c58302d51a41`,56/56CI and722TAP. Canonical service observation confirms accept1/accept3/reject2; recovery remains OPEN. No new browser/HTTP/hosted proof is supplied by this document.

Native client layer now has bounded [Chromium outbox hold/lost-ACK/reload evidence](evidence/P0-CASHIER-NATIVE-OUTBOX-20261026.json) at `b7b73221ddeb92af05b9b63f32d4c48fe19f3ea6`: real IndexedDB and drain clients, synthetic fetch ledger/operator context. This covers native persistence/replay/unsupported-operation hold within the recorded limits; it is not a real server transaction, canonical HTTP authorization or an adopted recovery contract. Gate remainsOPEN.

## Bounded producer and reachability reconciliation

This is source reconciliation of the reviewed `artifacts/fawri/src` TypeScript tree, not a theorem about dynamic, external or historical writers. Both counter helpers read/write `meta.device_sequence`; the reviewed calls are:

| Local method | Payload/outbox | Current server/drain support | Caller evidence boundary |
|---|---|---|---|
| `cashierIndexedDbAuthority.commitSale` | Sale plus stock movement, one shared sequence | Sale route/timeline kind supported | Real client and service/HTTP proof layers recorded separately |
| `cashierCompensationAuthority.returnSale` | Return plus stock movement | Return compensation route/timeline kind supported | Existing compensation proofs retained within their original scope |
| `cashierCompensationAuthority.voidSale` | Voided sale plus stock movement | Void compensation route/timeline kind supported | Existing compensation proofs retained within their original scope |
| `cashierIndexedDbAuthority.adjustInventory` | Nonzero stock delta plus movement-only envelope | Unsupported by reviewed commerce drain/timeline kind | Direct caller identified in backup-sequence regression and native-browser fixture; no production UI caller established by this bounded review |

The dashboard functions also named `adjustInventory` use remote catalog/inventory HTTP APIs (`adjustCatalogInventory` or `/api/inventory/products/:id/adjust`). Name matching does not establish use of the local IndexedDB sequence method. Historical/imported/dynamic outboxes are not inventoried here. The current SQL timeline CHECK and TypeScript operation kind accept sale/return/void only. Do not add an unused manual-adjustment sync product feature merely to satisfy a synthetic diagnostic; first settle the intended local API and existing-data contract. Do not discard a real queued movement on the assumption that no UI caller was identified.

Remaining adoption decisions are finite:

- **SEQ-R1 OPEN_DESIGN:** choose explicit future-gap and late financial-operation semantics, including sale/return/void dependencies and idempotent rejection/retry/hold behavior. Existing observed rejection is not recovery approval.
- **SEQ-R2 OPEN_PRODUCT_CONTRACT:** decide intended lifecycle of the local manual-adjustment API and retained movement-only outboxes. A nonzero stock delta cannot be converted to a harmless numeric tombstone. Any supported upload requires authorized merchant/device/station/branch, inventory permission, immutable operation identity and exactly-once stock handling.
- **SEQ-R3 OPEN_DESIGN_AND_HISTORICAL_SCOPE:** define first-device/checkpoint/restore semantics and authorized reconciliation of existing gaps. No reset, guessed baseline, automatic historical backfill or hosted-data repair is accepted by source tests.

The HTTP diagnostic and fault results must be read from their exact-source evidence after execution; this source table itself makes no runtime/CI claim and adopts none of these decisions.

Accepted operator HTTP layer: [exact-source gap and post-commit attribution fault/retry evidence](evidence/P0-CASHIER-SEQUENCE-OPERATOR-HTTP-20261026.json), source `0c98d71f6ced72f6cc1d506050b63319afc15b06`,56CI/27targeted/723broader TAP. Real login/station credentials and SQL financial snapshots are verified through mounted actual routers. This strengthens the HTTP/retry layer without adopting recovery, proving full-app/browser integration or repairing historical gaps.

## Concrete proposed protocol v2 — design revision1

This section supersedes the earlier neutral option menu. The proposed engineering direction is **contiguous admission for a verified device stream, exact replay first, and explicit hold for ambiguous legacy state**. Automatic historical backfill is excluded from this revision. This is a concrete implementation design, not an adopted runtime policy, migration, new endpoint, financial repair or release approval. Existing v1 behavior stays unchanged by this document. Source reviewed: `ede1f101`; last accepted executable: `0c98d71f`.

### Server identity and checkpoint

A server-generated stream ID binds an authenticated merchant and physical device identity. It is independent of operator login, shift, station-token rotation and subscription renewal: those actions must not reset or advance its checkpoint. Current station/location authority and historical operator attribution remain independently validated for every operation. Re-pairing, device replacement or branch transfer cannot silently give an existing stream a fresh zero; use an explicit transfer/enrollment review preserving the old receipts and location provenance.

Proposed additive server records (names are design placeholders, not existing schema):

| Record | Required fields/invariants |
|---|---|
| Device stream | server stream ID, merchant ID, device ID, protocol version, state, last contiguous applied sequence, provenance/review reference, row version, timestamps; unique active stream per merchant/device |
| Operation receipt | stream ID, sequence, immutable operation ID/kind, versioned canonical request digest, original historical station/location/authority linkage, applied result identity; unique stream/sequence and stream/operation ID |
| Reconciliation state | stable reason and evidence references; never an ACK, sequence consumption, stock mutation or substitute sale |

The receipt and contiguous checkpoint advance in the **same core financial transaction** as order/compensation/inventory application. Keep the existing merchant/device advisory serialization, then lock the stream row in one consistent order across sale/return/void. A same-device request cannot observe a checkpoint advanced without its core receipt/effect. Different devices retain existing branch stock locks and negative-stock behavior. No triggers, grants, historical migrations or schema are changed here; any future table needs tenant/privacy/readiness/migration snapshot coverage before runtime use.

Use a versioned server canonical digest after normal request validation and operator cost-evidence preparation. Do not hash rotating operator/station bearer tokens into immutable business identity. Do not assume the legacy timeline already stores that digest: the reviewed sale core separately checks `metadata.cashier.request_hash`; compensation and receipt coverage must be reconciled explicitly before legacy adoption. Client-provided digest/stream ID cannot grant authority.

### Enrollment and legacy classification

| Server/client situation | Proposed disposition |
|---|---|
| Authenticated device with independently reconciled absence of prior applied operations; complete local queue starts at1, or local counter0/empty queue | Server establishes verified checkpoint0; client cannot submit an arbitrary baseline. Empty timeline alone is insufficient if order/compensation evidence is unresolved |
| Authoritative device history is contiguous1..N, every operation has matching trusted result/digest provenance, local pending state is compatible | Candidate for checkpointN after explicit compatibility/adoption checks; MAX alone is not proof |
| Known history has gaps, starts above1, has inconsistent receipts, reused identity, unsafe numeric sequence or unknown origin | RECONCILIATION_REQUIRED; no automatic checkpoint import, rehash, backfill or deletion |
| No trustworthy server history but local counter/queue begins above1 | Preserve local state and hold; no client-selected baseline, reset or acknowledgement |
| Local restored counter is below server checkpoint, pending payload differs from server receipt, or operation envelopes are incomplete | Preserve records, block new sequence allocation/upgrade and require reconciliation; never advance local counter merely to hide missing work |
| History inspection exceeds a bounded assessment window | HISTORY_REVIEW_REQUIRED with no upgrade eligibility; do not treat a prefix or timed-out query as complete history |

For a local counterM and server checkpointN, supported unacknowledged operations aboveN must form a complete, strictly ordered N+1..M stream. Pending operations at/belowN can clear only on their own exact verified replay ACK. Local queue/counter inspection is a compatibility check, not server authority: a browser assertion cannot prove prior financial history or authorize a baseline. Never delete acknowledged local sales or pending envelopes to make these equations true.

### Deterministic admission and ACK order

The following applies only after a verified stream is enrolled in protocol2. Error names below are proposed wire codes, not existing API behavior.

| Request | Proposed result | Durable effect |
|---|---|---|
| Existing receipt, same operation/kind/sequence/versioned digest and valid historical authority | Exact replay; repair any missing attribution before final success ACK | No additional financial/stock effect or checkpoint advance |
| Existing receipt with changed operation, content, sequence or immutable binding |409 IDENTITY_CONFLICT | None |
| New supported operation sequence=checkpoint+1 with valid authority/dependencies/stock | Apply once, persist receipt and advance checkpoint atomically | One validated effect |
| New sequence>checkpoint+1 |409 SEQUENCE_GAP, expected next sequence and received sequence; no accepted entity IDs | No financial write, receipt or checkpoint advance |
| Unseen sequence<=checkpoint |409 RECONCILIATION_REQUIRED | No backfill, no fake replay ACK, no silent discard |
| Stream absent, wrong merchant/device, ambiguous legacy state or version downgrade | Authentication denial or409 REVIEW_REQUIRED as appropriate | No enrollment/reset/admission inferred from request body |
| Unsupported movement-only/manual adjustment | Explicit unsupported/reconciliation response | No tombstone, synthetic stock delta, skipped sequence or ACK |

A success ACK binds the original operation ID, device sequence, complete accepted entity IDs, original result identity and protocol/stream identity. A checkpoint value by itself is never permission to clear all lower local envelopes. The client drains ordered complete operations and stops at the first unresolved item; it persists the reason and retains later operations. Do not auto-apply queued work from an unreviewed legacy stream merely because a new client understands version2.

### Real post-commit attribution failure

The accepted operator HTTP test proves that attribution may fail after the core sale commits. In the design, the core receipt/checkpoint can therefore exist while attribution still needs repair. Such a response is **not** a complete success ACK. Retry checks the exact stored receipt, revalidates the existing historical attribution rules, repairs attribution idempotently, then returns the full replay ACK. It must not apply stock again, change original operator/shift provenance, or reassign a prior sale to the current token holder. This retains the verified retry boundary rather than assuming all HTTP errors imply rollback.

### Local manual adjustment disposition

The proposed first v2 slice supports the already implemented sale/return/void cloud contracts only. Do not expose a new offline manual-adjustment UI as part of this P0 slice. For an explicitly enrolled v2 client, creation of a new movement-only local adjustment is rejected **before** local catalog/meta/movement/outbox writes unless a separately verified upload contract exists. This opt-in behavior must not silently change legacy data or the legacy local API.

Existing movement-only envelopes remain intact and prevent automatic stream upgrade/drain past them. Their stock delta is real, so they cannot become no-op receipts. The reviewed direct local adjustment callers are diagnostics; dashboard inventory controls call separate remote APIs. This is not an absence proof for old/imported/dynamic callers. If product scope requires offline adjustments, implement a separate authorized inventory contract with correct merchant/device/station/branch, historical permission, immutable identity, conflict/stock rules and atomic sequence receipt before enabling it. Do not add that feature solely to make a diagnostic pass.

### Compatibility and rollback

Protocol negotiation must be explicit and versioned. Keep v1 records immutable. An unenrolled or ambiguous device remains visibly in review; deploying a new server must not silently cut all old clients over to a new interpretation. Once a device is enrolled, reject downgrade attempts for new writes; allow an exact legacy replay only through an explicit server mapping to the same immutable accepted operation. Read-only history inspection alone is not that mapping.

Rollback before enrollment leaves v1 admission unchanged. After enrollment, a rollback must preserve stream/receipt data and fail closed if the old runtime cannot honor it; never roll a financial device back into an uncheckpointed permissive writer. Rollout/version-gating, migrations, backups and hosted adoption are separately unverified and remain release blockers. No production deploy is authorized here.

### Bounded implementation slices and acceptance

1. **Read-only assessment first:** add a device-scoped history classifier using the current trusted SQL transaction boundary. It reports EMPTY, CONTIGUOUS, GAPPED or REVIEW_REQUIRED and bounded inspection metadata; it never returns enrollment authority or writes a checkpoint/financial row. Cover empty, contiguous, start-above1, missing-middle, foreign device/tenant, numeric bounds, inspection limit and concurrent-writer consistency with actual restricted SQL. This is the selected next slice, not a recovery fix.
2. **Versioned stream/receipt storage:** additive schema and exact canonical digests with RLS/privacy/readiness/restore tests; no automatic legacy baseline import. Prove per-device locks and financial commit/rollback/checkpoint atomicity under injected failures.
3. **Opt-in client/server admission:** exact replay first, future-gap hold, unseen-late hold, full ACK identity and version-downgrade denial; preserve native queue across lost response/reload and real operator attribution failure. Prove all supported sale/return/void and historical authority cases, including return/void dependencies and multi-device final stock.
4. **Legacy review and rollout:** define and test a supervised adoption/recovery workflow with original evidence preserved. Do not declare the gate closed on the read-only classifier, future-stream fix alone or current diagnostics. Authorized hosted identity/schema/role/restore/rollout acceptance remains separate.

Design review findings: an unconditional max+1 patch does not handle legacy/non-commerce history; removing the backwards check does not establish financial ordering; a timeline MAX or browser counter cannot establish a trusted checkpoint; an HTTP500 after core commit requires exact replay, not a second application. The selected design addresses these by explicit enrollment, immutable receipts, contiguous future application and preserved reconciliation holds. No recovery policy or implementation acceptance is claimed by preparing this design.

SEQ-D1 implementation accepted at `df273707c000588e9b4e0fe772ef05f4a132d579`: [bounded read-only SQL assessment evidence](evidence/P0-CASHIER-DEVICE-HISTORY-ASSESSMENT-20261026.json),56CI/28cashier/724broaderTAP. The utility has no live caller/enrollment authority,inspects a bounded statement snapshot only and changes no admission/financial/timeline rows. Remaining stream/receipt storage,protocol adoption and historical/hosted work are unimplemented/unaccepted.
