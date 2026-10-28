## مطابقة FIELD002 وتجهيز اختيار سياسة الردود — 2026-10-28

البوابتان القائمتان P0-ACCESS-FULL-ROLE-PRIVACY-MATRIX وP0-RESIDUAL-MERCHANT-PRIVACY-001/http تبقيان OPEN. نقطة المراجعة **362530d048c86b09b91ee6ac625b964319bb6d8c**؛ آخر مصدر تنفيذي مقبول **69a3ccc7c66f4b0eca78c27787bc8a8aceae1d74**. الدفعة مصدر/أدلة/قرار فقط، دون تغيير التطبيق أو تنفيذ اختبارات أو CI جديدة.

طوبقت **12 مدخلاً للعقد** مع snapshot المرشح f0bd2b0639f80da5c4dc98c75909d51c93e533df ببصمات Git blob؛ كلها مطابقة بالبايت. طوبقت **11 ملفات دليل مقبولة** بالطريقة نفسها، وبصمة اختبار المرشح SHA256 هي af0d5ec9ab48abd6ab045119097de20967eaaa1a5280abe0c6dcc3cd285540aa المطابقة للسجل. أُعيد استخدام تقييم العميل المحلي6PASS باعتباره synthetic فقط، ولم يُعد تنفيذه.

