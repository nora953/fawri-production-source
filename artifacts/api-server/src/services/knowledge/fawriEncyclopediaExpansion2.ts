import type { CuratedArticle } from "./fawriEncyclopedia.js";

export const FAWRI_ENCYCLOPEDIA_EXPANSION_V2_ARTICLES: CuratedArticle[] = [
  {
    id: "fawri-global-universal-compatibility",
    scope: "global",
    questions: {
      ar: ["شنو يعني universal بالمنتج", "هل universal يعني يناسب كل شيء"],
      ku: ["universal لە بەرهەم چییە", "ئایا universal واتە بۆ هەموو شتێک گونجاوە"],
      en: ["what does universal mean on a product", "does universal mean it fits everything"],
    },
    answers: {
      ar: "كلمة Universal تعني عادة أن المنتج صُمم للعمل مع نطاق واسع من الأجهزة أو الاستخدامات، لكنها لا تضمن التوافق مع كل حالة. القياسات والموصلات والمتطلبات والموديلات المدعومة في مواصفات المنتج هي المرجع.",
      ku: "وشەی Universal زۆرجار واتە بەرهەمەکە بۆ مەودایەکی فراوان لە ئامێر یان بەکارهێنان دیزاین کراوە، بەڵام گونجان لەگەڵ هەموو حاڵەتێک مسۆگەر ناکات. پێوانە و پەیوەستکەر و داواکاری و مۆدێلی پشتگیریکراو سەرچاوەن.",
      en: "Universal usually means a product is designed to work across a broad range of devices or uses, but it does not guarantee compatibility in every case. Dimensions, connectors, requirements, and supported models in the product specification are the reference.",
    },
  },
  {
    id: "fawri-global-included-accessories",
    scope: "global",
    questions: {
      ar: ["شلون اعرف شنو داخل العلبة", "هل الصور تعني كل الملحقات مشمولة"],
      ku: ["چۆن بزانم چی لە ناو سندوقەکەدایە", "ئایا هەموو شتی وێنەکراو لەگەڵ بەرهەمەکەیە"],
      en: ["how do i know what is included in the box", "are all pictured accessories included"],
    },
    answers: {
      ar: "المحتويات الفعلية يجب أخذها من قائمة ما يشمله المنتج أو وصف العبوة، لأن الصور قد تعرض ملحقات توضيحية أو عناصر تباع منفصلة. إذا لم تكن القائمة واضحة، يجب الاستفسار عن المحتويات المحددة قبل الشراء.",
      ku: "ناوەڕۆکی ڕاستەقینە دەبێت لە لیستی ئەو شتانە وەربگیرێت کە لەگەڵ بەرهەمەکەن یان لە وەسفی پاکەتەکە، چونکە وێنەکان دەتوانن ملحقاتی ڕوونکردنەوە یان شتی جیاواز پیشان بدەن.",
      en: "Actual contents should come from the written included-items list or package description because images may show illustrative accessories or items sold separately. If the list is unclear, the exact included contents should be confirmed before purchase.",
    },
  },
  {
    id: "fawri-global-assembly-required",
    scope: "global",
    questions: {
      ar: ["شنو يعني requires assembly", "هل المنتج يجي مركب"],
      ku: ["requires assembly واتە چی", "ئایا بەرهەمەکە پێشتر کۆکراوەتەوە"],
      en: ["what does requires assembly mean", "does the product arrive assembled"],
    },
    answers: {
      ar: "Requires assembly يعني أن المنتج يحتاج إلى تركيب أو تجميع بعد الاستلام. مقدار العمل والأدوات والقطع المطلوبة يختلف حسب المنتج، لذلك تعليمات التجميع وقائمة الأجزاء المرفقة هي المرجع.",
      ku: "Requires assembly واتە بەرهەمەکە دوای وەرگرتن پێویستی بە کۆکردنەوە یان دانانی هەیە. بڕی کار و ئامراز و پارچە پێویستەکان بە جۆری بەرهەم دەگۆڕێت و ڕێنمایی کۆکردنەوە سەرچاوەیە.",
      en: "Requires assembly means the product needs some setup or assembly after delivery. The amount of work, tools, and parts required varies by product, so the supplied assembly instructions and parts list are the reference.",
    },
  },
  {
    id: "fawri-global-measurement-tolerance",
    scope: "global",
    questions: {
      ar: ["ليش القياس الفعلي يختلف شويه", "هل ابعاد المنتج دقيقة 100 بالمية"],
      ku: ["بۆچی پێوانەی ڕاستەقینە کەمێک جیاوازە", "ئایا قەبارەکان 100% وردن"],
      en: ["why can actual measurements vary slightly", "are product dimensions exact"],
    },
    answers: {
      ar: "قد توجد فروقات بسيطة بسبب طريقة القياس أو التصنيع أو التقريب في المواصفات. إذا كان الفرق الحرج للمساحة أو الملاءمة مهما، استخدم حدود السماحية المذكورة من المصنع أو اطلب قياسا مؤكدا للقطعة.",
      ku: "دەتوانێت جیاوازیی بچووک هەبێت بەهۆی شێوازی پێوانەکردن، بەرهەمهێنان یان نزیککردنەوەی ژمارەکان. ئەگەر گونجان یان شوێن گرنگە، سنووری ڕێگەپێدراو یان پێوانەی پشتڕاستکراو بەکاربهێنە.",
      en: "Small differences can occur because of measurement method, manufacturing tolerance, or rounded specifications. If fit or available space is critical, use the manufacturer's stated tolerance or obtain a confirmed measurement for the exact item.",
    },
  },
  {
    id: "fawri-global-pack-quantity",
    scope: "global",
    questions: {
      ar: ["شنو يعني pack of 2", "السعر للقطعة لو للمجموعة"],
      ku: ["pack of 2 واتە چی", "نرخەکە بۆ دانەیە یان کۆمەڵە"],
      en: ["what does pack of 2 mean", "is the price per item or per pack"],
    },
    answers: {
      ar: "Pack of 2 أو Qty 2 يعني عادة أن العرض يحتوي وحدتين، لكن طريقة التسعير تعتمد على صفحة المنتج نفسها. يجب قراءة عنوان المنتج والكمية ووحدة البيع لمعرفة هل السعر للقطعة أم للحزمة كاملة.",
      ku: "Pack of 2 یان Qty 2 زۆرجار واتە ئۆفەرەکە دوو دانە لەخۆدەگرێت، بەڵام شێوازی نرخدان بە پەڕەی بەرهەم پەیوەستە. ناونیشان و بڕ و یەکەی فرۆشتن دەبێت بخوێندرێتەوە.",
      en: "Pack of 2 or Qty 2 usually means the offer contains two units, but pricing depends on the listing. Read the product title, quantity, and unit of sale to determine whether the displayed price is per item or for the full pack.",
    },
  },
  {
    id: "fawri-global-material-finish",
    scope: "global",
    questions: {
      ar: ["شنو الفرق بين material و finish", "الخامة نفس التشطيب"],
      ku: ["جیاوازی material و finish چییە", "ماددە هەمان finish ـە"],
      en: ["material vs finish", "is material the same as finish"],
    },
    answers: {
      ar: "Material يصف المادة الأساسية التي صُنع منها المنتج، بينما Finish يصف المعالجة أو المظهر السطحي مثل مطفي أو لامع أو مطلي. قد تتشابه قطعتان في المادة وتختلفان في التشطيب.",
      ku: "Material ماددەی بنەڕەتیی دروستکردنی بەرهەمەکە دەناسێنێت، بەڵام Finish شێوە یان چارەسەری ڕووی دەرەوە وەک مات، بریقەدار یان داپۆشراو دەناسێنێت. دوو پارچە دەتوانن هەمان ماددە و finish ـی جیاواز هەبێت.",
      en: "Material describes what the product is fundamentally made from, while finish describes the surface treatment or appearance such as matte, glossy, or plated. Two items can use the same material but have different finishes.",
    },
  },

  {
    id: "fawri-fashion-denim-stretch",
    scope: "activity",
    activityKey: "fashion",
    questions: {
      ar: ["شنو الفرق بين stretch denim و rigid denim", "الجينز المطاط شنو"],
      ku: ["جیاوازی stretch denim و rigid denim چییە", "جینزی کشاو چییە"],
      en: ["stretch denim vs rigid denim", "what is stretch denim"],
    },
    answers: {
      ar: "Stretch denim يحتوي عادة على نسبة من ألياف مرنة تسمح بحركة وتمدد أكبر، بينما rigid denim يكون أقل مرونة غالبا. درجة التمدد الفعلية تعتمد على تركيبة القماش ونسب الألياف وسماكته.",
      ku: "Stretch denim زۆرجار ڕیشەی کشاو تێدایە و جوڵە و کشان زیاتر دەدات، بەڵام rigid denim کەمتر کشاوە. ئاستی کشان بە پێکهاتە و ڕێژەی ڕیشەکان و ئەستووری پارچە پەیوەستە.",
      en: "Stretch denim usually contains elastic fibers that allow more movement and stretch, while rigid denim is generally less flexible. Actual stretch depends on fiber composition, percentages, and fabric weight.",
    },
  },
  {
    id: "fawri-fashion-layering-fit",
    scope: "activity",
    activityKey: "fashion",
    questions: {
      ar: ["شلون اختار قياس جاكيت فوق ملابس", "اخذ نفس قياسي للجاكيت لو اكبر"],
      ku: ["چۆن قەبارەی جاکێت بۆ سەر جل هەڵبژێرم", "جاکێت هەمان قەبارە یان گەورەتر"],
      en: ["how to size a jacket for layering", "should i size up for a jacket"],
    },
    answers: {
      ar: "إذا سيُلبس الجاكيت فوق طبقات سميكة فالمهم مقارنة قياس الصدر والكتف وطول الكم ومساحة الحركة بجدول القطعة. لا توجد قاعدة ثابتة بزيادة مقاس كامل لأن القصة تختلف بين الموديلات.",
      ku: "ئەگەر جاکێت لەسەر چەند چینێکی ئەستوور لەبەر بکرێت، پێوانەی سنگ و شان و درێژی باڵ و شوێنی جوڵە بە خشتەی پارچەکە بەراورد بکە. هەمیشە زیادکردنی یەک قەبارە یاسایەکی ثابت نییە.",
      en: "For a jacket worn over thicker layers, compare chest, shoulder, sleeve, and movement allowance with the garment chart. There is no universal rule to size up by exactly one size because cuts differ between models.",
    },
  },
  {
    id: "fawri-fashion-shrinkage",
    scope: "activity",
    activityKey: "fashion",
    questions: {
      ar: ["هل القطن ينكمش بالغسل", "شلون اعرف القطعة تنكمش"],
      ku: ["ئایا کەتان لە شۆردندا بچووک دەبێتەوە", "چۆن بزانم جل کەم دەبێتەوە"],
      en: ["does cotton shrink in washing", "how do i know if clothing may shrink"],
    },
    answers: {
      ar: "بعض الأقمشة قد تنكمش حسب الألياف وطريقة التصنيع والمعالجة ودرجة الحرارة والتجفيف. لا يمكن تحديد نسبة الانكماش من اسم الخامة وحده، لذلك ملصق العناية وتعليمات المنتج هما المرجع.",
      ku: "هەندێک پارچە بە پێی ڕیشە، دروستکردن، چارەسەر، پلەی گەرمی و وشککردنەوە دەتوانن بچووک ببنەوە. تەنها لە ناوی ماددەکەوە ناتوانرێت ڕێژەکە دیاری بکرێت و لیبڵی چاودێری سەرچاوەیە.",
      en: "Some fabrics can shrink depending on fiber, construction, treatment, wash temperature, and drying method. The amount cannot be determined from the material name alone, so the care label and product instructions are the reference.",
    },
  },
  {
    id: "fawri-fashion-water-resistant",
    scope: "activity",
    activityKey: "fashion",
    questions: {
      ar: ["شنو الفرق بين waterproof و water resistant", "هل water resistant يعني ضد الماء"],
      ku: ["جیاوازی waterproof و water resistant چییە", "ئایا water resistant واتە دژە ئاوە"],
      en: ["waterproof vs water resistant clothing", "does water resistant mean waterproof"],
    },
    answers: {
      ar: "Water-resistant يعني مقاومة مستوى معين من البلل أو الرذاذ، بينما Waterproof يدل عادة على حماية أعلى وفق بناء أو اختبار محدد. الأداء الحقيقي يعتمد على المادة والدرزات والتصنيف وشروط الاستخدام المذكورة للقطعة.",
      ku: "Water-resistant واتە بەرگرییەک لە ئاستێکی دیاریکراوی شێداری یان پشکەوتنی ئاو، بەڵام Waterproof زۆرجار پاراستنی بەرزتر نیشان دەدات. کارایی ڕاستەقینە بە ماددە و دوورین و تاقیکردنەوە پەیوەستە.",
      en: "Water-resistant means resistance to some level of moisture or splashing, while waterproof generally indicates a higher level of protection under a specific construction or test. Real performance depends on materials, seams, rating, and stated use conditions.",
    },
  },
  {
    id: "fawri-fashion-gsm-fabric-weight",
    scope: "activity",
    activityKey: "fashion",
    questions: {
      ar: ["شنو يعني gsm بالقماش", "هل gsm العالي يعني قماش افضل"],
      ku: ["GSM لە پارچە چییە", "ئایا GSM بەرز واتە پارچەی باشتر"],
      en: ["what does gsm mean in fabric", "does higher gsm mean better fabric"],
    },
    answers: {
      ar: "GSM يعني غرام لكل متر مربع ويصف وزن القماش بالنسبة للمساحة. الرقم الأعلى يدل عادة على قماش أثقل، لكنه لا يعني تلقائيا جودة أعلى لأن الجودة تعتمد أيضا على الألياف والبناء والتشطيب والاستخدام المقصود.",
      ku: "GSM واتە گرام بۆ هەر مەتر چوارگۆشە و کێشی پارچە بەرامبەر ڕووبەر دەناسێنێت. ژمارەی بەرزتر زۆرجار پارچەی قورسترە، بەڵام بە خۆی واتای کوالێتی بەرزتر نییە.",
      en: "GSM means grams per square meter and describes fabric weight relative to area. A higher number usually means a heavier fabric, but it does not automatically mean better quality because fiber, construction, finish, and intended use also matter.",
    },
  },

  {
    id: "fawri-electronics-watts-volts-amps",
    scope: "activity",
    activityKey: "electronics",
    questions: {
      ar: ["شنو الفرق بين watt volt amp", "شنو يعني واط وفولت وامبير"],
      ku: ["جیاوازی watt volt amp چییە", "وات و ڤۆلت و ئەمپێر چییە"],
      en: ["watts vs volts vs amps", "what do watt volt and amp mean"],
    },
    answers: {
      ar: "الفولت يصف فرق الجهد، والأمبير يصف التيار، والواط يصف القدرة الكهربائية. في التيار المستمر البسيط تُحسب القدرة تقريبا من الفولت مضروبا في الأمبير، لكن توافق الجهاز والشاحن يجب أخذه من المواصفات المعتمدة.",
      ku: "ڤۆلت جیاوازی کارەبا، ئەمپێر ڕەوتی کارەبا و وات توانای کارەبایی دەناسێنێت. لە DC ی سادەدا توان نزیکەی ڤۆلت × ئەمپێرە، بەڵام گونجانی ئامێر و شارژەر دەبێت لە مواسفات وەربگیرێت.",
      en: "Volts describe electrical potential, amps describe current, and watts describe electrical power. In simple DC cases, power is approximately volts multiplied by amps, but device and charger compatibility must still come from the approved specifications.",
    },
  },
  {
    id: "fawri-electronics-bluetooth-version",
    scope: "activity",
    activityKey: "electronics",
    questions: {
      ar: ["شنو يعني bluetooth 5.3", "هل اصدار البلوتوث الجديد يشتغل ويا القديم"],
      ku: ["Bluetooth 5.3 واتە چی", "ئایا بلوتوثی نوێ لەگەڵ کۆن کار دەکات"],
      en: ["what does bluetooth 5.3 mean", "is newer bluetooth backward compatible"],
    },
    answers: {
      ar: "رقم إصدار Bluetooth يحدد مجموعة من قدرات المعيار، لكن الميزات الفعلية تعتمد على ما يدعمه الجهازان. كثيرا ما توجد قابلية توافق بين أجيال مختلفة، لكن ميزة محددة لا تعمل إلا إذا دعمها الطرفان.",
      ku: "ژمارەی وەشانی Bluetooth کۆمەڵێک توانای ستاندارد دیاری دەکات، بەڵام تایبەتمەندیی ڕاستەقینە بە پشتگیریی هەردوو ئامێرەکە پەیوەستە. زۆرجار وەشانە جیاوازەکان کار دەکەن بەڵام هەر تایبەتمەندییەک پشتگیریی هەردوو لا دەوێت.",
      en: "A Bluetooth version identifies a set of capabilities in the standard, but actual features depend on what both devices support. Different generations are often interoperable, while a specific feature works only when both sides support it.",
    },
  },
  {
    id: "fawri-electronics-wifi-generation",
    scope: "activity",
    activityKey: "electronics",
    questions: {
      ar: ["شنو الفرق بين wifi 5 و wifi 6", "هل wifi 6 يشتغل على راوتر قديم"],
      ku: ["جیاوازی Wi-Fi 5 و Wi-Fi 6 چییە", "ئایا Wi-Fi 6 لەگەڵ ڕاوته‌ری کۆن کار دەکات"],
      en: ["wifi 5 vs wifi 6", "will wifi 6 work with an older router"],
    },
    answers: {
      ar: "أجيال Wi-Fi تحدد قدرات ومعايير لاسلكية مختلفة. الجهاز قد يتصل بجيل أقدم إذا كان يدعمه، لكن السرعة والميزات ستكون ضمن ما يتفق عليه الجهاز والراوتر والبيئة اللاسلكية.",
      ku: "نەوەکانی Wi-Fi توانای جیاوازی بێسیم دیاری دەکەن. ئامێر دەتوانێت بە نەوەیەکی کۆنتر پەیوەست بێت ئەگەر پشتگیری بکات، بەڵام خێرایی و تایبەتمەندی لە سنووری ئامێر و ڕاوته‌ر و ژینگە دەبێت.",
      en: "Wi-Fi generations define different wireless capabilities. A device may connect to an older generation when supported, but speed and features are limited to what the device, router, and wireless environment can actually negotiate.",
    },
  },
  {
    id: "fawri-electronics-usbc-protocol",
    scope: "activity",
    activityKey: "electronics",
    questions: {
      ar: ["هل كل usb c نفس الشي", "usb c يعني نفس السرعة والشحن"],
      ku: ["ئایا هەموو USB-C یەکسانن", "USB-C واتە هەمان خێرایی و شارج"],
      en: ["are all usb c ports the same", "does usb c guarantee the same speed and charging"],
    },
    answers: {
      ar: "USB-C يصف شكل الموصل أكثر من كونه ضمانا لكل الميزات. منافذ وكابلات USB-C قد تختلف في سرعة البيانات وقدرة الشحن ودعم الفيديو، لذلك يجب فحص المواصفات والرموز الخاصة بكل منفذ وكابل.",
      ku: "USB-C زیاتر شێوەی پەیوەستکەر دەناسێنێت و مسۆگەرکردنی هەموو تایبەتمەندی نییە. پۆرت و کابڵەکان لە خێرایی داتا و توانای شارج و ڤیدیۆ جیاوازن و مواسفات دەبێت پشکنرێت.",
      en: "USB-C mainly describes the connector shape and does not guarantee every feature. USB-C ports and cables can differ in data speed, charging power, and video support, so the specification for each port and cable should be checked.",
    },
  },
  {
    id: "fawri-electronics-powerbank-capacity",
    scope: "activity",
    activityKey: "electronics",
    questions: {
      ar: ["ليش باور بنك 10000 ما يشحن بطارية 5000 مرتين كامل", "سعة الباور بنك شلون تنحسب"],
      ku: ["بۆچی power bank ی 10000 باتری 5000 دووجار تەواو شارج ناکات", "گنجایشی power bank چۆنە"],
      en: ["why does a 10000mah power bank not charge 5000mah twice", "how is power bank capacity used"],
    },
    answers: {
      ar: "سعة الباور بنك الاسمية تُقاس عند جهد خلاياه، بينما الشحن الفعلي يتضمن تحويل الجهد وفواقد في الدوائر والكابل والجهاز. لذلك الطاقة التي تصل للبطارية تكون أقل من الحساب المباشر لقيم mAh وحدها.",
      ku: "گنجایشی ناونیشانی power bank لە ڤۆڵتی خانەکانی پێوانە دەکرێت، بەڵام شارجی ڕاستەقینە گۆڕینی ڤۆڵت و ونبوونی وزە لە دایرە و کابڵ و ئامێر هەیە. بۆیە mAh بە تەنها ژمارەی شارجی تەواو دیاری ناکات.",
      en: "A power bank's rated capacity is measured at its cell voltage, while real charging involves voltage conversion and losses in electronics, cable, and device. Therefore the energy reaching the battery is lower than a simple mAh-to-mAh calculation suggests.",
    },
  },

  {
    id: "fawri-food-ingredient-order",
    scope: "activity",
    activityKey: "food",
    questions: {
      ar: ["ليش اول مكون باللستة اكثر", "شلون تنرتب مكونات الغذاء"],
      ku: ["بۆچی یەکەم پێکهاتە زۆرترە", "پێکهاتەکانی خواردن چۆن ڕیزدەکرێن"],
      en: ["how are food ingredients ordered", "does the first ingredient mean the largest amount"],
    },
    answers: {
      ar: "في كثير من أنظمة الملصقات تُذكر المكونات بترتيب تنازلي حسب الوزن وقت التصنيع، لكن قواعد الوسم قد تختلف حسب البلد ونوع المنتج. الملصق الرسمي للعبوة واللوائح المحلية هما المرجع.",
      ku: "لە زۆر سیستەمی لیبڵدا پێکهاتەکان بە پێی کێش لە کاتی بەرهەمهێنان لە زۆرەوە بۆ کەم ڕیزدەکرێن، بەڵام یاساکان بە وڵات و جۆری بەرهەم دەگۆڕێن. لیبڵی فەرمی سەرچاوەیە.",
      en: "In many labeling systems, ingredients are listed in descending order by weight at the time of manufacture, but rules can vary by country and product type. The official package label and local regulations are the reference.",
    },
  },
  {
    id: "fawri-food-after-opening",
    scope: "activity",
    activityKey: "food",
    questions: {
      ar: ["بعد الفتح شكد يبقى المنتج", "هل مدة الصلاحية تتغير بعد فتح العبوة"],
      ku: ["دوای کردنەوە بەرهەمەکە چەند دەمێنێتەوە", "ئایا دوای کردنەوە ماوە دەگۆڕێت"],
      en: ["how long does food last after opening", "does shelf life change after opening"],
    },
    answers: {
      ar: "بعد فتح العبوة قد تتغير ظروف الحفظ ومدة الاستخدام الآمن لأن المنتج يتعرض للهواء أو الرطوبة أو التلوث. يجب اتباع عبارة مثل Refrigerate after opening أو Use within الموجودة على العبوة، وليس تاريخ العبوة وحده.",
      ku: "دوای کردنەوەی پاکەت بارودۆخی هەڵگرتن و ماوەی بەکارهێنان دەتوانێت بگۆڕێت چونکە بەرهەم لەگەڵ هەوا و شێداری و پیسبوون بەرکەوتوو دەبێت. ڕێنمایی سەر پاکەت پەیڕەو بکە.",
      en: "After opening, storage conditions and safe use time can change because the product is exposed to air, moisture, or contamination. Follow instructions such as refrigerate after opening or use within a stated period rather than relying only on the unopened date.",
    },
  },
  {
    id: "fawri-food-frozen-chilled",
    scope: "activity",
    activityKey: "food",
    questions: {
      ar: ["شنو الفرق بين frozen و chilled", "المجمد نفس المبرد"],
      ku: ["جیاوازی frozen و chilled چییە", "بەستوو هەمان ساردکراوە"],
      en: ["frozen vs chilled food", "is frozen the same as refrigerated"],
    },
    answers: {
      ar: "Chilled يعني عادة الحفظ مبردا فوق درجة التجمد ضمن نطاق محدد، بينما Frozen يعني الحفظ مجمدا. درجات الحفظ الفعلية وتعليمات الذوبان وإعادة التجميد تعتمد على ملصق المنتج وتعليمات الشركة.",
      ku: "Chilled زۆرجار واتە هەڵگرتن لە پلەی ساردی سەرووی بەستن، بەڵام Frozen واتە هەڵگرتن بە بەستوو. پلەی ورد و ڕێنمایی توانەوە و دووبارە بەستن دەبێت لە لیبڵی بەرهەم وەربگیرێت.",
      en: "Chilled generally means refrigerated above freezing within a specified range, while frozen means stored in a frozen state. Exact temperatures and thawing or refreezing instructions depend on the product label and manufacturer guidance.",
    },
  },
  {
    id: "fawri-food-concentrate-dilution",
    scope: "activity",
    activityKey: "food",
    questions: {
      ar: ["شنو يعني concentrate", "هل المركز لازم ينخفف"],
      ku: ["concentrate واتە چی", "ئایا پێویستە ماددەی concentrate تێکەڵ بکرێت"],
      en: ["what does concentrate mean on food or drink", "does concentrate need dilution"],
    },
    answers: {
      ar: "Concentrate يعني أن المنتج أو مكونا منه أصبح أكثر تركيزا بإزالة جزء من الماء أو بطريقة تصنيع أخرى. بعض المنتجات تُستخدم مباشرة وبعضها يحتاج تخفيفا، لذلك نسبة التحضير المكتوبة على العبوة هي المرجع.",
      ku: "Concentrate واتە بەرهەم یان پێکهاتەیەک کۆنسەنتراسیۆنی زیاتر هەیە، زۆرجار بە کەمکردنەوەی ئاو یان پرۆسەی تر. هەندێک ڕاستەوخۆ بەکاردێت و هەندێک پێویستی بە تێکەڵکردن هەیە؛ ڕێنمایی پاکەت سەرچاوەیە.",
      en: "Concentrate means a product or ingredient has been made more concentrated, often by removing some water or through another process. Some concentrates are used directly and others require dilution, so the preparation ratio on the package is the reference.",
    },
  },
  {
    id: "fawri-food-country-origin",
    scope: "activity",
    activityKey: "food",
    questions: {
      ar: ["شنو يعني country of origin", "بلد المنشأ نفس بلد التعبئة"],
      ku: ["country of origin واتە چی", "وڵاتی دروستکردن هەمان وڵاتی پاکەتکردنە"],
      en: ["what does country of origin mean", "is country of origin the same as country of packing"],
    },
    answers: {
      ar: "بلد المنشأ وبلد التصنيع أو التعبئة قد لا يكونان دائما الشيء نفسه، وتعريفهما يخضع لقواعد الوسم المحلية. اعتمد على العبارات المحددة الموجودة على الملصق مثل Made in أو Packed in ولا تستنتجها من العلامة التجارية وحدها.",
      ku: "وڵاتی سەرچاوە و وڵاتی دروستکردن یان پاکەتکردن هەمیشە یەک شت نین و پێناسەکانیان بە یاسای لیبڵکردن پەیوەستە. دەقی Made in یان Packed in لەسەر پاکەت سەرچاوەیە.",
      en: "Country of origin, country of manufacture, and country of packing are not always the same concept, and definitions depend on local labeling rules. Use the specific label wording such as Made in or Packed in rather than inferring origin from the brand alone.",
    },
  },

  {
    id: "fawri-perfume-note-pyramid",
    scope: "activity",
    activityKey: "perfumes",
    questions: {
      ar: ["شنو top middle base notes", "ليش ريحة العطر تتغير بعد وقت"],
      ku: ["top middle base notes چییە", "بۆچی بۆن دوای کاتێک دەگۆڕێت"],
      en: ["what are top middle and base notes", "why does fragrance smell change over time"],
    },
    answers: {
      ar: "تقسيم Top وMiddle وBase يصف طريقة ظهور مكونات العطر عبر الوقت: افتتاحية أولى، ثم قلب العطر، ثم روائح أبطأ ظهورا وبقاء. هذا وصف لترتيب الانطباع وليس توقيتا ثابتا لكل عطر.",
      ku: "Top و Middle و Base شێوازی دەرکەوتنی پێکهاتەکانی بۆن بە تێپەڕبوونی کات باس دەکەن: سەرەتا، ناوەڕاست و پاشان بۆنە کەمخێراترەکان. کاتەکان بۆ هەر عەترێک ثابت نین.",
      en: "Top, middle, and base notes describe how fragrance components tend to appear over time: the opening, the heart, and slower-emerging longer-lasting notes. It is a descriptive structure, not a fixed timing schedule for every fragrance.",
    },
  },
  {
    id: "fawri-perfume-nose-blindness",
    scope: "activity",
    activityKey: "perfumes",
    questions: {
      ar: ["ليش ما ابقى اشم عطري", "شنو nose blindness بالعطر"],
      ku: ["بۆچی دوای کاتێک بۆنەکەم هەست پێ ناکەم", "nose blindness چییە"],
      en: ["why can i stop smelling my perfume", "what is nose blindness in fragrance"],
    },
    answers: {
      ar: "قد يقل إحساس الشخص بالعطر بعد التعرض المستمر له بسبب التكيف الحسي، وهذا لا يعني بالضرورة أن الرائحة اختفت من المحيط. التهوية أو الابتعاد لفترة يساعدان على تقييم الرائحة بشكل أفضل.",
      ku: "دوای بەرکەوتنێکی بەردەوام هەستکردن بە بۆن دەتوانێت کەم بێتەوە بەهۆی ڕاهاتنی حەستەکان، بەڵام ئەمە واتای ئەوە نییە بۆنەکە تەواو نەماوە. دوورکەوتنەوە بۆ ماوەیەک یارمەتیدەرە.",
      en: "Continuous exposure can make a person less aware of a fragrance because of sensory adaptation. That does not necessarily mean the scent has disappeared for others. Fresh air or stepping away for a while can help reset perception.",
    },
  },
  {
    id: "fawri-perfume-tester-retail",
    scope: "activity",
    activityKey: "perfumes",
    questions: {
      ar: ["شنو الفرق بين tester و retail perfume", "التستر نفس العطر الاصلي"],
      ku: ["جیاوازی tester و retail perfume چییە", "tester هەمان بۆنە"],
      en: ["tester vs retail perfume", "is a perfume tester the same fragrance"],
    },
    answers: {
      ar: "Tester يشير عادة إلى عبوة مخصصة للعرض أو التجربة وقد تختلف التغليفات أو الملحقات، لكن لا يجوز افتراض أن التركيبة أو الحالة مطابقة دائما من الاسم وحده. وصف البائع ورقم المنتج والتغليف الفعلي هي المرجع.",
      ku: "Tester زۆرجار بۆ پیشاندان یان تاقیکردنەوەی عەترە و پاکەت یان ملحقات دەتوانن جیاواز بن. نابێت تەنها لە ناوی tester ـەوە فۆرمولا یان دۆخ یەکسان دابنرێت؛ وەسفی فرۆشیار سەرچاوەیە.",
      en: "Tester usually refers to a bottle intended for display or sampling and its packaging or accessories can differ. The word tester alone should not be used to assume formulation or condition; the seller's description, product code, and actual packaging are the reference.",
    },
  },
  {
    id: "fawri-perfume-weather-performance",
    scope: "activity",
    activityKey: "perfumes",
    questions: {
      ar: ["هل الحر يأثر على ثبات العطر", "العطر يختلف بالصيف والشتاء"],
      ku: ["ئایا گەرما لە مانەوەی بۆن کاریگەری هەیە", "بۆن لە هاوین و زستان جیاوازە"],
      en: ["does weather affect perfume performance", "does fragrance behave differently in summer and winter"],
    },
    answers: {
      ar: "الحرارة والرطوبة قد تغيران سرعة تبخر العطر وطريقة الإحساس به، كما تختلف النتيجة حسب البشرة والملابس والكمية. لذلك الأداء في جو معين لا يضمن النتيجة نفسها في جو مختلف.",
      ku: "گەرمی و شێداری دەتوانن خێرایی هەڵمژینی بۆن و شێوازی هەستکردن پێی بگۆڕن، هەروەها پێست و جل و بڕی پشکردن کاریگەری هەیە. ئەنجامی یەک کەش مسۆگەر نییە بۆ کەشێکی تر.",
      en: "Temperature and humidity can change evaporation rate and how a fragrance is perceived, while skin, clothing, and application amount also matter. Performance in one climate does not guarantee the same result in another.",
    },
  },
  {
    id: "fawri-perfume-skin-clothes",
    scope: "activity",
    activityKey: "perfumes",
    questions: {
      ar: ["العطر على الجلد لو الملابس افضل", "ليش العطر يختلف على الجلد والملابس"],
      ku: ["بۆن لەسەر پێست باشترە یان جل", "بۆچی بۆن لەسەر پێست و جل جیاوازە"],
      en: ["perfume on skin vs clothes", "why does fragrance smell different on skin and fabric"],
    },
    answers: {
      ar: "تفاعل العطر مع حرارة الجلد والزيوت قد يغير تطوره، بينما القماش قد يمسك بعض الجزيئات بطريقة مختلفة. بعض المواد قد تتلطخ أو تتأثر بالكحول، لذلك تعليمات المنتج واختبار مساحة صغيرة مهمان عند الرش على الملابس.",
      ku: "گەرمی و چەوری پێست دەتوانێت گەشەی بۆن بگۆڕێت، بەڵام جل دەتوانێت هەندێک ماددە بە شێوازی جیاواز هەڵبگرێت. هەندێک پارچە لە ئەلکۆل کاریگەری وەردەگرن، بۆیە ڕێنمایی بەرهەم گرنگە.",
      en: "Skin heat and oils can change how a fragrance develops, while fabric can retain some fragrance molecules differently. Some materials can stain or react to alcohol, so product instructions and a small test area matter when spraying clothing.",
    },
  },

  {
    id: "fawri-jewelry-gold-filled-plated",
    scope: "activity",
    activityKey: "jewelry",
    questions: {
      ar: ["شنو الفرق بين gold filled و gold plated", "gold filled يعني ذهب صافي"],
      ku: ["جیاوازی gold filled و gold plated چییە", "gold filled واتە زێڕی تەواوە"],
      en: ["gold filled vs gold plated", "is gold filled solid gold"],
    },
    answers: {
      ar: "Gold-filled وGold-plated كلاهما يختلفان عن الذهب الصلب، لكن طريقة وكمية ارتباط طبقة الذهب بالمعدن الأساسي تختلف بينهما حسب معيار التصنيع. يجب الرجوع إلى وصف القطعة ونسبة أو سماكة الذهب إن كانت مذكورة.",
      ku: "Gold-filled و Gold-plated هەردووکیان لە solid gold جیاوازن، بەڵام شێوازی پەیوەستکردن و بڕی چینە زێڕەکە بە بنەمای فلزی جیاوازە. وەسف و ڕێژە یان ئەستووری نووسراو سەرچاوەن.",
      en: "Gold-filled and gold-plated are both different from solid gold, but the method and amount of gold bonded to the base metal differ by manufacturing standard. Use the item's description and any stated gold proportion or thickness as the reference.",
    },
  },
  {
    id: "fawri-jewelry-gemstone-hardness",
    scope: "activity",
    activityKey: "jewelry",
    questions: {
      ar: ["شنو يعني صلابة الحجر", "هل الحجر الصلب ما ينخدش"],
      ku: ["ڕەقی بەرد واتە چی", "ئایا بەردی ڕەق خراش نابێت"],
      en: ["what does gemstone hardness mean", "does a hard gemstone never scratch"],
    },
    answers: {
      ar: "صلابة الحجر تصف مقاومته للخدش وليست الشيء نفسه مثل مقاومة الكسر أو الصدمات. حتى الحجر الصلب قد يتضرر من ضربة أو حافة ضعيفة، لذلك العناية تعتمد على خصائص الحجر كاملة لا على رقم الصلابة وحده.",
      ku: "ڕەقی بەرد بەرگریی لە خراش دەناسێنێت و هەمان شت نییە لەگەڵ بەرگریی شکاندن یان لێدان. تەنانەت بەردی ڕەق دەتوانێت لە لێدان زیان ببینێت، بۆیە چاودێری بە هەموو تایبەتمەندییەکان پەیوەستە.",
      en: "Gemstone hardness describes resistance to scratching and is not the same as resistance to chipping, fracture, or impact. Even a hard stone can be damaged by a blow or vulnerable edge, so care depends on the stone's full properties.",
    },
  },
  {
    id: "fawri-jewelry-necklace-length",
    scope: "activity",
    activityKey: "jewelry",
    questions: {
      ar: ["شلون اختار طول السلسلة", "وين توصل سلسلة 45 سم"],
      ku: ["چۆن درێژی زنجیر هەڵبژێرم", "زنجیری 45 سم لە کوێ دەوەستێت"],
      en: ["how to choose necklace length", "where does a 45 cm necklace sit"],
    },
    answers: {
      ar: "مكان وصول السلسلة يعتمد على طولها ومحيط الرقبة وبنية الجسم وحجم التعليقة. الجداول العامة تعطي تقديرا فقط، لذلك قياس سلسلة موجودة مناسبة أو استخدام خيط بطول مماثل يعطي تصورا أدق.",
      ku: "شوێنی وەستانی زنجیر بە درێژی، گەردن، شێوەی جەستە و قەبارەی pendant پەیوەستە. خشتەی گشتی تەنها نزیکەییە؛ پێوانەی زنجیرێکی گونجاو یان خەیتێک بە هەمان درێژی وردترە.",
      en: "Where a necklace sits depends on its length, neck circumference, body proportions, and pendant size. Generic charts are approximate; measuring a necklace that already fits well or using a string of the same length gives a better preview.",
    },
  },
  {
    id: "fawri-jewelry-bracelet-size",
    scope: "activity",
    activityKey: "jewelry",
    questions: {
      ar: ["شلون اختار قياس الاسوارة", "كيف اقيس المعصم للاسوارة"],
      ku: ["چۆن قەبارەی دەستبەند هەڵبژێرم", "چۆن مەچەک بپێوم بۆ bracelet"],
      en: ["how to choose bracelet size", "how to measure wrist for a bracelet"],
    },
    answers: {
      ar: "قِس محيط المعصم بشريط مرن من دون شد، ثم أضف مقدار الراحة المطلوب حسب نوع السوار والقصة. الأساور الصلبة أو ذات الخرز قد تحتاج طريقة قياس مختلفة، لذلك جدول المنتج هو المرجع النهائي.",
      ku: "دەوری مەچەک بە شریتی نەرم بپێوە و زۆر مەکێشە، پاشان بە پێی جۆری دەستبەند شوێنی ئارامی زیاد بکە. دەستبەندی ڕەق یان مۆرەدار دەتوانێت شێوازی پێوانەی جیاواز هەبێت و خشتەی بەرهەم سەرچاوەی کۆتاییە.",
      en: "Measure wrist circumference with a flexible tape without pulling tightly, then add the desired comfort allowance for that bracelet style. Rigid bangles or beaded designs may require a different method, so the product sizing guide is the final reference.",
    },
  },
  {
    id: "fawri-jewelry-hypoallergenic",
    scope: "activity",
    activityKey: "jewelry",
    questions: {
      ar: ["شنو يعني hypoallergenic بالمجوهرات", "هل hypoallergenic مستحيل تسبب حساسية"],
      ku: ["hypoallergenic لە خشڵ چییە", "ئایا hypoallergenic هەرگیز هەستیاری دروست ناکات"],
      en: ["what does hypoallergenic jewelry mean", "can hypoallergenic jewelry still cause a reaction"],
    },
    answers: {
      ar: "Hypoallergenic يعني أن المنتج صُمم لتقليل احتمال التحسس، لكنه لا يضمن عدم حدوث حساسية لكل شخص. الاستجابة تختلف باختلاف المعادن والطلاء وحساسية الشخص، ومن لديه تحسس معروف يجب أن يتحقق من تركيب القطعة.",
      ku: "Hypoallergenic واتە بەرهەمەکە بۆ کەمکردنەوەی ئەگەری هەستیاری دیزاین کراوە، بەڵام مسۆگەر ناکات کە هیچ کەسێک هەستیاری نەبێت. پێکهاتەی فلز و داپۆشین و هەستیاریی تاک گرنگن.",
      en: "Hypoallergenic means a product is designed to reduce the likelihood of irritation or allergy, but it does not guarantee that no person will react. Metal composition, plating, and individual sensitivity matter, so known sensitivities should be checked against the item's materials.",
    },
  },
];
