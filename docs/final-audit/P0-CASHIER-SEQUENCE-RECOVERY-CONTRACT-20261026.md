## مطابقة دليل رفض البروتوكول وتحضير قرار SEQ-R2 — 2026-10-27

الحالة: **الدليل الموجود كافٍ للحد السلبي المسمّى؛ لا اختبار أو تشغيل CI جديد**. المصدر المراجع242821b938b3a7183831ee043ca77cb815ffbb9b؛ آخر مصدر تنفيذي مقبول يبقى711fd97d989b3733e68af7e1a094fe92dfb08d74. [المطابقة في ملف HTTP الموجود](evidence/P0-CASHIER-SEQUENCE-OPERATOR-HTTP-20261026.json#protocolNegotiationReconciliation20261027).

وجدت المطابقة الحالات الست الموجودة للبيع والإرجاع والإلغاء قبل أولcommit وبعد وجود نتيجةlegacy قابلة للإعادة. كل حالة تستخدم6 متغيرات root-level للبروتوكول/stream، أي36طلبHTTP و36رفضًا مباشرًا في core، مستنتجة من الحلقات المثبّتة ومطابقة أسماء الحالات الست مع سجلاتPASS، وليست طلبات جديدة أوtraffic capture. النتيجة409/CASHIER_SYNC_PROTOCOL_UNSUPPORTED، دونaccepted_entity_ids أوorder_id، ومع ثبات8جداول مختارة:orders/order_items/inventory_mutations/cashier_device_operation_timeline/location_inventory_levels/cashier_operation_attribution/cashier_device_streams/cashier_operation_receipts. ضوابطprotocol1 والـreplay المطابق ناجحة في الملف نفسه.

الأدلة المعاد استخدامها: [40548267115/job122345188807](https://github.com/nora953/fawri-production-source/actions/runs/40548267115)، الملفcashier-historical-compensation-http-postgres.integration.test.mjs=28TAP تشمل الآباء؛ الحزمة829TAP/97استدعاء/94ملفًا،0فشل/تخطٍّ/إلغاء. مصدرها711fd97d989b3733e68af7e1a094fe92dfb08d74 وcheckoutcff91d4bcae5a9cc55358fc5199877ba108c6131 لهما شجرةdccf936a9783bd34f9a1d3267c36628a1fa0caad المتطابقة. نتائج58/58CI السابقة ما زالت ناجحة؛ لم تُعد تشغيلها هذه الدفعة. طابقت9blobs مصدر/اختبار بالبايت وبصمةGit، وأكدت أن الفروق من المصدر المقبول إلى نقطة المراجعة توثيق فقط.

طبقة الإثبات: Express staff/commerce routers فعلية علىloopback مع بيانات دخول محطة/مشغّل حقيقية وSQL مقيّد وauth منفصل. app.ts يركّب رموز الراوتر نفسها، لكن هذا fixture لا يشغّل سلسلةapp.ts الكاملة. لا اعتماد كامل لكلJSON أوالأدوار/الحقول؛ متغيرات الستة root-level فقط، ودفاتر تجديد الجلسة خارج ثبات الجداول المالية المختارة. رفضv2 ليس قبول رفعv2 أوACK/recovery ناجحًا، ولا يعالج فجواتv1 أوينشئ مصدر مراجعة أصلية.

### قرار وظيفي محدد جاهز للمراجعة — SEQ-R2

الحالة **CONCRETE_PRODUCT_CHOICE_READY_NOT_ADOPTED**؛ selectedModel=null وapproval=UNAPPROVED. [السجل الآلي داخل التصميم الموجود](evidence/P0-CASHIER-SEQUENCE-DESIGN-20261026.json#seqR2OperationCompatibilityDecision20261027). هذا حسم لنطاق المزامنة المستقبلية والتعامل مع العملية غير المدعومة؛ لم ينفّذ أي تغيير.

| المجال | الخيار المقترح للمزامنة الجديدة |
|---|---|
| العمليات المدعومة فيv2 | البيع والإرجاع والإلغاء، مع حركات المخزون التابعة لكل عملية كجزء منها |
| التعديل اليدوي المحلي المستقل الجديد | رفضه فيوضعv2 المعتمد قبل أي كتابة للمخزون أوالعداد أوالحركة أوالطابور؛ لا استهلاك رقم تسلسل |
| تعديلاتmovement-only القديمة | إبقاء الحركة والحمولة والعداد وحالة المخزون والطابور اللاحق محفوظة وHOLD للمراجعة الخاصة بالسجل؛ لا حذف أوACK أوتجاوز أوtombstone أوبيع مصطنع أوbackfill |
| الوضعlegacy وإدارة المخزون الحالية على الإنترنت | لا تغيير أوحذف API أوترميز رجعي معتمد بهذا الاختيار؛ لا إنشاء مسار رفع جديد للتعديل المحلي |

المقصود بالتعديل المستقل هوadjustInventory المحلي، وليس حركة المخزون الناتجة عن بيع/إرجاع/إلغاء. مصدره الحالي يغيّر المخزون فعلًا ويستهلك العداد؛ كل منdrain القديم وoperator drain يحفظ العملية غير المدعومة ويتوقف. ضيق مراجعة عدم وجودUI caller ليس إذنًا بحذف البيانات أوتخطيها.

البديل: تأجيل القرار مع إبقاءv2 غير مدعوم واستكمال عملP0 المستقل. الموافقة على المقترح، إن وردت، تخص عقد المصدر وحدّه المستقبلي واختباراته اللازمة فقط؛ لا تفعّلv2، ولا تقبل مراجعة أصل جهاز أوتُجيز تصحيح مخزون/مال تاريخي أوسياسة احتفاظ/حذف أونموذج مراجع أوgrants أوترقية0053 أواستضافة. هذه المتطلبات تبقى مفتوحة حتى لو اعتمد هذا الحد.

السؤال المحدد: **هل نعتمد للمزامنة الجديدة البيع والإرجاع والإلغاء فقط، مع منع التعديل اليدوي المحلي المستقل قبل أي كتابة جديدة فيوضعv2، وحفظ تعديلات المخزون المحلية القديمة للمراجعة دون إسقاطها؟**

سبب الحاجة إلى اختيار صريح: AGENTS.md ينص “Plan approval does not approve policies, hosted actions, merge or deployment.” طلب «أكمل» لا يملأ هذا القرار غير المعتمد، ولا تُستنتج منه موافقة على حقول السياسات الأخرى. لم يطلب هذا السجل مراجعة مالك منصة للربط العادي؛ آلية ربط التاجر الموجودة تبقى مرجعها.

لا منطق تطبيق أوschema/ACL أواختبار أوتشغيل جديد؛ لا بوابة كاملة مغلقة.45حالة دونتغيير:29 CLOSED_SOURCE/7 OPEN/9 BLOCKED؛ completeP0Inventory=false،overallPercentage=null، **NO-GO**؛ لاhosted/merge/deploy/P1/P2.

---

## قبول تصحيح تطابق إعادة الإرجاع والإلغاء المحلي — 2026-10-27

المصدر المقبول **711fd97d989b3733e68af7e1a094fe92dfb08d74**: **58/58 مسار CI ناجح**، دون معلّق أوفاشل أوملغى عند القبول. [الدليل في الملف الموجود](evidence/P0-CASHIER-NATIVE-OUTBOX-20261026.json#localCompensationReplay20261027). هذه حالة فرعية داخل شرط الهوية غير القابلة للتبديل في CASHIER-SYNC-SEQUENCE-001/SEQ-R1، وليست بوابة جديدة أوإغلاقًا للتسلسل.

رُوجع المسار الفعلي: فحص جلسة/صلاحية المشغّل وظهور البيع فيcashierOperatorHistoryRuntime ثمbase ثمIndexedDbCashierCompensationAuthority. smoke الموجود يثبت الإعادة المطابقة والسعر الأصلي وبعض حالات الرفض وإعادة الفتح؛ اختبارreturn-pricing مصدرّي؛native23 السابق لا يغيّر مدخلات إعادة التعويض. جرى تحديد الفجوة قبل إضافة5 حالات إلى harness الموجود، دونجرداختبارات شامل مزعوم أوإعادة اختبار غير مرتبط.

**الإثبات قبل الإصلاح:** المصدر01eebd026fc33c3bf43b02001d4f0876fe77447b غيّر الاختبار ومرشّح workflow فقط؛ التطبيق لم يتغير. [native40547891355/job122343355851](https://github.com/nora953/fawri-production-source/actions/runs/40547891355):26PASS/2FAIL من28 فيChrome155. قُبلت5 تغييرات إرجاع (الكمية،هوية السطر،الترتيب،عدد الأسطر،الملاحظة) وتغيير ملاحظة الإلغاء وأُعيدت النتيجة القديمة؛ تغيير البيع/النوع رُفض أصلًا. لم تُثبت هذه المحاولة أثرًا مخزنيًا إضافيًا، لكن النتيجة المعادة لم تطابق الطلب الجديد. بقيت المخازن كما هي. المحاولة غير مقبولة:CI41نجاح/1فشل/16إلغاء؛ لم تُحسب الإلغاءات نجاحًا.

**التصحيح المحدود:**21سطرًا فيخدمة التعويض المحلي الموجودة؛ تمرير المدخلات المطبّعة مسبقًا إلىreplayOperation ومقارنتها بالملاحظة ومعرّفات/كميات أسطر الإرجاع وترتيبها المحفوظ. الاختلاف يعيدCASHIER_COMPENSATION_OPERATION_ID_CONFLICT الموجود، دونإعادة تسعير أوكتابة أوتغيير سجلقديم. ترتيب الطلب المحفوظ جزء من المقارنة؛ لا فرز أوتطبيع تاريخي جديد. فحوص المشغّل والحساب المالي وصلاحيات الخادم وآلية الربط لم تتغير.

[native40548267829/job122344689717](https://github.com/nora953/fawri-production-source/actions/runs/40548267829): **28/28 حالة ناجحة**، منها5 جديدة تشمل9 تغييرات طلب مرفوضة مع مطابقة جميع مخازن قاعدةfixture المحلية؛ الإعادة المطابقة بعدتطبيع المسافات وبعدإرجاع آخر وتحديث الكتالوج والإقرار وإعادة فتح القاعدة مع حفظ المبلغ الأصلي وعدمإعادة الطابور؛ عطلput فعلي عندالطابور بعدالكتابات السابقة، يتراجع معهكل المخازن فيالإرجاع والإلغاء ثمينجحretry مرةواحدة (عداد+1/مخزون+1)، وإعادته المطابقة لا تغيّر شيئًا؛ وطلبا إرجاع متزامنان يعطيان العملية نفسها مع حركة واحدة وحفظ لقطاتpeer المختارة. هذا تزامن طلباتnative وليس برهان تداخل أقفالSQL مفروض. المبلغ هنا snapshot محلي، لا تحويل مالي أوردّ أموال منمزود.

[المتصفح الأوسع40548267765/job122344692634](https://github.com/nora953/fawri-production-source/actions/runs/40548267765) نجح فيsmoke/النسخة القديمة والطابور ذيالنقل المصطنع. [SQL الأوسع40548267115/job122345188807](https://github.com/nora953/fawri-production-source/actions/runs/40548267115): **829TAP/97استدعاء/94ملفًا**،0فشل/تخطٍّ/إلغاء، تشمل الآباء ولا تتضمن28حالةnative. TypeScriptAPI/frontend والبناء والأمنtracked/historyPASS. checkout **cff91d4bcae5a9cc55358fc5199877ba108c6131** يطابق شجرة المصدر **dccf936a9783bd34f9a1d3267c36628a1fa0caad** فيnative/browser/typecheck/security/SQL؛ شجرة المحاولة الأولى طابقت مصدرها أيضًا. بصمتا الاستعادة المعزولة متطابقتان؛ مراجعة الأصل فيfixture تبقى مفترضة.

التالي: Reconcile actual public operator sale/return/void HTTP protocol negotiation against accepted tests and evidence. Select a new case only if the existing requirement that public v2/stream markers remain unsupported lacks mounted real-HTTP proof; then verify refusal without tenant financial, stock, timeline or receipt mutations using current authenticated routes. Reuse accepted local replay, snapshot, binding and merchant pairing evidence. No new issuer, routine owner approval, baseline reset or v2 activation; SEQ-R2 compatibility and trusted original-review decisions remain pending.

صُحح مؤشرnextAction القديم فيحزمة قرارات الترقية ليتبع قائمة التنفيذ الحالية بدلتوليد اختبار ربطHTTP إضافي تلقائيًا؛ لم يُعتمد نموذج مراجع أوصلاحيات أوسياسة احتفاظ. تبقى سياسةmovement-only والمراجعة الأصلية والقبول/الاستعادة العامة مفتوحة. لاAPI/schema/ACL/OTP/issuer أوترقية0053 أوبيئة مستضافة أوmerge/deploy/P1/P2.45حالة البوابات دونتغيير:29 CLOSED_SOURCE/7 OPEN/9 BLOCKED؛ completeP0Inventory=false،overallPercentage=null، **NO-GO**.

---

## قبول ربط فحص الاستعادة بهوية الجهاز والمحطة — 2026-10-27

المصدر المقبول **e73fe8d90552d71d2a5953c17c757202956c4241**: **58/58 مسار CI ناجح** في النتيجة النهائية. [الدليل في الملف الموجود](evidence/P0-CASHIER-NATIVE-OUTBOX-20261026.json#deviceBindingRecovery20261027). أُنجز شرط الوصلة المحلية المسماة داخل CASHIER-SYNC-SEQUENCE-001/SEQ-R3؛ لا بوابة جديدة أوإغلاق كامل.

أضيف inspectCashierDeviceRecovery إلى runtime الهوية الموجود: يقرأ هويةbootstrap الموجودة فقط، يستدعي الفحص المحلي المتسق ثم يعيد قراءة الربط. تغيّر التاجر المحلي/السحابي أوالجهاز أوالمحطة أوالموقع أوالفرع أوالرمز المرصود أثناء القراءة يعيدHOLD ويحجب العداد ومجموعات العمليات القديمة. صلاحية الربط المحلي لا تحوّل فحصًا ناقصًا إلى نجاح. لا يناديgetOrCreate أوتنظيف الجلسة أوتحديث/استعادة الربط القديم أوHTTP. القيم السرية تُقارن داخل الذاكرة ولا تظهر في النتيجة. existingOnly يمنع إنشاء/ترقيةbootstrap أوcashier DB أثناء التشخيص، ويحفظ السلوك الاعتيادي للمستدعين الحاليين.

المقارنة رصد لقيم محلية قبل/بعد، وليست مصادقة خادم أوإثبات جهاز مادي أومعاملة/lease بين قاعدتي بيانات. لا تثبت غياب تبديلABA أوتغيّر لاحق بعدالإرجاع. الجلسة والصلاحية التاريخية لكل عملية، ومصدر مراجعة الجهاز الفارغ، وحدود كمال التخزين والحقول المالية تبقى في نطاقاتها المنفصلة. enrollment_authorized=false وserver_history_verified=false دائمًا؛ لا مسار اعتماد إنتاجي أوv2 عام.

[المتصفح المباشر40542265726/job122323490587](https://github.com/nora953/fawri-production-source/actions/runs/40542265726): **23/23 حالة ناجحة** فيChrome155، منها8 جديدة للوصلة: bootstrap غائب دون إنشاء، ربط ثابت مع حفظ المخازن والجلسة وغياب الشبكة/الرمز في النتيجة،7 تغييرات ربط فعلية بين القراءتين مع حجب الرؤية القديمة، هوية ناقصة دون إصلاح، إلغاء معاملةbootstrap قبل/بعد قراءة العمليات مع نجاح retry، مخزن كاشير غائب/نسخة1 دون إنشاء/ترقية، نقلHOLD للفحص الناقص رغم ثبات الربط، وإعادة تحميل صفحة فعلية تحفظ الربط والعمليات. الحالات الـ15 السابقة أعيدت كاختبارات انحدار ذات صلة بتغيّر القارئ، دونجمع الأعداد كمتطلباتP0.

[المتصفح الأوسع40542264858/job122323486885](https://github.com/nora953/fawri-production-source/actions/runs/40542264858) نجح فيsmoke والنسخة القديمة والطابور؛ النقل فيه مصطنع، ليسHTTP خادمًا. [SQL الأوسع40542267782/job122323500992](https://github.com/nora953/fawri-production-source/actions/runs/40542267782): **829TAP/97استدعاء/94ملفًا**،0فشل/تخطٍّ/إلغاء؛ يشمل الآباء ولا يتضمن23 حالة الفحص المباشر. typecheckAPI/frontend والبناء وفحص tracked والتاريخ الأمني الكاملPASS. checkout **b6116ea67545709b6453ef02bbdf46046436a609** يطابق شجرة المصدر **e412a5656c71db81ebae9c7d3387b6c533c35d5e** في سجلاتnative/browser/typecheck/security/SQL وإعادة الوظيفة. بصمتا الاستعادة المستقلة متطابقتان؛ مراجعة الأصل فيfixture ما زالت مفترضة.

حُفظ تعثر تهيئة مستقل: تشغيل40542265603/job122323490316 أنهى24 اختبارًا ناجحًا، ثم انتهت مهلة تشغيلChrome قبل أي نتيجة متصفح (browser=null/results=[]). لم يُعدّل التطبيق أوالاختبارات لمعالجته؛ أُعيدت الوظيفة المتعثرة وحدها على المصدر نفسه. المحاولة2/job122324821539 نجحت:24 اختبارًا و8 حالاتnative فيChrome156، مع بقاء النقل المصطنع وحدوده. لا قبول للمحاولة الأولى ولا تجاهل/تخفيف assertion.

التالي: Reconcile existing local return/void replay input identity against the current accepted tests and the existing SEQ-R1 immutable replay requirement. The bounded source trace checks operation kind/sale ID before returning an old compensation; first establish whether changed valid quantity/lines/note are already rejected in executable coverage. Add only the missing native regression and smallest confirmed fix while retaining exact retries and no second stock/refund effect. This is the existing sale/return/void matrix, not a new gate; trusted enrollment, movement-only policy and public v2 handoff remain pending.

ملاحظة الخطوة التالية مصدرية فقط: replayOperation فيcashierCompensationAuthority يتحقق من النوع ومعرّف البيع قبل إعادة تعويض قديم؛ مطابقة رفض تغيّر كمية/أسطر/ملاحظة مع التغطية المقبولة لم تنفّذ في هذه الدفعة، ولا يُدّعى فشلruntime أوإصلاح لها. هذا جزء من شرط هوية sale/return/void الموجود، ولا يضيف بوابة أويوسّع العدد.

لا تغييرAPI/schema/ACL أوآلية الربط أوOTP أوissuer أوترقية0053 أوبيئة مستضافة؛ لاmerge/deploy/P1/P2. الحالات45 دون تغيير:29 CLOSED_SOURCE/7 OPEN/9 BLOCKED؛ completeP0Inventory=false، overallPercentage=null، **NO-GO**.

---

## قبول فحص التخزين المحلي وتصحيح إعادة محاولة البيع — 2026-10-27

المصدر المقبول **389679488185e9d81a8edc120fdfdeaff4130efd**: **58/58 مسار CI ناجح**، دون معلّق أو فاشل أو ملغى عند القبول. [الدليل في السجل الموجود](evidence/P0-CASHIER-NATIVE-OUTBOX-20261026.json#localRecoverySnapshot20261027). هذه وصلة تنفيذية داخل CASHIER-SYNC-SEQUENCE-001/SEQ-R3 وشرط هوية إعادة المحاولة القائم، وليست بوابة جديدة أو إغلاقًا لكامل التسلسل.

أُضيف inspectLocalRecoverySnapshot إلى سلطة IndexedDB الموجودة: قراءة العداد والطابور والمبيعات والحركات في معاملةreadonly واحدة؛ تجميع المكوّنات حسب العملية، وفحص الربط البنيوي مع السجلات المحلية، وإرجاعHOLD عند النقص أو التعارض أو الفشل أو تجاوز الحد. حد الفحص1000 سجل لكل مخزن مختار؛ لا يشهد بكمال التاريخ الأصلي أو بالهوية في قاعدةbootstrap المنفصلة. INSPECTED نتيجة فحص محلي فقط؛ enrollment_authorized=false وserver_history_verified=false دائمًا. لا مسح أوACK أوreset أوقبولstream، ولا ربط بمسار اعتماد إنتاجي.

كشف التشغيل الأول خطأً حقيقيًا فيcommitSale: معرّف عملية موجود أعاد البيع القديم عند تغيير كمية صحيحة. التصحيح يقارن حقائق الطلب الأصلية المحفوظة قبل الإعادة، ويعيدCASHIER_SALE_OPERATION_ID_CONFLICT عند الاختلاف؛ لا يعيد التسعير من الكتالوج الحالي. ثبت رفض10 تغييرات مع حفظ لقطات المبيعات/المخزون/الطابور، وبقاء الإعادة المطابقة بعد نفاد المخزون والإقرار وإعادة فتح التخزين دون أثر ثانٍ أو إعادة إدراج. التصحيح محصور بالبيع المحلي، وليس اعتمادًا شاملًا لإعاداتreturn/void أوالخادم.

[الفحص المباشر40530364376/job122281161856](https://github.com/nora953/fawri-production-source/actions/runs/40530364376): **15/15 حالة ناجحة** فيChrome155؛11 حالة جديدة (10 للفحص وحالة للإعادة المطابقة)، مع توسيع اختبار الاختلاف الموجود إلى10 تغييرات. يشمل معاملات بيع/إرجاع/إلغاء محلية فعلية، نقص مكوّنات، حدود الفحص، عدادًا مفقودًا/غير آمن/غير رقمي/متأخرًا، اختلاف هوية، تعديل مخزون غير مدعوم محفوظًا، تعارض التسلسل/الحركة، إلغاء معاملة حقيقيًا، طلب كتابة متزامنًا، وإعادة تحميل الصفحة وإغلاق المقبض. التزامن المطلوب ليس برهانًا عامًا علىlinearizability أوحاجز تداخل أقفال مفروض.

[المتصفح الأوسع40530364674](https://github.com/nora953/fawri-production-source/actions/runs/40530364674): smoke والنسخة الاحتياطية القديمة وطابور الشبكة المصطنعPASS. تأخر تجهيزChromium ثم بدأ الاختبار ونجح؛ ليس فشل تطبيق. [SQL الأوسع40530364597/job122281417333](https://github.com/nora953/fawri-production-source/actions/runs/40530364597): **829TAP/97استدعاء/94ملفًا**،0فشل/تخطٍّ/إلغاء، تشمل الآباء ولا تتضمن15 حالة الفحص المباشر. typecheckAPI/frontend والبناء ناجحان، وفحص tracked والتاريخ الأمني الكاملPASS. checkout **ecad6582ded9b91de25a16d7d99f82855d25d6c8** يطابق شجرة المصدر **ece51baa845c500280fc83ccdd4776db0206339e** في سجلات الفحص/المتصفح/SQL/الأنواع/الأمن. بصمتا الاستعادة المستقلة متطابقتان؛ مراجعة الأصل فيfixture ما زالت مفترضة وليست اعتماد إصدار.

المحاولة الأولى **cfd9cfa252dedcae0da32fc4d789601f4cc9873f** محفوظة وغير مقبولة: الفحص المباشر13PASS/1FAIL، مع نجاح10 حالات الفحص الجديدة وفشل شرط اختلاف البيع الموجود؛CI52نجاح/1فشل/5إلغاء. لم يُخفف الاختبار؛ صُحح التطبيق وأضيفت حالة الإعادة المطابقة.

التالي: Expose the existing authority's read-only recovery snapshot through the current cashier device runtime, checking bootstrap merchant/device/station binding before and after the IndexedDB read. Native binding-change or incomplete-read cases must HOLD without writes. No enrollment grant, public v2 activation, pending-work pairing bypass or new issuer; trusted original review, legacy/movement disposition and expired-credential recovery remain pending.

لا تغييرAPI/schema/ACL أوالربط أوالبروتوكول العام أوترقية0053 أوخدمات مستضافة.45 حالة البوابات دون تغيير:29 CLOSED_SOURCE/7 OPEN/9 BLOCKED؛ completeP0Inventory=false وoverallPercentage=null؛ **NO-GO**. لاmerge/deploy/P1/P2.

---

## SEQ-R3 admission and compatibility specification — 2026-10-27

Status: **REVIEWABLE_SPECIFICATION_ONLY_NOT_ADOPTED**. Existing gate CASHIER-SYNC-SEQUENCE-001 stays OPEN. This revision completes the previously named specification prerequisite; it does not certify device provenance, activate protocol2, grant SQL capabilities or close SEQ-R1/R2/R3. Source pinned to `8171f07f55c0e9e04c9899744d6368a5b2531812`; last executable acceptance remains `205b5eca8908885a676ec02cd3643faf64f5fe22`. No runtime/CI is claimed by this revision.

### Authority and evidence inputs

Ordinary pairing uses the merchant's existing code and existing station credential authority. The source issuer checks operational merchant access, active station and licensed seat; redemption locks station before challenge, checks unused/unexpired challenge, rotates credentials and consumes the code. None of those steps enrolls a stream. A station credential authorizes the bound device/station; the caller-supplied device ID is not hardware attestation and does not prove a new physical computer. Operator permissions, historical operation authority and offline entitlement remain separate checks.

The existing client `pairCashierStation` refuses pending envelopes before sending its request. That count is a local guard, not an independent provenance assertion, an atomic cross-database snapshot or a server admission grant. Its current behavior remains unchanged. In particular, a known device with pending work and expired credentials must HOLD for the unresolved recovery path; this proposal does not bypass that guard or claim that normal re-pairing already recovers it.

| Input | Trusted use | Insufficient use |
|---|---|---|
| Existing merchant pairing and current authenticated station context | Merchant/station/device credential binding and current permission checks | Empty-history claim, arbitrary baseline, physical uniqueness or historical operation approval |
| Server stream and immutable receipts | Existing stream identity, committed checkpoint and exact replay result, under scoped transaction/locks | MAX of old timeline, client-supplied stream ID, automatic conversion of legacy rows |
| Server history assessment | Scoped signals from timeline, cashier sales/compensations, attribution and streams | Empty/contiguous result as an enrollment grant; the read-only statement does not lock concurrent writers |
| Local recovery snapshot | Compatibility inspection of original counter, operation groups and envelope identity from one coherent local transaction | Trusted server provenance, merely counting envelopes, a limited prefix presented as the complete queue |
| Existing independent empty-device review capability | Reviewed counter0/pending0 manifest after real authorized original review and serialized server recheck | A browser JSON assertion, pairing response, synthetic fixture or the disconnected issuer candidate treated as real review |

No new issuer, OTP, hardware identity system or routine platform-owner approval is selected. Current code has no trusted automatic original-local-state attestation. Therefore **absence of server history plus a client assertion cannot automatically enroll an unknown legacy identity**. Automation may resume a previously admitted, compatible stream after all checks; first enrollment still needs the already specified trusted provenance, whose real operational source remains unresolved. This is an explicit implementation boundary, not a reason to send every ordinary pairing to the platform owner.

### Coherent local compatibility rules

Let N be the server's committed checkpoint for an already verified stream, and M the persisted local counter. Both must be nonnegative safe integers represented without lossy conversion. Read counter and outbox groups together in the existing device database; identity stored in the separate bootstrap database must match before/after inspection, and any binding change invalidates the snapshot. A database read failure, partial inspection, version/identity mismatch or scan bound reached produces HOLD, never EMPTY. A snapshot is diagnostic and can become stale: future admission must prevent local allocation/binding races and recheck server authority under its normal locks.

Group envelopes by immutable operation identity and sequence: a sale's multiple envelopes are one operation, not multiple sequence steps. Validate required members, merchant/device/station/location linkage, supported kind, payload and operation identity. Conflicting identities at one sequence or one identity at multiple sequences are HOLD. Do not reconstruct missing members from a different operation. Retained movement-only adjustments remain UNSUPPORTED/HOLD; their nonzero stock effect cannot become a tombstone.

For sequences above N, complete supported operation groups must cover N+1 through M without gaps. M<N is RESTORE_REVIEW_REQUIRED; do not raise M to N. Pending groups at or below N are retained for authenticated exact replay against their individual receipts; the checkpoint alone cannot ACK them. Successfully acknowledged past operations need not remain in the pending queue. Thus neither an empty queue with M=N nor absence of already acknowledged historical envelopes is itself a defect. With M>N and a missing pending group, HOLD even when some later groups are present. Native snapshot compatibility never supplies the missing independent review needed for new or legacy enrollment.

### Deterministic classification

These are proposed internal disposition names, not newly implemented HTTP codes.

| Observed state | Proposed disposition and permitted next step |
|---|---|
| Current merchant pairing succeeds, no admitted stream proven | PAIRED_ONLY. Preserve identity and history; evaluate provenance/compatibility separately. No implicit stream creation |
| Trusted original empty review, counter0/pending0, no conflicting server signals, all authority/readiness prerequisites valid | EMPTY_ENROLLMENT_ELIGIBLE for the existing reviewed-empty capability only. Recheck history under shared merchant/device serialization before committing one stable stream; a read-only precheck cannot authorize it |
| Unknown/legacy identity with no server signals and client counter0/empty queue, but no trusted original review | PROVENANCE_REVIEW_REQUIRED; retain state, no enrollment or assumed zero |
| Local queue starts at1 but is already nonempty and no admitted stream exists | LEGACY_REVIEW_REQUIRED. Existing reviewed-empty primitive explicitly requires pending0; do not falsely pass its manifest or discard the queue |
| Existing verified active stream, same bindings, M=N and queue empty | RESUME_ELIGIBLE after fresh authority/readiness checks. Keep same stream/checkpoint; no re-enrollment |
| Existing stream with complete compatible pending groups, M>=N | REPLAY_THEN_RESUME_ELIGIBLE. Resolve any pending <=N by exact replay/attribution ACK; admit new groups >N contiguously only after protocol acceptance |
| Same-device credential/operator/shift rotation | Preserve same stream/counter/receipts. If local pending guard blocks re-pairing, HOLD; token rotation cannot clear work |
| Replacement device at same station | Preserve prior device stream/receipts. New device follows its own provenance classification; never inherits checkpoint or pending operations merely through station pairing |
| Legacy history numerically contiguous but lacks matching immutable receipts/provenance | LEGACY_REVIEW_REQUIRED. No import at MAX, no rehash or automatic legacy-to-v2 conversion; existing primitive supports reviewed empty only |
| Restored M<N, missing local groups, altered receipt digest, conflicting identity or unsafe/truncated inspection | RESTORE_REVIEW_REQUIRED. Retain local records and server evidence; block v2 upgrade/new allocation in the proposed recovery flow. No blanket ACK/reset/backfill |
| Retired/review stream, wrong tenant/device/location, revoked authority or unavailable required key/readiness | HOLD or existing authorization denial. Do not recreate the stream, revive credentials or expose peer evidence |

“Eligible” is a diagnostic prerequisite, not permission to write. Existing public routes continue returning CASHIER_SYNC_PROTOCOL_UNSUPPORTED for protocol2 or stream markers. Current legacy behavior is not silently replaced by this table.

### Failure, concurrency and exceptional recovery

Pairing and later admission are separate transactions. A successful pairing followed by admission failure leaves PAIRED_ONLY with no new receipt/checkpoint; retry must use current credentials rather than consume the used code again. Do not claim atomic rollback across pairing, server admission and IndexedDB. If the server commits admission but its response/local persistence is lost, future recovery must authenticate and discover that same binding/review result; never create another stream to recover an uncertain response. This is missing integration acceptance, not an available endpoint.

Before any future writable admission, acquire the existing merchant/station/device locks in the reviewed compatible order, re-read current credential/binding and server history, and make the existing authority transaction reject a concurrent legacy write or device replacement. Exact receipt replay precedes new financial effects and requires original attribution repair before final ACK. The client retains groups on timeout, ambiguous result or failed local ACK persistence. No response from pairing or diagnostic snapshot may be passed to acknowledgeSynced.

Exceptional intervention belongs to the platform owner only under an explicit record-specific recovery authority yet to be adopted. The proposed recovery record must identify merchant/device/station/stream, original evidence, affected operations, reason, requested action, authorized reviewer and resulting disposition. Safe actions at this stage are inspection and preserved HOLD; approve no reset, deletion, manufactured receipt, financial correction or retention change through this document. If reconciliation needs a financial/stock action or migration of legacy history, its exact effect and audit/replay/rollback contract require separate approval and executable proof. No universal “owner override” bypasses invariants.

### Missing acceptance mapped to actual seams

| Named condition | Reused accepted layer | Missing integration proof |
|---|---|---|
| Existing pairing keeps history on same/replacement device and refuses used-code replay | b15f4b8 service/SQL continuity | Any newly activated admission path must prove it derives binding from actual authenticated context, not body claims |
| Local snapshot is complete/coherent and survives fault/reload | Existing native hold/replay fixture is reused at its stated layer | Counter+complete operation grouping in one IndexedDB snapshot; scan bound, malformed group, unsupported operation and binding change produce HOLD with no mutations |
| Unknown fresh/legacy and concurrent first admission | Existing read-only history and internal reviewed-empty proposal | Actual authorized original review and integrated locked enrollment; synthetic original/reviewer assumptions do not supply it |
| Known/restored device, lost admission/operation response | Internal immutable receipt, rollback/concurrency and native synthetic lost-ACK proofs | Authenticated HTTP plus real native transport: same stream, exact receipt/attribution ACK, retained outbox and no duplicate financial effect |
| Replacement/expired credentials with pending original work | Existing pairing client guard and credential invalidation | Adopted original-device recovery authority and historical operation entitlement; no bypass selected |
| Legacy/movement-only compatibility | Existing unsupported hold | SEQ-R2 product/disposition contract and explicit supported operation set before public activation |

Next bounded executable prerequisite: Implement a bounded read-only coherent local recovery snapshot on the existing IndexedDB authority, with native fault/reload/overflow/unsupported-envelope cases. It must read counter and complete operation groups in one transaction, report incomplete inspection as HOLD, and grant no enrollment, pairing, ACK, reset or public v2 capability. Reuse existing merchant pairing and SQL history proofs; keep trusted original-review provenance, legacy migration policy and HTTP/native v2 activation pending.

This is one extension of the existing recovery contract, with the machine-readable summary in the existing design evidence. No duplicate proof artifact or new release gate. All45 known statuses remain29 CLOSED_SOURCE/7 OPEN/9 BLOCKED; completeP0Inventory=false, overallPercentage=null, release NO-GO.

---

## مطابقة المتبقي الحالي — 2026-10-27

هذا التحديث يوضح الحالة الحالية ويُبقي الأقسام المؤرخة أدناه في نطاقها التاريخي. تخزين0052 وبدء التشغيل والحذف والاستعادة مقبولة ضمن المصدر؛ مرشح0053 وفحصه مقبولان ضمن fixtures فقط. لا يظل تبني تخزين0052 معلقًا كما يوحي العنوان التاريخي أدناه. بوابة CASHIER-SYNC-SEQUENCE-001 نفسها ما زالت OPEN، والإطلاقNO-GO.

| المتطلب القائم | المقبول الذي يُعاد استخدامه | الوصلة التي تمنع الإغلاق |
|---|---|---|
| SEQ-R1 | معاملات وإيصالات داخلية، replay وأعطال وتزامن محدد، وتشخيص HTTP القديم وإعادة إصلاح الإسناد | سلوك admission/ACK/hold/recovery متكامل للبروتوكول المختار عبر HTTP والعميل الفعلي؛ الواجهة العامة ما زالت ترفضv2 |
| SEQ-R2 | حفظ العملية غير المدعومة والطابور وعدمACK/تجاوزها | حسم دورة API التعديل المحلي والسجلات movement-only القديمة؛ غياب مستخدم UI في مسح محدود لا يجيز حذفها أو إنشاء ميزة جديدة |
| SEQ-R3 | رمز الربط الحالي بإدارة التاجر، فحص التاريخ والتخزين والقدرات والاستعادة، وحفظ التاريخ عند إعادة الربط | عقد قبول موثوق للأجهزة الجديدة/المعروفة/المستعادة يربط الصلاحية والطابور والتاريخ دون MAX أو reset أو ادعاء أن رمز الربط يثبت جهازًا فارغًا |

الربط العادي لا يحتاج اعتماد مالك المنصة لكل جهاز. لا تمنح هذه المطابقة صلاحيات أو تعتمد الاحتفاظ أو تنشر شيئًا. الأدلة الداخلية، والنقل المصطنع في المتصفح، ورفض HTTP العام طبقات مختلفة؛ لا تُجمع لتكوين قبول غير منفّذ. التفاصيل القابلة للقراءة آليًا: [closureGapMap20261027](evidence/P0-CASHIER-SEQUENCE-DESIGN-20261026.json).

الخطوة التالية: إعداد مواصفة واحدة قابلة للمراجعة داخل هذا العقد لحد قبول SEQ-R3 باستخدام مسارات الربط والطابور والتاريخ الفعلية؛ توضيح الدليل الموثوق المطلوب والاستثناءات بدل إنشاء مرشح إصدار منفصل أو تكرار إثباتات داخلية مقبولة.

---

# CASHIER-SYNC-SEQUENCE-001 — recovery contract candidate

Status: SEQ_D1_ACCEPTED_SEQ_D2_PROPOSAL_SQL_CONSTRAINTS_RLS_CONCURRENCY_ACCEPTED_CANONICAL_PROMOTION_PENDING_NOT_RELEASE_ACCEPTED. Gate OPEN; release NO-GO. This document authorizes no financial/timeline repair, tombstone, device reset, production write or hosted rollout. A diagnostic PASS is not recovery acceptance.

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

## SEQ-D2 disposable SQL proposal accepted; canonical promotion pending — 2026-10-26

Accepted source **0edf291bb5d172a76ff6f840af70db710d3f6503**, **56/56 CI SUCCESS**. [Cashier run40261736753](https://github.com/nora953/fawri-production-source/actions/runs/40261736753):32 TAP/14 invocations; new proposal fixture4 TAP(parent+3 subtests). [Broader run40261736766](https://github.com/nora953/fawri-production-source/actions/runs/40261736766):728 TAP/93 invocations/91 files, zero failed/skipped/cancelled. Synthetic checkout tree matches source. [Evidence](evidence/P0-CASHIER-STREAM-STORAGE-PROPOSAL-20261026.json).

Draft stream/immutable receipt SQL is outside the canonical migration journal. Owned disposable SQL tests verify restricted tenant reads, denied runtime writes, atomic receipt/checkpoint constraints, contiguous sequence and merchant-wide operation identity, and station/location/staff/shift foreign keys. Fixture tables are removed after tests. Canonical schema/journal and live admission are unchanged. Synthetic root-created receipts are not financial effect or trusted enrollment proof; no concurrency/restore/hosted acceptance is claimed.

Next: reconcile through canonical Drizzle generation and verify RLS/privacy/readiness/restore and deletion constraints before canonical promotion. SEQ-D2 is partially verified, not complete; D3/D4 remain open. **CASHIER-SYNC-SEQUENCE-001 OPEN; NO-GO.** Register remains45 rows=29 CLOSED_SOURCE/7 OPEN/9 BLOCKED, incomplete inventory, no overall percentage.


## SEQ-D2 canonical promotion review — 2026-10-26

The verified proposal remains outside the migration journal. Do not copy it into0052 unchanged. Source review identifies these concrete integration requirements:

| Boundary | Current source | Required before promotion |
| --- | --- | --- |
| Historical generation | `lib/db/scripts/generate-migration.mjs`, stages/preimages | Declare additive schema through a stage and reproduce historical bytes; do not hand-edit old snapshots/journal |
| Readiness | `postgresRuntimeRlsSecurity.ts:PRODUCTION_PROTECTED_RLS_TABLES` | Include adopted tables and test missing RLS/ownership/privilege denial; scoped reads require intentional grants |
| Deletion/privacy | `postgresMerchantManagementAuthority.ts` rewrites device identity in `cashier_device_operation_timeline` and `cashier_operation_attribution` | Proposal immutable receipts/stream contain raw device IDs and current deletion has no handling for them. Resolve erasable identity mapping versus immutable financial proof; current proposal is not deletion/privacy compatible by evidence |
| Restore | `full-schema-restore-postgres.integration.test.mjs` | Extend canonical dump/restore proof to stream data, trigger definitions/state, constraints, ACLs and restricted reads; current generic fingerprint does not prove this uninstalled proposal |
| Financial authority | Canonical sale/return/void writers and attribution repair | Add receipt creation within original financial transaction; root-created synthetic result IDs are not financial integrity proof |
| Admission | Existing device timeline accepts gaps | D3 must change admission only after explicit opt-in/version/replay/enrollment contract; no enrollment from MAX or client assertions |

Current concurrency regression uses root setup SQL for two proposal receipt writers; it tests database row-lock constraints, not the canonical financial writer or operator HTTP. No production migration, privacy decision or retention policy is adopted by this review.

## SEQ-D2 device identity revision2 — 2026-10-26

This revision supersedes the raw device column design of revision1; earlier evidence remains historical. Revision2 removes `device_id` from immutable proposal receipts. The receipt FK uses the stable `(stream_id,merchant_id)` identity. A stream keeps its active raw device binding as a separate nullable attribute; retirement must atomically set state=retired and device_id=NULL. The opaque stream ID, merchant, protocol, committed checkpoint and existing receipts remain unchanged. Rebinding an active stream, silently nulling its binding, retiring without erasing it, and reopening/rebinding a retired stream are rejected. No enrollment/reset authority is introduced; any later new stream requires the independently verified enrollment contract.

The regression runs real PostgreSQL with synthetic root setup/writers. A waiting receipt writer is observed blocked on retirement via pg_blocking_pids, then rejects after retirement commits. Runtime scoped DML cannot retire the stream. Existing receipt rows and another merchant's selected stream remain exact. This proves only the proposal's raw device binding erasure mechanism. It does not implement owner deletion, approve a retention duration, anonymize all operation/request/result/staff identifiers or hashes, erase backups, or prove receipt financial provenance. No hosted/canonical migration/admission changes occur.

Before canonical promotion: wire an authorized lifecycle retirement operation into the merchant deletion transaction and test rollback/whole merchant/peer behavior; reconcile all retained fields with FIELD005 policy; generate additive canonical schema and verify readiness/restore. D3/D4 remain pending.

## SEQ-D2 deletion transaction bridge candidate — 2026-10-26

The proposal SQL now includes a trigger bridge on the existing merchant retention transition to deleted. It retires every non-retired target stream, clears device binding, and increments only those stream versions. It is installed only by the disposable fixture, outside canonical schema/journal. The trigger function uses a fixed pg_catalog search path and qualified objects, has PUBLIC execute revoked, and verifies the session LOGIN has the existing authentication capability and restricted role flags before exercising its narrowly coded definer update. This is a candidate capability, not an accepted hosted owner/grant plan; canonical promotion needs a least-privilege non-login owner and readiness checks.

The fixture calls the unchanged actual `createDeletionRequestPostgres` and `completeMerchantDeletionPostgres` service using a separate restricted authentication LOGIN. It does not mock the deletion algorithm. An account-close fault deliberately occurs after uncommitted stream retirement; the fault verifies retirement was reached before raising. Target merchant/account/request/cashier/stream/receipt snapshots must roll back exactly, followed by successful retry with active and review streams retired and an already retired stream unchanged. Another merchant and immutable receipts remain exact. Direct primary invocation or merchant-state mutation is rejected. A deleted target cannot enroll a new proposal stream or append a receipt; repeated service deletion is rejected without mutation.

The stream INSERT guard also checks and key-share locks the merchant row so a completed deletion cannot be followed by fresh enrollment. Nullable retention_status is an existing valid non-deleted state and is compared with IS DISTINCT FROM deleted; plain <> incorrectly rejected those rows in the first failed candidate. This is not positive enrollment provenance and does not grant automatic baseline/reset/reenrollment authority. No canonical schema, live API wiring, owner HTTP authorization coverage, production retirement function owner or migration/restore acceptance is claimed by this bounded service/SQL fixture. FIELD005 retention and historical/backup decisions remain open.

## SEQ-D2 proposal bridge with actual deletion service accepted — 2026-10-26

Accepted source **3fdc89edc5500b511b3cdcd492e67bc3a5b99b80**,56/56 CI SUCCESS. [Cashier40267010329/job121391499858](https://github.com/nora953/fawri-production-source/actions/runs/40267010329):35 TAP/14 invocations; proposal fixture7 TAP(parent+6 subtests). [Broader40267010218/job121391707258](https://github.com/nora953/fawri-production-source/actions/runs/40267010218):731 TAP/93 invocations/91 files,0 failed/skipped/cancelled; checkout tree matches source. [Evidence](evidence/P0-CASHIER-STREAM-DELETION-TRANSACTION-20261026.json).

Unchanged canonical deletion service runs with separate restricted auth LOGIN and proposal-only retention-transition trigger. Post-retirement account fault verifies all target bindings were retired before raising, then exact selected merchant/account/request/cashier/stream/receipt rows roll back. Retry completes deletion, retires active/review streams, preserves already retired stream, all selected immutable receipts and peer business/proposal snapshots. Direct primary invocation/state change denied; deleted enrollment and append denied; repeated deletion leaves selected target unchanged.

Initial candidate c0120e5072f5803784e3dec68907c4e82d54aa7b failed fixture0 PASS/1 FAIL because plain <> rejected valid NULL retention state. Corrected with IS DISTINCT FROM; failed/cancelled/superseded runs are not accepted.

Boundary: proposal trigger/tables installed and removed only in owned disposable SQL, not canonical schema/journal or hosted. No owner HTTP/media/backup acceptance, financial provenance or retention-policy adoption. Definer uses root fixture owner; canonical least-privilege non-login ownership/readiness/restore still pending. Next: canonical generation and reviewed ownership/trigger/readiness/dump-restore verification before adoption; preserve FIELD005 policy blockers and current admission. **Sequence gate OPEN; NO-GO.** Register45=29 CLOSED_SOURCE/7 OPEN/9 BLOCKED, incomplete inventory, no percentage.


## SEQ-D2 retirement owner candidate — 2026-10-26

The disposable fixture now moves the proposed retirement definer off the bootstrap superuser to a dedicated NOLOGIN/NOSUPERUSER/NOBYPASSRLS/NOCREATEDB/NOCREATEROLE/NOINHERIT/NOREPLICATION role. It owns the trigger function only, no tables or indexes. Public schema CREATE is revoked after ownership transfer. It receives SELECT on streams and UPDATE only on state, device_id and version. Explicit owner-only SELECT/UPDATE policies let this non-table-owner role see and retire non-retired rows, with new state constrained to retired and raw binding NULL. It cannot change checkpoints/merchant/stream identity/enrollment proof or read/mutate receipts, merchants or accounts. Primary and authentication LOGINs cannot use/SET this owner role and have no standalone execute grant on its trigger function. The session authentication guard, fixed search path and qualified SQL remain required.

The unchanged canonical deletion-service fault/retry fixture runs under this owner plan. Revoking its UPDATE(version) column grant must fail deletion closed and preserve exact selected target and peer snapshots; restoring that grant permits the existing later-fault rollback and final success tests. This is a bounded disposable privilege candidate, not a canonical owner migration or a hosted role/grant change. Canonical generation/readiness and dump/restore must preserve this owner, column ACLs, policies, function/trigger definitions and negative/positive behavior before adoption.

## SEQ-D2 non-login column-limited retirement owner accepted — 2026-10-26

Accepted source **e822ba57b63d6eb06b30ed86582f71d0cab28916**,56/56 CI SUCCESS. [Cashier40306955203/job121518318946](https://github.com/nora953/fawri-production-source/actions/runs/40306955203):36 TAP/14 invocations; proposal fixture8 TAP(parent+7 subtests). [Broader40306955254/job121518317522](https://github.com/nora953/fawri-production-source/actions/runs/40306955254):732 TAP/93 invocations/91 files,0 failed/skipped/cancelled; checkout tree matched. [Evidence](evidence/P0-CASHIER-RETIREMENT-OWNER-20261026.json).

Retirement definer runs as dedicated NOLOGIN/non-superuser/non-BYPASSRLS/non-creator/non-inheriting owner of function only, not tables/indexes. No schema CREATE remains. SELECT streams and UPDATE(state,device_id,version) only, with explicit owner RLS read/retirement policies. Checkpoint/identity/enrollment mutation and receipt/account/merchant grants absent. Primary/auth LOGINs cannot use/SET role or directly execute trigger function. Unchanged actual deletion service succeeds; revoked UPDATE(version) makes deletion fail42501 and selected target/peer rows roll back; restored grant passes existing post-retirement fault/retry and exact receipt/peer checks.

Boundary: fixture-only role/grants/ownership and proposal tables; no canonical schema/journal or hosted mutation. Earlier root-owner evidence is historical. Next: proposal-inclusive dump/restore preserving owner/column ACL/policy/trigger/denial and valid deletion, then canonical Drizzle/readiness promotion. Financial receipt provenance, FIELD005 policy and hosted gates remain unaccepted. **Sequence gate OPEN; NO-GO.** Register45=29 CLOSED_SOURCE/7 OPEN/9 BLOCKED; inventory incomplete, no percentage.


## SEQ-D2 proposal-inclusive restore candidate — 2026-10-26

The owned full-schema drill now seeds the proposal tables, two merchants' synthetic stream/receipt rows, a restricted reader LOGIN and non-login column-limited retirement owner before pg_dump. Its launcher retains pg_restore ownership statements instead of --no-owner. The existing schema fingerprint additionally compares public function owners, policy role bindings, proposal column ACLs, user trigger definitions/enabled state, proposal rows and owner/reader role flags. Native CHECK normalization remains in place.

Both phases execute actual restricted reader LOGIN tests: raw/forged tenant GUC reads denied, trusted issuer scopes reveal only each own merchant, direct mutation/trigger execution and owner role activation denied. Immutability rejects root receipt update. After restore only, the unchanged canonical deletion service executes with a separate restricted auth LOGIN; retired binding is NULL, original checkpoint/receipt rows survive and selected peer stream remains exact.

Boundary: roles are preprovisioned in the same owned disposable cluster and persist while a fresh database is restored. This is not lost-cluster role bootstrap, hosted backups, PITR, RPO/RTO, production approval or canonical migration adoption. Proposal objects remain outside the journal, so the two added fixture tables do not increase the canonical schema's table count. Separate `scripts/backup-postgresql.mjs` and `scripts/restore-postgresql.mjs` still omit owners/privileges; this drill does not certify those tools for the proposed owner/ACL model. Before canonical promotion, reconcile those paths or an explicit owner/ACL bootstrap plan, canonical Drizzle/readiness and FIELD005 policy.

## SEQ-D2 proposal-inclusive database restore accepted — 2026-10-26

Accepted source **553e08f7223e5ea242b813f3edc0e270f0c4784c**,56/56 CI SUCCESS. [Broader40309933849/job121528266491](https://github.com/nora953/fawri-production-source/actions/runs/40309933849):734 TAP/93 invocations/91 files,0 failed/skipped/cancelled; source/checkout tree matched. Restore seed2 TAP and verify2 TAP(parent+1 child each). [Evidence](evidence/P0-CASHIER-STREAM-RESTORE-20261026.json).

Custom pg_dump/owner-preserving pg_restore to a fresh database yields identical fingerprint before/after: public function owners, policy role bindings, proposal column ACLs, user triggers/enabled state, proposal JSON data and role flags included. Real restricted reader tests own-tenant positive/raw+forged-GUC negative, no direct mutation/trigger execution/owner activation in both phases. Immutable receipt mutation rejected. Actual unchanged deletion service after restore retires target with NULL binding/checkpoint1 preserved; receipts and selected peer stream exact.

Owned cluster97 public tables include2 noncanonical proposal tables; canonical95 tables/52 migrations unchanged. Global roles are preprovisioned in same disposable cluster: not lost-cluster role bootstrap, hosted/PITR/RPO/RTO/media/financial provenance acceptance. Separate backup-postgresql/restore-postgresql scripts omit owner/ACL and are NOT certified by this drill. Initial31b4e2885415fa28eb75bfcd7707c7c1bc4993f7 seed2 PASS but verify0 PASS/2 FAIL lacked explicit operational authority for service fixture; corrected test configuration, prior failure preserved.

Next: reconcile separate backup/restore ownership/ACL paths and role bootstrap, then canonical Drizzle/readiness promotion; FIELD005 policy, legacy adoption and live admission remain pending. **Sequence gate OPEN; NO-GO.** Register45=29 CLOSED_SOURCE/7 OPEN/9 BLOCKED, incomplete inventory, no percentage.


## Disposable backup CLI security contract v2 — 2026-10-26

`backup-postgresql.mjs` now emits v2 metadata declaring preserve-owners-acls and explicit preprovision-global-roles-before-restore. It no longer asks pg_dump to omit owners/privileges. `restore-postgresql.mjs` requires that v2 security contract, checks size/hash, retains pg_restore ownership/ACL statements and keeps existing loopback/database-name/env/verification-SQL restrictions. Old v1 data-only manifests are rejected before invoking restore; no old dump is rewritten, promoted by metadata editing or certified for owner/ACL restoration.

The existing workflow-owned backup CLI drill seeds a table with a non-login function owner, column UPDATE(value) authority, reader role and RLS. After creating the archive it removes the source database and both named fixture roles. Explicit static NOLOGIN/non-privileged role definitions recreate them with no inherited object grants; restoring the archive must reconstruct function owner, column ACLs and policies. Data hash must match before the positive retirement mutation. Reader scope/cross-row negative, denied execute metadata and valid definer write are checked after restore.

This is a bounded generic two-role bootstrap contract using owned synthetic data, not a full FAWRI global-role disaster-recovery plan, secrets/login provisioning or hosted acceptance. The separately accepted full-schema proposal drill retains preprovisioned roles; these proofs are complementary and do not assert a combined fresh-cluster full-FAWRI recovery. Canonical migration/readiness, complete role bootstrap and FIELD005 policy remain pending.

## SEQ-D2 backup CLI v2 owner/ACL and explicit two-role bootstrap accepted — 2026-10-26

Accepted source **926fac511bc507b37475f00e574e3468cfec73a8**,56/56 CI SUCCESS. [Backup drill40311588593/job121533837949](https://github.com/nora953/fawri-production-source/actions/runs/40311588593):22 contract tests PASS/0 FAIL/0 skipped plus real workflow-owned PostgreSQL archive/restore/bootstrap proof. Local CLI19 PASS. [Broader40311588482/job121533847068](https://github.com/nora953/fawri-production-source/actions/runs/40311588482):734 TAP/93 invocations/91 files,0 failed/skipped/cancelled; source/checkout tree matched. [Evidence](evidence/P0-BACKUP-CLI-OWNER-ACL-20261026.json).

Backup v2 preserves owners/ACL and declares required global-role preprovisioning. Restore requires v2 security metadata/size/hash and no longer omits ownership/privileges. Legacy v1 data-only descriptions rejected before tool invocation; old archives untouched. Existing guards/loopback/database/URL-option/routing-env/verification-SQL restrictions preserved. Real CLI drill drops source DB and both fixture roles, recreates explicit non-login restricted definitions, restores data hash/function owner/column ACL/RLS, tests reader scoped positive/cross-row negative and valid definer mutation. Future-only cutover templates aligned; no production command executed.

Boundary: generic two-role bootstrap, not complete FAWRI global/login/credential recovery or hosted disaster recovery. Reader uses SET ROLE in this generic drill; separate full proposal restore already supplies real restricted LOGIN proof. Canonical95 tables/52 migrations and current admission unchanged. Next: additive canonical Drizzle/schema/readiness preparation with explicit non-login owner provisioning; preserve history and keep full role bootstrap, FIELD005 policy, live financial receipts and hosted requirements open. **Sequence gate OPEN; NO-GO.** Register45=29 CLOSED_SOURCE/7 OPEN/9 BLOCKED; incomplete inventory, no percentage.


## SEQ-D2 generated 0052 candidate — 2026-10-26

The additive schema/SQL/stage candidate lives under `evidence/seq-d2-canonical-candidate`, outside active schema and migration journal. The CI-only preparation script copies the existing cashier-staff schema as the0052 preimage, overlays the candidate in its ephemeral checkout, lets the canonical generator create metadata, then verifies reviewed SQL through the existing reviewed_sql stage path. It asserts all52 historical SQL and52 historical snapshots are byte-identical and old journal entries retain order/content. Candidate metadata has53 journal entries and97 tables; active source remains52/95.

The dedicated workflow applies that candidate to owned network-isolated PostgreSQL and runs the existing restricted management contracts. Generated SQL/snapshot/journal are exported for review, not silently adopted. The first candidate generated successfully with104 historical files unchanged but actual migration rejected42703 because a referenced SQL column used camelCase merchantId rather than merchant_id. Corrected SQL and its reviewed hash are a separate candidate source; the failed attempt is not acceptance.

Remaining before adoption: move generated artifacts through the canonical paths, adapt the storage/restore fixtures to consume the committed schema rather than recreate proposal objects, add tables/function owner/column ACL/trigger checks to readiness, run exact-source migration/tenant/storage/deletion/restore acceptance. No new admission/client/enrollment or hosted action is authorized by candidate generation. Complete FIELD005 policy and full FAWRI role/credential bootstrap remain open.

## SEQ-D2 generated0052 candidate bounded accepted; full-source CI pending browser setup — 2026-10-26

Candidate source **b55328a2a3410cbb94b13b4ba2ba5085a8560336**. [Generation40315005720/job121545272842](https://github.com/nora953/fawri-production-source/actions/runs/40315005720) SUCCESS:104 historical SQL/snapshot files byte-identical, old journal entries preserved, candidate53 migrations/97 tables; reviewed SQL applied in owned offline PostgreSQL and restricted management contracts6 TAP PASS/0 failed/skipped. Generated SQL/snapshot/journal saved under evidence/seq-d2-canonical-candidate/generated with verified SHA256 and sizes. [Broader40315005751/job121545708032](https://github.com/nora953/fawri-production-source/actions/runs/40315005751):734 TAP/93 invocations/91 files,0 failed/skipped/cancelled; exact source tree matched. [Evidence](evidence/P0-CASHIER-CANONICAL-CANDIDATE-20261026.json).

**56/57 CI SUCCESS; browser40315005762/job121545272094 pending in Playwright/Chromium installation, observed about10 minutes with application test not started. No browser PASS/FAIL inferred. Last fully accepted source remains926fac511bc507b37475f00e574e3468cfec73a8.** New dedicated workflow increases total from56 to57. Initial109166ff8f10dd061d3431beb3c3bc246d52c1c7 generated history correctly but SQL migration rejected42703 from camelCase reference; corrected candidate separately; failed/superseded runs not accepted.

Active schema/journal remain52 migrations/95 tables. Candidate only, not adopted; no admission/client/hosted change. Next: resolve pending CI then promote generated artifacts only together with storage/restore fixture adaptation, new table/owner/ACL/trigger readiness checks and candidate-workflow update; run exact-source acceptance. Full FIELD005 policy and role/credential bootstrap remain open. **Sequence gate OPEN; NO-GO.** Register45=29 CLOSED_SOURCE/7 OPEN/9 BLOCKED; inventory incomplete, no percentage.


## SEQ-D2 internal metadata readiness candidate — 2026-10-26

The previously pending browser job40315005762/job121545272094 completed successfully; source b55328a2a3410cbb94b13b4ba2ba5085a8560336 has57/57 CI SUCCESS. Installation delay was not an application test failure.

The new internal SELECT-only inspector accepts trusted caller-supplied primary/authentication role names and checks candidate table RLS, exact scoped read policy, absence of public writes, owner retirement policy shape, non-login owner/caller flags and membership reachability, owner column allowlist and extra grants, approved function body hashes/security/search_path/owner/PUBLIC execute, and expected enabled/deferred trigger bindings. It returns operationalAdoption=false; no active API/readiness route calls it yet. These are catalog observations, not authentication, concurrent-DDL attestation or complete financial/retention policy proof.

In owned candidate PostgreSQL, a real restricted LOGIN runs the positive inspector inside BEGIN READ ONLY. Thirteen independent metadata faults are injected by fixture admin transactions, each rejected with the specific readiness issue; rollback restores the valid configuration and selected stream/receipt snapshot. Faults include RLS, owner flags/grants/membership/capability, function grants/path/security/body, trigger disabling, and broadened read/write/owner policies. Existing management contracts still run alongside this fixture. Candidate53/97 remains ephemeral; active52/95, historical bytes and admission unchanged.

Before adoption, wire reviewed checks to actual readiness, adapt storage/restore tests to consume generated committed tables and update the candidate workflow. Candidate acceptance does not close CASHIER-SYNC-SEQUENCE-001 or FIELD005.

## SEQ-D2 internal read-only metadata readiness accepted; prior browser pending resolved — 2026-10-26

Accepted source **11f7e55dd59aa5674822dc3557973acc9440fef0**,57/57 CI SUCCESS. [Candidate40318675833/job121557666907](https://github.com/nora953/fawri-production-source/actions/runs/40318675833):21 TAP/0failed/skipped across existing management6 and new readiness15(parent+positive+13 metadata faults). Historical104 files unchanged; candidate53/97 generation remains reproducible. [Broader40318676078/job121557667401](https://github.com/nora953/fawri-production-source/actions/runs/40318676078):734 TAP/93 invocations/91 files,0 failed/skipped/cancelled; exact source tree matched. [Evidence](evidence/P0-CASHIER-CANDIDATE-READINESS-20261026.json).

Prior b55328a2a3410cbb94b13b4ba2ba5085a8560336 also reached57/57: browser40315005762/job121545272094 completed SUCCESS with actual IndexedDB/stale-backup PASS; previous installation delay is resolved, not an application failure.

New inspector uses catalog SELECTs; actual restricted LOGIN positive runs READ ONLY. Checks include RLS/policies, owner/caller flags and reachability, column/grant boundaries, function body hashes/security/search_path/owner/PUBLIC execute, enabled/deferred trigger bindings.13 actual metadata fault transactions each rejected; rollback restores positive state and selected stream/receipt rows. Trusted caller supplies role names; this is not actor authentication, concurrent-DDL attestation or complete business/privacy proof. Returns operationalAdoption=false; no live readiness wiring.

Active schema remains52/95, candidate53/97 ephemeral. Next: promote generated artifacts together with fixture adaptation, reviewed live readiness wiring and workflow update; require exact-source storage/deletion/restore/role denials before adoption. FIELD005 policy/full role bootstrap/hosted remain open. **Sequence gate OPEN; NO-GO.** Register45=29 CLOSED_SOURCE/7 OPEN/9 BLOCKED, incomplete inventory, no percentage.


## SEQ-D2 canonical0052 adoption — 2026-10-26

Generated0052/schema/preimage/snapshot/journal now occupy canonical source paths. Migration history0000-0051 remains unchanged. Canonical schema is53 migrations/97 public tables. The reviewed SQL provisions/reuses a strictly checked NOLOGIN column-limited retirement owner, preserves immutable receipt/checkpoint/tenant constraints and erases raw device binding on retirement. The deletion bridge returns immediately when no non-retired streams exist, preserving legacy deletion behavior; populated streams still require trusted session authority.

Storage/restore fixtures now use committed tables instead of creating/dropping proposal objects. Owned fixture cleanup deletes only its generated rows inside a rollback-safe cleanup transaction with the immutable DELETE trigger restored; application code has no trigger-disable path. Full restore seeds canonical0052 and preserves roles/function owners/column ACL/RLS/triggers/data. Historical proposal filenames are retained for evidence continuity, not an assertion that tables remain uncommitted.

Production startup calls `assertProductionCashierStreamStorageReady` after global database RLS readiness and before owner bootstrap/providers/listener. It reads actual primary and separately authenticated role identities; mismatch/missing/unsafe metadata fails with PRODUCTION_CASHIER_STREAM_STORAGE_NOT_READY. It is a startup gate, not continuous or concurrent-DDL attestation. The checker is SELECT-only and reports releaseAccepted=false; release remains NO-GO. New protected tables are included in the global RLS/non-row privilege inventory.

The canonical storage workflow now verifies adopted history rather than overlaying a candidate. Complete fresh-schema and cross-lane structural harnesses share bootstrap composed from reviewed scope/marker/stream SQL; they are not a replacement for full historical canonical actor/privacy tests. Prior failed attempts are preserved: fresh harness missing private prerequisites, then an inventory expecting18 instead of20 cashier tables. Updated inventory explicitly requires both new tables and preserves all per-table privilege assertions.

This adopts storage and source readiness only. No live financial receipt writer, positive enrollment authority, gap recovery/admission/client protocol or hosted deployment is introduced. SEQ-D3 must integrate receipt creation with the actual financial transaction and exact replay/attribution handling; ambiguous histories remain held. FIELD005/full role/credential/hosted requirements remain open.

## SEQ-D2 canonical0052 source storage/startup readiness/deletion/restore accepted — 2026-10-26

Accepted source **3bb3c67717a17da1cba903047e35f2b622b997b1**,57/57 CI SUCCESS. [Canonical40323848241/job121575332020](https://github.com/nora953/fawri-production-source/actions/runs/40323848241):22 TAP/2 files,104 historical SQL/snapshots byte-identical. [Cashier40323848140/job121575332493](https://github.com/nora953/fawri-production-source/actions/runs/40323848140):52 TAP/15 invocations; committed storage8 and startup/catalog readiness16 pass. [Broader40323848365/job121575333763](https://github.com/nora953/fawri-production-source/actions/runs/40323848365):750 TAP/94 invocations/92 files,0 failed/skipped/cancelled, exact source tree matched. Complete schema40323848361 and schema validation40323848333 SUCCESS. [Evidence](evidence/P0-CASHIER-CANONICAL-0052-ACCEPTANCE-20261026.json).

Canonical source is now53 migrations/97 public tables.0052 SQL/schema/preimage/snapshot/journal adopted;0000-0051 bytes preserved. Dedicated NOLOGIN column-limited owner, tenant RLS/immutable receipts/contiguous checkpoint constraints and device-erasing retirement consumed directly by regressions. Legacy merchants with no non-retired streams require no new retirement authority, preserving prior deletion behavior. Production startup verifies actual primary/auth identities and reviewed metadata before providers/listener. No live enrollment/receipt financial writer/admission/client protocol changes.

Full committed schema restore seed2 TAP/verify2 TAP uses53 migrations/97 tables and identical owner/column ACL/policy/trigger/data fingerprints; restricted reads, immutable receipts, post-restore actual deletion and selected peer preservation pass. Global roles preprovisioned in owned cluster, not full lost-cluster credential recovery. Prior failures preserved: fresh schema helpers lacked private bootstrap; then old inventory expected18 rather than20 cashier tables. Shared reviewed bootstrap and explicit two-table inventory corrected without weakening per-table denials. Initial browser prerequisite timeout was not an application test; only current57/57 establishes full source acceptance.

Next: SEQ-D3 trusted financial-transaction receipt/admission and exact replay/attribution repair with verified enrollment and unsupported-operation hold. Preserve legacy admission/ambiguous histories. FIELD005/full role bootstrap/hosted gates remain open. **CASHIER-SYNC-SEQUENCE-001 OPEN; release NO-GO.** Register45=29 CLOSED_SOURCE/7 OPEN/9 BLOCKED; incomplete inventory, no percentage. No merge, deployment or hosted change.

