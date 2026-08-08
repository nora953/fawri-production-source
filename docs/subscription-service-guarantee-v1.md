# Fawri Subscription Service Guarantee v1

Status: structured server-side authority implemented; **not production-activated**  
Scope: Fawri monthly SaaS subscriptions only  
Non-scope: merchant product warranty

---

## English

### 1. Owner product decision

Fawri sells a monthly SaaS subscription. This policy is a **Subscription Service Guarantee**, not a product warranty.

The v1 policy contract is:

- while a paid subscription cycle is active, Fawri provides the features included in that plan;
- a material outage attributable to Fawri that lasts **more than 24 continuous hours** may qualify the affected subscription for an extension equal to the qualifying outage duration;
- a material Fawri outage lasting **more than 72 continuous hours**, or an attributable failure to activate the service at all, may qualify the affected cycle for **manual refund review**;
- Fawri does not guarantee sales growth, profit, AI outcomes, a specific message volume, or third-party service outcomes;
- Meta/OpenAI/AWS or other external-provider failures are not automatically attributed to Fawri;
- no money movement or refund completion may be represented without authoritative billing/payment state.

The thresholds are implemented as strict `>` comparisons, not `>=`.

### 2. Current authority audit

The repository currently has two subscription-lifecycle representations:

1. the existing file-backed Auth runtime stores subscription records in `merchants.json`, including plan, configured price, reply limits, cycle start/expiry, status, and emergency/add-on reply state;
2. the PostgreSQL schema has a tenant-bound `subscriptions` table with plan, status, configured `price_iqd`, cycle timestamps, versioning, reply-batch state, and a reply-usage ledger.

These are useful subscription/entitlement lifecycle authorities, but they are **not payment transaction authority**. The repository does not currently expose an authoritative Fawri SaaS payment transaction, charge, settlement, refund, or refund-status ledger. A positive `price_iqd` or an admin-activated plan is therefore not treated as proof that money was paid.

The existing `reply_ledger` is a reply quota ledger; it is not a financial ledger.

The current observability runtime provides health/readiness/process metrics. It does not provide an authoritative service-incident/uptime ledger suitable for compensation decisions.

Before this lane, there was no subscription service credit/refund eligibility ledger.

### 3. Added PostgreSQL authority

This lane adds four dedicated tables. None reuses the proposed merchant/product warranty model.

#### `subscription_guarantee_policies`

Platform-global immutable policy-version identity:

- `policy_ref`
- positive `version`
- `scope = monthly_subscription`
- `qualifying_outage_seconds` (v1 contract: 24 hours)
- `refund_review_outage_seconds` (v1 contract: 72 hours)
- `activation_failure_refund_review`
- `auto_qualifying_attribution = fawri`
- `effective_at`
- optional `superseded_at`

No production policy row is seeded by this lane because the final legal/Owner effective date has not been supplied.

#### `subscription_guarantee_incidents`

Tenant-bound operational evidence:

- merchant/customer tenant id;
- `material_outage | activation_failure`;
- attribution `fawri | third_party | customer | unknown`;
- start/end timestamps;
- authority source restricted to `server_ops | automated_monitor`;
- authority reference;
- positive version;
- bounded metadata.

Browser/client outage claims are not an authority source.

#### `subscription_guarantee_assessments`

Append-only eligibility/audit record tied to:

- merchant tenant;
- the subscription lifecycle record;
- immutable policy reference + policy version;
- billing state `paid | unpaid | unknown` and optional billing reference;
- eligible extension seconds;
- qualifying/max continuous outage seconds;
- refund-review flag;
- manual-review flag;
- result/reason code and evaluation timestamp.

The result vocabulary intentionally contains no `refunded` or `paid_out` state.

#### `subscription_guarantee_assessment_incidents`

Tenant-safe evidence links from an assessment to the exact incident records used/excluded, including the included duration. Composite foreign keys prevent cross-tenant incident or subscription evidence from being attached to an assessment.

### 4. Eligibility semantics

The eligibility engine reads only the injected server authority interface: subscription, effective historical policy, and incident evidence.

It does not accept incidents, attribution, outage duration, billing state, or refund state from a browser request.

Rules:

1. trial/unpaid subscriptions receive no benefit;
2. suspended/expired/replies-exhausted subscriptions receive no active-cycle benefit;
3. only `fawri` attribution can automatically qualify;
4. `third_party` and `customer` incidents are excluded from automatic Fawri credit;
5. `unknown`, open/unfinalized incidents, or contradictory overlapping attribution => `manual_review_required` and fail closed;
6. overlapping/adjacent Fawri incident intervals are unioned before duration calculation, so overlap is not double-counted;
7. a merged continuous Fawri interval must exceed 24 hours to count toward extension eligibility;
8. a merged continuous Fawri interval must exceed 72 hours to qualify for manual refund review;
9. an attributed Fawri `activation_failure` on `pending_activation` may qualify for manual refund review;
10. the historical policy is selected using the subscription-cycle start, and its `policy_ref + version` is preserved in the assessment;
11. where billing is `unknown`, otherwise qualifying cases stop at `manual_review_required / BILLING_AUTHORITY_UNAVAILABLE`;
12. this lane never calls a payment provider and never reports that a refund happened.

