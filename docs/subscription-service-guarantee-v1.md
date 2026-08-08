# Fawri Subscription Service Guarantee v1

Status: structured server-side domain authority implemented; **not production-activated**  
Scope: Fawri monthly SaaS subscriptions only  
Non-scope: merchant product warranty

---

## English

### 1. Owner product decision

Fawri sells a monthly SaaS subscription. This policy is a **Subscription Service Guarantee**, not a product warranty.

The v1 structured contract is:

- during a paid active subscription cycle, Fawri provides the features included in the plan;
- a material outage attributable to Fawri lasting **more than 24 continuous hours** can qualify for an extension equal to the qualifying outage duration;
- a material Fawri outage lasting **more than 72 continuous hours**, or an attributable failure to activate the service at all, can qualify for **manual refund review**;
- Fawri does not guarantee sales growth, profit, AI outcomes, a specific message count, or third-party outcomes;
- Meta/OpenAI/AWS or other external-provider failures are not automatically attributed to Fawri;
- no refund completion or money movement can be represented without authoritative billing/payment state.

The thresholds are strict `>` comparisons, not `>=`.

### 2. Current authority audit

The repository currently has two subscription-lifecycle representations:

1. the existing file-backed Auth runtime stores subscription plan/cycle state in `merchants.json`, including plan, configured price, reply limits, start/expiry, status, and emergency/add-on reply state;
2. PostgreSQL has the tenant-bound `subscriptions` authority, including plan, lifecycle status, configured `price_iqd`, cycle timestamps, versioning, reply batches, and a reply-usage ledger.

These are subscription/entitlement lifecycle authorities. They are **not Fawri SaaS payment transaction authority**. The repository does not currently expose an authoritative SaaS charge, settlement, successful-payment, refund, or refund-status ledger. A positive configured price or an administratively active plan is therefore not proof that money was paid.

The existing `reply_ledger` is a reply-quota ledger, not a financial ledger.

The current observability runtime exposes health/readiness/process metrics. It does not provide an authoritative incident/uptime ledger suitable for compensation attribution.

The repository already has a general server-side `audit_events` authority that can record the resulting assessment/evidence without adding guarantee-specific database tables.

### 3. Minimum safe implementation

Because authoritative SaaS billing and compensation-grade incident records are missing, this lane implements the minimum fail-closed domain authority rather than pretending those records exist.

The implementation provides:

- a versioned v1 policy constructor with monthly scope, 24h/72h thresholds, Fawri-only automatic attribution, and an explicit effective date supplied by the server owner;
- a historical policy authority that rejects overlapping/ambiguous policy versions;
- a tenant-scoped PostgreSQL subscription-lifecycle reader using the existing `subscriptions` table;
- an immutable subscription-cycle evidence reference derived from merchant id, subscription id, subscription version, plan, and cycle timestamps;
- a server-only incident authority contract with provenance `server_ops | automated_monitor`;
- a disabled incident authority that fails closed until a real authoritative incident source exists;
- a pure eligibility engine that accepts only authenticated merchant/subscription identity and reads outage/billing evidence from server authorities;
- audit persistence into the existing `audit_events` table for the assessment and each incident evidence reference;
- no route, shared app wiring, payment-provider call, refund call, or automatic subscription extension.

### 4. Why no new guarantee tables were committed

A guarantee-specific PostgreSQL schema was evaluated first. The repository's current migration generator is intentionally frozen around the committed cross-lane `0002_cross_lane_stage` and `0003_cross_lane_cleanup` chain and requires those historical migrations to reproduce byte-for-byte.

Adding a new schema file changed the regenerated historical `0002` artifact, so both the dedicated validation workflow and the repository's existing PostgreSQL migration-candidate workflow failed the reproducibility guard before any Production DB action.

Rewriting historical `0002/0003` migrations or changing the shared migration generator to invent an `0004` contract would be broader cross-lane migration infrastructure work. This lane therefore removed the new schema and kept the existing migration chain unchanged. A future coordinator-owned migration extension can persist dedicated policy/incident/assessment tables after the shared migration contract is deliberately extended.

### 5. Eligibility semantics

The engine applies these rules:

1. trial or authoritative `unpaid` subscription => no benefit;
2. expired, replies-exhausted, or suspended subscription => no active-cycle benefit;
3. only `fawri` attribution can automatically qualify;
4. `third_party` and `customer` incidents are excluded from automatic Fawri credit;
5. `unknown`, open/unfinalized incidents, contradictory overlapping attribution, duplicate incident identity, invalid provenance, or cross-tenant evidence fail closed;
6. overlapping/adjacent Fawri intervals are unioned before calculation, so downtime is not double-counted;
7. a continuous Fawri interval must exceed 24 hours to contribute to extension eligibility;
8. a continuous Fawri interval must exceed 72 hours for manual refund-review eligibility;
9. an attributed Fawri activation failure on `pending_activation` can qualify for manual refund review;
10. policy reference/version and subscription lifecycle version/reference are preserved in the assessment/audit evidence;
11. when billing is `unknown`, a 24h+ extension-only case remains `manual_review_required / BILLING_AUTHORITY_UNAVAILABLE` and no extension is granted automatically;
12. when billing is `unknown` but the incident independently meets the >72h or activation-failure refund-review threshold, the result is still `eligible_for_manual_refund_review`, with `manualReviewRequired = true`; payment eligibility must be verified manually before any refund, and no extension is granted automatically;
13. the result vocabulary contains no `refunded` or `paid_out` state.

The assessment preserves the measured qualifying Fawri outage duration separately from the extension actually eligible to be applied. Eligible extension duration is retained as exact seconds only after trusted paid state exists. Conversion to whole subscription days, including any rounding/calendar rule, is deliberately not invented.

### 6. Knowledge separation

Knowledge has an explicit authority-domain classifier separating:

- `fawri_subscription_service_guarantee`
- `merchant_product_warranty`

Examples such as “ضمان فوري”, “ضمان الاشتراك”, “تعويض العطل”, “استرجاع الاشتراك”, `subscription service guarantee`, and `outage compensation` are treated as the Fawri SaaS guarantee domain.

Generic product warranty/kafala questions remain in the merchant product-warranty domain and remain fail closed because no structured merchant product-warranty authority is approved or activated.

The authoritative Knowledge gate also marks service-guarantee wording that does not contain the generic word “warranty/ضمان” as authoritative. This prevents those questions from falling through to merchant Saved Answers, embeddings, legacy knowledge, or generated AI.

The merchant operational fact resolver is not wired to answer Fawri subscription-guarantee questions. That avoids mixing a merchant's customer-facing product policies with Fawri's merchant-facing SaaS contract.

### 7. Payment and incident blockers

Automatic financial refund remains blocked until an authoritative Fawri billing lifecycle can prove at minimum:

- affected subscription billing cycle;
- successful payment/settlement state;
- immutable payment/charge reference;
- amount/currency actually collected;
- prior refund/chargeback state;
- idempotent refund request/provider result;
- reconciliation/audit state.

A refund-review eligibility result is therefore a review state only; it is never evidence that a refund was executed.

Automatic extension/refund eligibility also requires an authoritative service-incident source that can establish incident boundaries, provenance, and attribution. Until that source exists, the production incident authority is deliberately disabled/fail-closed.

### 8. Coordinator handoff

No shared `app.ts`, route mount, or existing Auth subscription route is changed in this lane.

A coordinator-owned follow-up is required for either:

- authenticated API/production Knowledge composition using merchant/subscription context; or
- extension of the shared PostgreSQL migration contract if dedicated guarantee policy/incident/assessment tables are desired.

Any future wiring must not accept client/browser/localStorage outage, attribution, billing, or refund authority.

### 9. Remaining Owner/legal decisions

Before production activation, confirm:

- final legal wording;
- v1 effective date;
- exact elapsed-time versus whole-day extension semantics and rounding/calendar rule;
- evidence required to establish attribution `fawri` rather than `unknown`;
- activation-failure qualification evidence/minimum elapsed period, if any;
- refund calculation semantics after authoritative billing exists;
- customer notice/claim/review process and jurisdiction-specific consumer-law wording.

---

## العربية

### 1. قرار المنتج

فوري يبيع اشتراك SaaS شهري. هذه السياسة هي **ضمان خدمة الاشتراك** وليست ضمان منتجات التاجر.