رُبط أيضًا دليل الإشعارات الحالي الموجود: [40571069056/job122425088862](https://github.com/nora953/fawri-production-source/actions/runs/40571069056)، **80TAP ناجحة في6 ملفات**،0 فشل/تخطٍّ/إلغاء، عند المصدر69a3ccc وcheckout5c164339 ذي الشجرة12151a5b المطابقة. الفرق إلى نقطة المراجعة7 ملفات توثيق فقط. هذه ليست80 حالة جديدة، ولا تطبيقًا للعقد المرشح أو قبولًا للمستهلكين التاريخيين/المخصصين. نتائج58/58 وSQL829 السابقة تبقى في نطاقها دون إعادة.

| المتبقي | التصنيف الحالي | ما يلزمه |
|---|---|---|
| FIELD002-R1 | اختيار سياسة ردود جاهز للمراجعة، غير معتمد | اختيار صريح ثم تطبيق مرشح الحقول واختبارات التطبيق الفعلية للسلوك المتغير |
| FIELD002-R2 | محجوب بجرد تاريخي وتصرف معتمد | جرد قراءة فقط مصرح به للصفوف والكتّاب الفعليين وربط المصدر/التاجر/الطلب؛ لا وصول hosted الآن |
| FIELD002-R3 | نطاق منتجين غير محسوم | تحديد المقصود بالإنتاج مقابل توافق القراءة؛8 أنواع لها callers مثبتة، ومساعد new-order بلا caller محدد، و3 أنواع legacy فقط |

### الاختيار المحدد — FIELD002-R1

الحالة **CONCRETE_REVIEWABLE_CHOICE_READY_NOT_ADOPTED**؛ approval=UNAPPROVED وselectedModel=null. [السجل الآلي](evidence/P0-NOTIFICATION-PRODUCER-FIELD-MAP-20261025.json#policyReconciliation20261028)، وresponseFieldContract الموجود وجدول12 نوعًا أدناه، واختبار المرشح الموجود؛ لم يُنشأ عقد أو ملف اختبار مكرر.

**التوصية:** إرجاع id/type/created_at وread_at عند وجوده، والحقول المطلوبة/الاختيارية المحددة لكل نوع فقط، بعد إثراء دورة الفحص بالسلطة الحالية. تُحفظ القيم كما هي وغياب الاختياري كما هو. البيانات الأصلية فيSQL تبقى محفوظة؛ لا تغيير للأرصدة أو المنح أو الاحتفاظ أو read mutation أو ربط الطلبات. السجلات المجهولة/المشوهة تبقى بالعدد والترتيب والحد الحالي وبفشل التحقق الحالي للواجهة؛ لا تصفية صامتة أو قيم مصطنعة.

**أثر التوافق الفعلي:** operational_customer_message يسمح في المرشح بـconversation_id/action_url؛ order_id الإضافي المصطنع الذي يحفظه الرد الحالي سيختفي من الرد المرشح، بينما يبقى مخزنًا. هذا يغيّر سلوك extension قائمًا اختبره دليل reserved-fields. إذا اختير المرشح، يُستبدل فقط توقع حفظ المفاتيح الإضافية في الرد بدليل جديد، وتبقى assertions الهوية/التاجر/التاريخ/الثبات كما هي. البديل هو تأجيل القرار مع إبقاء السلوك الحالي وR1 مفتوحة؛ لا شهادة خصوصية عامة للحقول الإضافية.

الاختيار لا يعتمد تنظيفًا أوعزلًا أوإصلاحًا تاريخيًا لـR2، ولا callers أوتقاعد أنواع لـR3، ولا وصول hosted أوmerge/deploy أوSEQ-R2. [AGENTS.md](../../AGENTS.md) ينص: “Plan approval does not approve policies”. لهذا لا تُعد «أكمل» اختيارًا للسياسة الجديدة. بعد اختيار صريح، تُنفذ فقط إسقاطات الردود المتفق عليها مع ضوابط تاجرين والعميل الفعلي والإعادة وثباتSQL وCI الدقيق؛ لا إغلاق تلقائي للبوابة.

إذا تأجل الاختيار، تستمر مطابقة FIELD003 المستقلة دون إعادة اختبارات الإشعارات المقبولة.45 حالة دون تغيير:29 CLOSED_SOURCE/7 OPEN/9 BLOCKED؛ completeP0Inventory=false،overallPercentage=null،**NO-GO**. SEQ-R2 يبقىUNAPPROVED؛ لا hosted/merge/deploy/P1/P2.

---

## RESIDUAL-FIELD-002 response-field contract candidate assessed — 2026-10-25

Recovered **f0bd2b06**, Draft PR550/base preserved. Prepared an explicit per-type response-field candidate for12client shapes, canonical common fields and current inspection lifecycle enrichment. Candidate permits **no extra keys** beyond each type's enumerated required/optional fields. Unknown/malformed records are retained as failures under the existing strict client contract; no silent row filtering, defaulted lifecycle, historical relinking or SQL rewrite.

**Local candidate/client assessment:6PASS/0FAIL/0SKIP/0CANCEL**, Node v24.22.1. Actual frontend validator/read client imported; source-derived synthetic objects and in-process fetch adapter only. All12valid full shapes remain identical; optional absence, missing required fields, invalid URL/value, unlinked inspection, unknown mixed list, read path identity/timestamp negatives checked. Literal current page accesses and all12validator key sets fit the candidate. No SQL/application HTTP/browser/hosted execution; no new CI run.

**Compatibility change is explicit:** actual current client accepts and returns extra fields; candidate removes them (including synthetic customer-message order_id retained by the previous reserved-key regression). Candidate is **NOT_ENFORCED / NOT_POLICY_ADOPTED**. It establishes known-shape compatibility, not historical/custom-consumer compatibility or an attacker-controlled leak. The current unread-count hook counts array rows without per-record validation; no unknown-row filtering proposed. Read HTTP may commit before frontend validation; client rejection is not SQL rollback.

[Candidate field table and limits](P0-NOTIFICATION-PRODUCER-FIELD-MAP-20261025.md), [machine contract](evidence/P0-NOTIFICATION-PRODUCER-FIELD-MAP-20261025.json), [local assessment](evidence/p0-notification-response-field-contract.test.mjs). FIELD002-R1 stays OPEN with a concrete tested candidate; R2 historical disposition BLOCKED_HOSTED_VERIFICATION; R3 intended producer scope OPEN. No product code/schema/grant/retention change. Executable4e36d591 retains inherited56/56CI,78notificationTAP,721broaderTAP; local6 are separate. Register45=29CLOSED_SOURCE/7OPEN/9BLOCKED, inventory incomplete, overallPercentage null, **NO-GO**. GitHub-only/no merge/deploy.

**Next exact action:** Continue RESIDUAL-FIELD-003: map actual audit_events producers, metadata/details projections and current role-scoped HTTP consumers against existing emergency, management and incident evidence. Select one concrete unproved field boundary; do not rerun accepted notification cases. FIELD002-R1 remains a tested candidate, not enforced or closed; retain R2 hosted disposition and R3 intended producer scope.

---

### Candidate fields (not enforced)

Every row also carries canonical `id`, `type`, `created_at`, and optional `read_at`. Values retain the existing validator's string/date/number/enum/local-URL checks; the candidate neither coerces nor repairs them. No additional key is permitted in this candidate.

| Type | Required type fields | Optional type fields |
|---|---|---|
| `subscription_expiry_reminder` | `plan_name`, `expires_at`, `days_remaining` | None |
| `subscription_expired` | `plan_name`, `expired_at`, `addon_replies_remaining` | None |
| `addon_expiry_reminder` | `addon_batch_id`, `source`, `remaining_replies`, `expires_at`, `days_remaining` | None |
| `operational_new_order` | `order_id`, `action_url` | `conversation_id` |
| `operational_payment_conflict` | `order_id`, `action_url` | `conversation_id`, `provider` |
| `operational_knowledge_gap` | `training_request_id`, `action_url` | `conversation_id` |
| `operational_customer_message` | `conversation_id`, `action_url` | None |
| `inspection_session_request` | `ticket_id`, `inspection_request_id`, `ticket_subject`, `admin_name`, `mode`, `request_expires_at`, `action_url`, `request_status` | `consent_decision`, `responded_at`, `session_expires_at`, `ended_at`, `end_reason` |
| `support_reply_reminder` | `ticket_id`, `ticket_subject`, `action_url` | None |
| `subscription_balance_purchase` | `purchased_replies`, `emergency_debt_paid`, `addon_replies_added`, `emergency_debt_remaining`, `base_replies_remaining`, `emergency_replies_remaining`, `addon_replies_remaining`, `total_replies_available` | `addon_batch_id`, `addon_batch_expires_at` |
| `subscription_plan_event` | `operation`, `plan_name`, `start_date`, `expires_at`, `emergency_debt_paid`, `emergency_debt_remaining`, `base_replies_remaining`, `addon_replies_remaining`, `total_replies_available` | `previous_plan_name` |
| `subscription_emergency_activated` | `addon_batch_id`, `emergency_replies_added`, `emergency_debt`, `expires_at` | None |

### Behavior and compatibility

| Situation | Current behavior | Candidate behavior |
|---|---|---|
| Valid known type | Required/optional fields and arbitrary non-reserved variables reach the client | Retain enumerated fields, with exact values and absence; remove other keys |
| Unknown type | Server returns row; actual client rejects entire list | Keep canonical common row; actual client still rejects entire list; retain count/order/limit semantics |
| Known type with missing/invalid required field | Actual client rejects entire list | Keep failure; no defaults, coercion or partial display |
| Matching owned inspection request | Canonical lifecycle overrides stale stored lifecycle | Enrich first with existing source/request/ticket binding, then minimize fields |
| Missing/unlinked inspection request | No fabricated lifecycle; incompatible shape fails client | Keep missing state and failure; do not rename/relink legacy request_id |
| Owned read mutation with incompatible response | SQL may commit before strict client rejects returned shape | Preserve transaction/idempotency; no claim of client-validation rollback |
| Stored variables / history | Stored as currently implemented | No storage, retention, cleanup or migration change |

The strict candidate is a recommendation with a local compatibility assessment, not a deployed policy. The reserved-key proof intentionally preserved a synthetic business extra; adoption would supersede that one extension-preservation expectation explicitly while retaining canonical identity, tenant, replay and unchanged-storage assertions. No actual historical rows or custom dynamic consumers were inventoried. Any implementation requires the source/runtime acceptance listed in `responseFieldContract.implementationAcceptance`; the candidate6PASS is not SQL/app/hosted acceptance. Work can proceed on the next independent P0 field boundary while these decisions remain open.

---

## RESIDUAL-FIELD-002 finite acceptance reconciliation — 2026-10-25

Recovered **04552d16** / Draft PR550, base unchanged. Documentation-only reconciliation: corrected stale pending markers across12client types and linked11accepted executable evidence records after ancestry verification; current source anchors12/12 and client type set match. **8types** have bounded canonical caller→SQL→actual app→actual frontend-validator evidence; **1new-order type** has direct SQL producer proof with no identified application caller; **3legacy JSON types** have source/synthetic-client compatibility only. These categories are not a P0 completion percentage.

Current acceptance matrix and finite checklist: [field map](P0-NOTIFICATION-PRODUCER-FIELD-MAP-20261025.md) / [machine evidence](evidence/P0-NOTIFICATION-PRODUCER-FIELD-MAP-20261025.json). Five checklist items record bounded runtime/source acceptance; three unresolved items: **FIELD002-R1** non-reserved response-field/unknown-record policy, **FIELD002-R2** hosted historical inventory and incompatible/unlinked-row disposition (BLOCKED under GitHub-only restriction), **FIELD002-R3** intended producer scope for new-order and legacy types. No new defect, cleanup policy, product caller, code change, runtime execution or CI rerun claimed.

Retain executable **4e36d59149f1ac3b7b1cad91c93a09aff9146612** and its verified56/56CI,78notificationTAP,721broaderTAP as inherited evidence. **FIELD002 OPEN; release NO-GO;45register rows=29CLOSED_SOURCE/7OPEN/9BLOCKED; inventory incomplete; overallPercentage null.** No merge/deploy/hosted/provider interaction.

**Next exact action:** Prepare a compatibility-preserving FIELD002-R1 response-field contract from the reconciled 12 type shapes and current inspection enrichment: explicit allowed extra keys, unknown/malformed record behavior and historical compatibility impact. Do not change production projection, enable retired producers or claim hosted data acceptance until that contract and source evidence justify remediation.

---

| Notification type | Current evidence boundary | Evidence |
|---|---|---|
| `subscription_expiry_reminder` | Bounded canonical caller / SQL / actual app / client | [Record](evidence/P0-SUBSCRIPTION-NOTIFICATION-CALLER-20261025.json) |
| `subscription_expired` | Bounded canonical caller / SQL / actual app / client | [Record](evidence/P0-SUBSCRIPTION-NOTIFICATION-CALLER-20261025.json) |
| `addon_expiry_reminder` | Bounded canonical caller / SQL / actual app / client | [Record](evidence/P0-SUBSCRIPTION-NOTIFICATION-CALLER-20261025.json) |
| `operational_new_order` | Direct SQL producer only; application caller not identified | [Record](evidence/P0-NEW-ORDER-NOTIFICATION-REACHABILITY-20261025.json) |
| `operational_payment_conflict` | Bounded canonical caller / SQL / actual app / client | [Record](evidence/P0-PAYMENT-CONFLICT-NOTIFICATION-CALLER-20261025.json) |
| `operational_knowledge_gap` | Bounded canonical caller / SQL / actual app / client | [Record](evidence/P0-META-KNOWLEDGE-GAP-NOTIFICATION-CALLER-20261025.json) |
| `operational_customer_message` | Bounded canonical caller / SQL / actual app / client | [Record](evidence/P0-META-CUSTOMER-NOTIFICATION-CALLER-20261025.json) |
| `inspection_session_request` | Bounded canonical caller / SQL / actual app / client | [Record](evidence/P0-SUPPORT-NOTIFICATION-CALLER-20261025.json) |
| `support_reply_reminder` | Bounded canonical caller / SQL / actual app / client | [Record](evidence/P0-SUPPORT-NOTIFICATION-CALLER-20261025.json) |
| `subscription_balance_purchase` | Legacy JSON source + synthetic client only | [Record](evidence/P0-NOTIFICATION-LEGACY-COMPATIBILITY-20261025.json) |
| `subscription_plan_event` | Legacy JSON source + synthetic client only | [Record](evidence/P0-NOTIFICATION-LEGACY-COMPATIBILITY-20261025.json) |
| `subscription_emergency_activated` | Legacy JSON source + synthetic client only | [Record](evidence/P0-NOTIFICATION-LEGACY-COMPATIBILITY-20261025.json) |

| Item | Current state | Requirement |
|---|---|---|
| FIELD002-C1 | BOUNDED_ACCEPTED | Exact variables and owned transport for the eight identified canonical caller types |
| FIELD002-C2 | BOUNDED_ACCEPTED | Direct operational producer optional/absent/blank field contracts including new-order helper |
| FIELD002-C3 | BOUNDED_ACCEPTED | Canonical identity/time and inspection lifecycle projection |
| FIELD002-C4 | BOUNDED_ACCEPTED | Observed SQL overlap for subscription refresh and canonical inspection creation |
| FIELD002-C5 | SOURCE_AND_LOCAL_CLIENT_RECONCILED | Legacy JSON types, older SQL inspection shapes and new-order helper reachability |
| FIELD002-R1 | OPEN_SOURCE_FIELD_CONTRACT | Decide and enforce complete response policy for non-reserved extra keys and unknown/malformed types |
| FIELD002-R2 | BLOCKED_HOSTED_VERIFICATION_AND_DISPOSITION | Establish actual historical/alternate-writer row inventory and approved handling of incompatible/unlinked records |
| FIELD002-R3 | OPEN_PRODUCER_SCOPE_CONTRACT | Confirm intended canonical role of new-order and three legacy-only notification types |

The checklist is scoped to FIELD002. Accepted bounded cases retain their original limitations; no all-writer race/clock/crash proof or complete product acceptance follows. Historical sections below preserve the execution record and are superseded by this current matrix.

---

## RESIDUAL-FIELD-002 canonical reserved notification fields fixed — 2026-10-25

Source **4e36d59149f1ac3b7b1cad91c93a09aff9146612**: **56/56 CI workflows SUCCESS**, zero pending/failure/cancellation. Recovered0b9b90df; initial failure13a11406 and targeted checkpoint c8f45035 preserved. Previous accepted executable31912d9f retained as history.

**NOTIFICATION-RESERVED-FIELD-PROJECTION-001 — FIXED_SOURCE within the tested canonical contract.** Synthetic conflicts in privileged-bootstrap owned rows replaced projected id/type and forged read_at on SQL-unread rows; created_at was already canonical. This is correctness/defense-in-depth evidence, not proof of public attacker input, unauthorized access, hosted incident or malformed historical rows. Minimal projection fix copies variables and removes id/type/created_at/read_at before canonical SQL fields are mapped. Stored JSON and other business/extra keys stay unchanged; no schema/grant/frontend-validator change or general per-type extra-key allowlist.

Actual app and restricted SQL proof: list/unread retain canonical id/type/created_at and omit read_at for unread rows; own read/replay use canonical path identity and timestamps; peer read404 and peer state preserved; null/number/object reserved values cannot corrupt canonical records; actual frontend validator accepts output. Three new functional cases; extended fixture27TAP (26functional+parent). Dedicated notification lane **78TAP PASS** (72functional+6parents), run40188627730/job121154645813. Broader isolated PostgreSQL **721TAP PASS**,92invocations/90unique files, run40188627644/job121154872673. Both zero failed/skipped/cancelled; teardown SUCCESS. Three new cases run only in the dedicated lane. Both checkout384c568a have source-identical tree af9ada1b7c012d220917d3b340b8af6e159f1e99.

[Evidence](evidence/P0-NOTIFICATION-RESERVED-FIELDS-20261025.json). **FIELD002 remains OPEN; release NO-GO.** Register unchanged45rows=29CLOSED_SOURCE/7OPEN/9BLOCKED; complete inventory false; overall percentage null. GitHub-only; no merge/deploy/hosted/provider proof.

**Next exact action:** Reconcile a finite RESIDUAL-FIELD-002 closure checklist across the 12 notification types and linked evidence: live canonical producers/callers, inactive JSON/legacy shapes, reserved canonical fields, non-reserved extra-key policy and unlinked historical/hosted rows. Identify precise remaining source acceptance versus blocked policy/hosted proof before closing; do not infer attacker key control or repeat accepted scenarios.

---

## Concurrent canonical inspection creation repair — 2026-10-25

Actual two-ticket/same-merchant race confirmed on e9c25726:201+201/2requests/2notices after observed SQL overlap. Repaired on31912d9f by merchant-before-ticket serialization; unchanged test now observes insert_gate+merchant_serialization,201+409/1request/1notice,peer progress/preservation,rejection release and notice-fault rollback/retry. Actual frontend fields PASS. One newfunctional,fixture24TAP,lane75TAP,broader721TAP,56/56CI SUCCESS. [Evidence](evidence/P0-INSPECTION-CONCURRENT-CREATE-20261025.json). No schema/grant/consent change, global raw-SQL uniqueness, historical cleanup, load/browser/hosted acceptance. FIELD002 remains OPEN. Next canonical reserved-key identity/timestamp contract; synthetic conflicts are correctness tests, not automatic attacker-input proof.

---

## Concurrent subscription list refresher runtime update — 2026-10-25

Bounded actual HTTP/SQL overlap accepted on57b554a0:2newfunctional,fixture23TAP,lane74TAP,broader721TAP,56/56CI SUCCESS. Restricted SQL waiters observed2/reminder,2/replay,6/two-tenant expiry; peer progressed while own row locked. Exactly one notice per source, stable markers/old notices, preserved subscription/batch business fields and actual frontend fields PASS. [Evidence](evidence/P0-NOTIFICATION-CONCURRENT-REFRESH-20261025.json). Owned fixture gates/pool8 only; not load-capacity/crash/hosted or all producer race acceptance. FIELD002 remains OPEN. Next actual canonical inspection creation race across two assigned tickets for one merchant; retain sequential proof and historical/extra-key policy separately.

---

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
