## سجل قرارات التفعيل — 2026-10-27

آخر مصدر تنفيذي مقبول: `699af77df6be59510cc4638512d876d4a9a16173`؛ نقطة التحقق السابقة: `b4d649a397948d363b6c6c908d36b1f1fd9b0ba3`. هذه دفعة توثيق وقرار فقط، دون تغيير الكود أو المخطط أو الصلاحيات، ودون اختبارات تشغيل أو قبول CI جديد. الأدلة السابقة تبقى في نطاقها؛ الإطلاق **NO-GO**.

السجل التفصيلي القابل للقراءة آليًا: [promotionPrerequisiteDecisionPacket](evidence/P0-CASHIER-SEQUENCE-DESIGN-20261026.json). البنود الخمسة أدناه سجلات قرار مرتبطة بمتطلبات P0 الموجودة، وليست متطلبات إصدار جديدة أو مقامًا لحساب نسبة الإنجاز.

| السجل | القرار المحدد المطلوب | الحالة |
|---|---|---|
| مراجعة الجهاز | من يعتمد المراجعة، وكيف ترتبط هويته الفعلية بالدليل الأصلي وبمرجع المراجع؟ | غير معتمد |
| تهيئة الصلاحيات | الأدوار الفعلية، ومسؤولو الترحيل والمنح والسحب والتراجع | غير معتمد؛ لا توجد أسماء تشغيلية أو بيانات دخول |
| سجلات المراجعة والمالية | الغرض والقراء وبدء المدة ومدتها والحجز والتصرف النهائي لكل مجموعة حقول | غير معتمد؛ كل المدد فارغة |
| الخصوصية وسلامة سجل الطوارئ | تصميم إصدار واضح للخصوصية والاحتفاظ مع حفظ سلامة السلسلة | غير معتمد؛ يبقى رفض الحذف الحالي409 |
| المخزون المستضاف والاستعادة | نطاق مستقل مأذون، ومخزون أدوار ومفاتيح ونسخ ووسائط وأدلة استعادة | محجوب بقيود GitHub الحالية |

### القرار الأول الجاهز للمراجعة

**الاقتراح:** يقتصر اعتماد مراجعة جهاز كاشير جديد في البداية على مالك المنصة `owner_admin`. لا يحصل مساعد الإدارة أو التاجر أو عامل الكاشير على هذه الصلاحية. تمر المراجعة عبر سلطة قاعدة بيانات مستقلة عن البيع والمصادقة، وترتبط هوية المراجع على الخادم بالدليل الأصلي وبمرجع المراجعة. هذا يقلل الجهات المخولة في البداية ويوضح المسؤولية.

**البديل:** السماح بمراجعين محددين يُعيَّنون صراحةً، بعد تحديد آلية التعيين والسحب والتدقيق والقراءة. لا يوجد دور تطبيقي جديد أو مسار تنفيذ معتمد لهذا البديل.

الاختيار المعتمد حاليًا: **فارغ**. اسم المعتمد وتاريخ الاعتماد ودليله: **فارغة**. الموافقة على هذا النموذج تسمح بتصميم عقد إصدار المراجعة داخل المصدر فقط؛ لا تعني السماح بالنشر أو البيئة المستضافة أو المنح التشغيلي أو تفعيل البروتوكول العام.

قبل تنفيذ عقد الإصدار، يلزم تحديد مصدر الدليل الأصلي، وحارسه، والقراء المسموحين، وطريقة التحقق من أصالته، وإجراء ملاحظة طابور الجهاز، والربط بهوية المراجع، وآلية سحب الصلاحية. مرجع يرسله المتصفح أو بصمة وحيدة لا يثبتان هذه الهوية أو استقلال الدليل. غياب التاريخ أو MAX أو عداد العميل لا يثبت جهازًا فارغًا؛ تظل الحالات الملتبسة والمسارات المتقاعدة محجوبة.

### الفصل المطلوب للأدوار

| الفئة | حدود صلاحيات المرشح بعد قبول منفصل | الدور التشغيلي الفعلي |
|---|---|---|
| التطبيق الأساسي | علامة التنفيذ المالي وقفل المسار وتثبيت الإيصال؛ دون اعتماد جهاز أو قراءة سجل المراجعة الخام | غير محدد |
| المصادقة | لا شيء من سلطات المراجعة أو الإيصالات الجديدة | غير محدد |
| المراجع | علامة المراجعة ودالة اعتماد الجهاز الفارغ فقط؛ دون جداول خام أو سلطة مالية | غير محدد |
| مسؤول الترحيل والمنح | مشغّل مأذون منفصل وصلاحيات تشغيلية تُحدَّد صراحةً؛ لا تُنسخ صلاحيات fawri_ci التجريبية | غير محدد |

الأدوار المالكة الثلاثة تبقى NOLOGIN وبلا عضويات تطبيقية. أسماء بيئة الاختبار ونجاح الفحص السابق لا يمثلان مخزون التشغيل. الفحص للقراءة فقط ويعيد دائمًا `grantsAuthorized=false`؛ لا ينفذ منحًا ولا يثبت ثبات DDL بعد انتهاء اللقطة.