العقد المنظم في v1 هو:

- خلال دورة اشتراك مدفوعة وفعالة، يوفر فوري الميزات المشمولة بالخطة؛
- العطل الجوهري المنسوب إلى فوري والذي يستمر **أكثر من 24 ساعة متواصلة** قد يؤهل الدورة لتمديد يعادل مدة التعطل المؤهلة؛
- عطل فوري الجوهري الذي يستمر **أكثر من 72 ساعة متواصلة**، أو تعذر تفعيل الخدمة أصلًا بسبب فوري، قد يؤهل الدورة إلى **مراجعة استرداد يدوية**؛
- لا يوجد ضمان لزيادة المبيعات أو الأرباح أو نتائج AI أو عدد رسائل محدد أو نتائج خدمات الطرف الثالث؛
- أعطال Meta/OpenAI/AWS أو أي مزود خارجي لا تُنسب تلقائيًا إلى فوري؛
- لا يجوز تحريك أموال أو الادعاء بإتمام refund بدون billing/payment authority موثوقة.

الحدود في الكود هي `>` بشكل صريح وليست `>=`.

### 2. نتيجة الـAudit الحالية

المستودع يملك subscription lifecycle حقيقيًا: توجد حالة خطة ودورة اشتراك وحدود ورسائل وتواريخ بداية/انتهاء في runtime القديم، وتوجد PostgreSQL `subscriptions` authority منظمة وtenant-safe مع versioning وreply batches وreply ledger.

لكن لا توجد حاليًا authority مستقلة تثبت معاملات دفع اشتراك فوري أو settlement أو successful payment أو refund. قيمة `price_iqd` أو تفعيل الخطة إداريًا لا تعتبر إثباتًا للدفع.

`reply_ledger` الحالي خاص برصيد الردود وليس دفتر أموال.

Observability الحالية health/readiness/process metrics فقط، وليست incident/uptime authority صالحة لاتخاذ قرار تعويض.

يوجد `audit_events` server-side أصلًا، ولذلك استُخدم لتسجيل assessment/evidence بدل اختراع جدول مالي أو ادعاء وجود billing authority.

### 3. أقل تنفيذ آمن

بسبب عدم وجود billing authority وسجل أعطال authoritative كافٍ، التنفيذ النهائي في هذه الـlane هو domain authority fail-closed ويشمل:

- policy v1 منظمة وقابلة للـversioning مع effective date يحددها Owner/server؛
- historical policy authority تمنع النسخ المتداخلة/الملتبسة؛
- قراءة tenant-safe من PostgreSQL `subscriptions` الحالية؛
- immutable subscription-cycle evidence reference مبني على subscription version والدورة؛
- incident authority contract يقبل فقط `server_ops | automated_monitor`؛
- disabled incident authority في production إلى أن يوجد مصدر أعطال موثوق؛
- eligibility engine لا يأخذ outage/billing authority من العميل؛
- audit للنتيجة وincident evidence داخل `audit_events` الحالية؛
- لا route جديد، لا app wiring، لا payment/refund call، ولا تمديد اشتراك آلي.

### 4. لماذا لم تُضف جداول Guarantee جديدة

تمت تجربة schema مخصصة أولًا، لكن migration generator الحالي يثبت `0002_cross_lane_stage` و`0003_cross_lane_cleanup` كـhistorical chain يجب أن يتولد byte-for-byte بنفس الشكل.

إضافة schema جديدة غيّرت ناتج `0002` التاريخي، ولذلك فشلت بوابة reproducibility في الـworkflow المخصص وكذلك `PostgreSQL migration candidate` الموجود أصلًا قبل الوصول إلى أي Production DB.

تغيير historical migrations أو تعديل shared migration generator لاختراع عقد `0004` سيكون توسعًا خارج أقل تغيير آمن لهذه الـlane. لذلك أزيلت schema الجديدة وبقيت migration chain الحالية دون تغيير. إذا أُريد persistence مخصص لاحقًا، يحتاج ذلك migration/coordinator follow-up واضح.

### 5. قواعد الاستحقاق