Extension duration is preserved as exact seconds. Conversion into whole subscription days (for example floor/ceiling/calendar-day semantics) is deliberately not invented and remains an Owner/legal/billing integration decision before automatic application.

### 5. Knowledge separation

Knowledge now has an explicit domain classifier that separates:

- `fawri_subscription_service_guarantee`
- `merchant_product_warranty`

Examples such as “ضمان فوري”, “ضمان الاشتراك”, “تعويض العطل”, “استرجاع الاشتراك”, `subscription service guarantee`, and `outage compensation` belong to the Fawri SaaS guarantee domain.

Generic product warranty/kafala questions remain in the merchant product-warranty domain and remain fail closed because no product-warranty authority has been approved or activated.

The merchant operational fact resolver is intentionally not wired to answer Fawri subscription-guarantee questions. Doing so would mix the merchant's customer-facing product context with Fawri's merchant-facing SaaS contract.

A future coordinator-owned Knowledge composition can route the Fawri guarantee classification to a dedicated support/account context that has an authenticated subscription id. No shared route/app wiring is performed in this lane.

### 6. Payment integration blocker

Automatic financial refund remains blocked until the repository has an authoritative Fawri billing/payment lifecycle that can prove at minimum:

- affected subscription billing cycle;
- successful payment/settlement status;
- immutable payment/charge reference;
- amount/currency actually collected;
- prior refund/chargeback state;
- idempotent refund operation + provider result;
- reconciliation/audit state.

Until then, the strongest financial outcome is `eligible_for_manual_refund_review` when tests use a trusted `paid` authority, or `manual_review_required` when the production PostgreSQL adapter sees the current billing state as unknown.

### 7. Coordinator handoff

No shared `app.ts`, route mount, or existing Auth subscription route is changed here.

If this authority is exposed through an API or composed into the production Knowledge decision engine, that shared wiring must be coordinator-owned. It must preserve authenticated tenant/subscription context and must not accept client-supplied incident/billing authority.

### 8. Remaining Owner/legal decisions

Before production activation, confirm:

- final policy legal wording;
- policy effective date for v1;
- whether extension is exact elapsed time or rounded to whole days, and the rounding/calendar rule;
- what evidence is sufficient to set incident attribution to `fawri` rather than `unknown`;
- whether activation failure requires a minimum elapsed period or specific remediation attempts;
- refund calculation semantics for an affected cycle after authoritative billing exists;
- customer notice/claims/review process and any jurisdiction-specific consumer-law wording.

---

## العربية

### 1. قرار المنتج

فوري يبيع اشتراك SaaS شهري. هذه السياسة هي **ضمان خدمة الاشتراك** وليست ضمان منتجات التاجر.

عقد v1 المنظم هو:

- خلال دورة اشتراك مدفوعة وفعالة، يوفر فوري الميزات المشمولة بالخطة؛
- العطل الجوهري المنسوب إلى أنظمة فوري والذي يستمر **أكثر من 24 ساعة متواصلة** قد يؤهل دورة الاشتراك المتأثرة لتمديد يعادل مدة التعطل المؤهلة؛
- عطل فوري الجوهري الذي يستمر **أكثر من 72 ساعة متواصلة**، أو تعذر تفعيل الخدمة أصلًا بسبب فوري، قد يؤهل الدورة إلى **مراجعة استرداد يدوية**؛
- لا يوجد ضمان لزيادة المبيعات أو الأرباح أو نتائج AI أو حجم رسائل محدد أو نتائج خدمات الطرف الثالث؛
- أعطال Meta/OpenAI/AWS أو أي مزود خارجي لا تُنسب تلقائيًا إلى فوري؛
- لا يجوز تحريك أموال أو الادعاء بإتمام refund بدون billing/payment authority موثوقة.

المقارنة في الكود هي `>` بشكل صريح وليست `>=`.

### 2. نتيجة الـAudit الحالية

المستودع يملك subscription lifecycle فعليًا: توجد حالة خطة ودورة اشتراك وحدود ورسائل وتواريخ بداية/انتهاء في runtime القديم، وتوجد PostgreSQL `subscriptions` authority منظمة وtenant-safe مع versioning وreply ledger.