### جدول الاحتفاظ الذي يجب اعتماده

| مجموعة السجل | الحقول المرصودة | القرار المتبقي |
|---|---|---|
| الربط والهوية | review_reference_hash، reviewer_reference_hash، stream_id، merchant_id | الغرض والقراء وبدء المدة ومدتها والحجز والتصرف النهائي |
| ربط الدليل | manifest_hash، evidence_sha256 | القرارات نفسها، مع سياسة مستقلة للدليل الأصلي خارج الجدول |
| الخط الزمني | reviewed_at، created_at | القرارات نفسها |
| السجلات المالية والإيصالات والتدقيق | فئات وحقول F005-R2 في الجرد الحالي | جدول محدد لكل فئة، لا موافقة عامة على الحفظ الدائم |

حقول سجل المراجعة الثمانية مطابقة للمخطط المقترح. لا تُحفظ المراجع النصية الأصلية فيه، لكن البصمات ومعرّفات الربط تبقى مستعارة الهوية وقابلة للربط؛ ليست مجهولة الهوية تلقائيًا. الحذف المعزول المقبول يمحو ربط الجهاز الحي ويحفظ الإيصالات وبصمات المراجعة ونقطة التسلسل. هذا إثبات لسلوك الكود، لا موافقة على مدة الاحتفاظ. سياسة حذف حساب التاجر لا تحسم مدة حفظ الفئات المالية أو الدليل الأصلي.

يُستكمل لكل فئة: المعتمد، والغرض، والقراء، وبداية المدة ومدتها، والحجز وإطلاقه، والتصرف النهائي، واختبارات قبل/عند/بعد الانتهاء. تبقى F005-R1/R2/R3 مفتوحة، وF005-R4/R5 محجوبة بالأدلة والتفويض المستضاف.

طلب المتابعة أو نجاح الاختبارات أو إعداد اقتراح لا يسجل اعتمادًا. تُحفظ الموافقات بنطاقها؛ لا تنتقل موافقة نموذج المراجع إلى الاحتفاظ أو المنح أو النشر.

الخطوة التالية: الحصول على اختيار نموذج المراجعين، ثم إعداد عقد إصدار مراجعة يربط الهوية والدليل ضمن المصدر. لا تُعاد اختبارات الترحيل والفحص المقبولة دون تغيير جديد أو فشل جديد.

---

# FIELD005 — bounded retention decisions and recovery acceptance

Reviewed source: `6e94a8e`; reused accepted executable: `acf6c8d`. No application, schema, grant, retention-duration or hosted change. No new runtime or CI claim. FIELD005 remains OPEN; release NO-GO.

The accepted owner/password/deletion, pre-existing emergency ledger guard and canonical creation/deletion serialization proofs are reused within their original scope. The literal purge inventory has 58 SQL statements touching 57 distinct tables in one function; it excludes delegated provider retirement, caller statements, triggers, other entrypoints and external copies. These counts are not a complete P0 or privacy denominator.

| Remaining item | Decision needed | Current boundary |
|---|---|---|
| F005-R1 | Purpose, readers, trigger/duration and disposition for requesting-admin identity snapshots/reviewer links | Merchant snapshots are redacted; admin snapshot retention is unapproved |
| F005-R2 | Record/field schedule, holds, expiry and privileged access for financial/receipt/audit anchors | Existing scrubbing is not approval of indefinite retention or anonymity |
| F005-R3 | Versioned privacy/integrity contract for emergency payloads and duplicated incident/admin identity | Audited-merchant deletion stays409; no exception or hash rewrite |
| F005-R4 | Authorized historical damage inventory and trusted-payload recovery | No hosted incident or repair proven; unrecoverable content stays explicitly unverifiable |
| F005-R5 | Copy inventory, backups/media/exports and restore behavior | Local/source proofs do not establish hosted erasure |

For each policy decision, record the responsible approver, exact fields/purpose, authorized readers, retention trigger and duration, hold rules, final disposition and measurable negative/positive/expiry tests. This is a decision template, not an adopted schedule. No duration is selected here.

Historical recovery must preserve original evidence. A hash cannot reconstruct erased payloads. Only byte-exact original content from independently trusted backup/export can be checked against the original hashes and the whole chain. If unavailable, preserve an explicit unverifiable state. Never fabricate payloads, silently rehash peers, reset genesis or bypass the verifier. Any hosted inspection/write requires separately authorized scope; rehearsal and review precede writes.

Full item-level acceptance criteria, literal SQL/field inventory and original evidence references are in [the machine-readable checklist](evidence/P0-FIELD005-RETENTION-FIELDS-20261025.json). Three bounded runtime items are reused; one source-only inventory item is reconciled. None closes FIELD005 or approves hosted/complete field coverage.

Next executable gate: inspect the existing CASHIER-SYNC-SEQUENCE-001 remainder and live admission/drain path before selecting new work. Retention policy/design and hosted recovery remain explicit dependencies rather than reasons to repeat accepted deletion tests.