- أقل من أو يساوي 24 ساعة: لا extension eligibility؛
- أكثر من 24 ساعة متواصلة ومنسوبة إلى Fawri: extension eligibility؛
- 72 ساعة بالضبط لا تكفي لـrefund review؛ أكثر من 72 ساعة: manual refund-review eligibility؛
- activation failure من Fawri على اشتراك pending activation: manual refund-review eligibility؛
- third-party/customer: لا automatic Fawri credit؛
- unknown/open/conflicting/duplicate/invalid provenance/cross-tenant evidence: fail closed/manual review أو rejection؛
- الحوادث المتداخلة/المتجاورة تُدمج قبل الحساب حتى لا تتكرر مدة التعويض؛
- unpaid/trial/inactive لا تستفيد؛
- policy version وsubscription lifecycle version/reference التاريخية تُحفظ في assessment/audit؛
- إذا كان billing = `unknown` وكانت الحالة فقط >24h extension، تبقى `manual_review_required / BILLING_AUTHORITY_UNAVAILABLE` ولا يُطبّق تمديد تلقائي؛
- إذا كان billing = `unknown` لكن العطل نفسه تجاوز >72h أو ثبت activation failure، تبقى النتيجة `eligible_for_manual_refund_review` مع `manualReviewRequired = true` حتى يتم التحقق اليدوي من الدفع؛ هذا لا يعني تنفيذ refund ولا يمنح extension تلقائيًا؛
- لا توجد نتيجة `refunded` أو `paid_out` في التنفيذ.

يحفظ الـassessment مدة عطل Fawri المؤهلة المقاسة بصورة منفصلة عن مدة التمديد التي يجوز تطبيقها. لا تصبح `eligibleExtensionSeconds` قابلة للتطبيق إلا بعد وجود paid state موثوق. تحويل المدة إلى أيام كاملة أو قاعدة rounding يحتاج قرار Owner/legal/billing قبل التطبيق الآلي.

### 6. فصل Knowledge

تم فصل:

- ضمان خدمة اشتراك فوري؛
- ضمان منتجات التاجر.

أسئلة مثل “ضمان فوري/ضمان الاشتراك/تعويض العطل/استرجاع الاشتراك” تدخل structured Fawri service-guarantee domain ولا يجوز أن تسقط إلى Saved Answers أو embeddings أو generated AI الخاصة بالتاجر.

سؤال مثل “شنو ضمان هذا المنتج؟” يبقى Product Warranty ويفشل مغلقًا كما كان، لأن هذه الـlane لم تعتمد structured merchant product warranty.

Merchant operational fact resolver لا يجيب ضمان اشتراك فوري، حتى لا يخلط عقد SaaS مع سياسات منتجات merchant.

### 7. Blockers الحالية

أي refund فعلي يحتاج billing/payment authority موثوقة تثبت payment cycle/reference/amount/currency/refund state/idempotency/reconciliation.

نتيجة `eligible_for_manual_refund_review` هي فقط حالة أهلية للمراجعة، وليست دليلًا على تنفيذ refund.

وأي automatic eligibility في production يحتاج incident authority موثوقة تثبت زمن العطل وprovenance وattribution. إلى أن يوجد ذلك، incident authority production تكون disabled/fail-closed.

### 8. Handoff للـCoordinator

لم يتم تعديل shared routes أو `app.ts` أو Auth subscription routes.

يلزم coordinator-owned follow-up إذا أُريد:

- API/production Knowledge wiring مع authenticated merchant/subscription context؛ أو
- توسيع shared PostgreSQL migration contract لإضافة جداول guarantee مخصصة.

ولا يجوز مستقبلًا أخذ outage/attribution/billing/refund authority من browser/localStorage أو body يرسله العميل.

### 9. قرارات Owner/Legal المتبقية

قبل Production activation يلزم حسم:

- الصياغة القانونية النهائية؛
- effective date لسياسة v1؛
- قاعدة exact elapsed time مقابل whole days والـrounding/calendar rule؛
- evidence المطلوب لاعتماد attribution = `fawri` بدل `unknown`؛
- شروط/evidence تعذر التفعيل؛
- طريقة حساب refund بعد وجود billing authority؛
- آلية claim/review/notice والمتطلبات القانونية المحلية.