لكن لا توجد حاليًا authority مستقلة تثبت معاملات دفع اشتراك فوري أو settlement أو refund. قيمة `price_iqd` أو تفعيل الخطة إداريًا لا تعتبر إثباتًا للدفع.

`reply_ledger` الحالي خاص برصيد الردود وليس دفتر أموال.

Observability الحالية health/readiness/process metrics فقط، وليست service incident/uptime authority صالحة للتعويضات.

### 3. السلطة المنظمة المضافة

أضيفت جداول مستقلة خاصة بضمان خدمة الاشتراك:

- `subscription_guarantee_policies`: نسخة السياسة، النطاق الشهري، thresholds، attribution المسموح، وتاريخ السريان/الاستبدال؛
- `subscription_guarantee_incidents`: سجل عطل server-side مرتبط بالـmerchant مع attribution ومصدر authority وversion؛
- `subscription_guarantee_assessments`: سجل eligibility/audit مرتبط بالاشتراك ونسخة السياسة وحالة billing والنتيجة؛
- `subscription_guarantee_assessment_incidents`: روابط evidence tenant-safe تمنع خلط حوادث عميل مع عميل آخر.

لم تتم إعادة استخدام أي warranty tables خاصة بمنتجات التاجر.

لا يتم seed لسياسة production لأن تاريخ السريان القانوني النهائي لم يُعطَ بعد.

### 4. قواعد الاستحقاق

- أقل من أو يساوي 24 ساعة: لا extension تلقائي؛
- أكثر من 24 ساعة متواصلة ومنسوبة إلى Fawri: extension eligibility؛
- أكثر من 72 ساعة متواصلة ومنسوبة إلى Fawri: refund-review eligibility إضافةً إلى extension عندما تكون الدورة فعالة؛
- activation failure من Fawri على اشتراك pending activation: manual refund-review eligibility؛
- third-party/customer: لا automatic Fawri credit؛
- unknown/open/conflicting attribution: manual review وفشل مغلق؛
- الحوادث المتداخلة تُدمج قبل الحساب حتى لا تتكرر مدة التعويض؛
- unpaid/trial/inactive لا تستفيد تلقائيًا؛
- policy version التاريخية تُحفظ مع assessment؛
- billing `unknown` يمنع النتيجة المالية ويوقفها عند manual review؛
- لا يوجد أي `refunded` result ولا استدعاء payment provider في هذا التنفيذ.

مدة التمديد محفوظة كثوانٍ دقيقة. تحويلها إلى أيام كاملة أو قاعدة rounding يحتاج قرار Owner/legal/billing قبل التطبيق الآلي.

### 5. فصل Knowledge

تم تعريف تصنيف صريح بين:

- ضمان خدمة اشتراك فوري؛
- ضمان منتجات التاجر.

أسئلة مثل “ضمان فوري/ضمان الاشتراك/تعويض العطل/استرجاع الاشتراك” لا يجوز أن تُفسر كـproduct warranty للتاجر.

وفي المقابل، سؤال مثل “شنو ضمان هذا المنتج؟” يبقى Product Warranty ويفشل مغلقًا كما كان، لأن هذه الـlane لم تعتمد أو تنفذ structured merchant product warranty.

Merchant bot لا يتم ربطه مباشرة بسلطة ضمان اشتراك فوري في هذه الـlane حتى لا يخلط عقد SaaS الخاص بالتاجر مع أسئلة عملاء التاجر عن المنتجات.

### 6. Blocker الدفع

أي refund فعلي يحتاج أولًا billing/payment authority موثوقة تثبت الدفع، المبلغ/العملة، payment reference، حالة refund/chargeback السابقة، idempotency، وreconciliation.

حتى ذلك الوقت لا توجد نتيجة `refunded`. أقصى نتيجة مالية هي `eligible_for_manual_refund_review` عند وجود paid authority موثوقة، أو `manual_review_required` مع adapter الحالي لأن حالة دفع SaaS في PostgreSQL الحالية غير مثبتة.

### 7. Handoff للـCoordinator

لم يتم تعديل shared routes أو `app.ts` أو Auth subscription routes.

أي API exposure أو production Knowledge wiring لاحق يجب أن يكون coordinator-owned وأن يستمد merchant/subscription identity من authenticated server context، لا من browser/localStorage أو outage/billing fields يرسلها العميل.

### 8. قرارات Owner/Legal المتبقية

قبل Production activation يلزم حسم:

- الصياغة القانونية النهائية؛
- effective date لسياسة v1؛
- قاعدة تحويل مدة التعطل إلى أيام اشتراك كاملة/rounding؛
- evidence المطلوب لاعتماد attribution = `fawri`؛
- تفاصيل activation failure؛
- طريقة حساب refund بعد وجود billing authority؛
- آلية تقديم الطلب/المراجعة والإشعارات والمتطلبات القانونية المحلية.
