import type { CuratedArticle } from "./fawriEncyclopedia.js";

export const FAWRI_ENCYCLOPEDIA_EXPANSION_ARTICLES: CuratedArticle[] = [
  {
    id: "fawri-global-barcode-vs-sku",
    scope: "global",
    questions: {
      ar: ["ما الفرق بين الباركود و sku", "شنو الفرق بين barcode و sku", "هل الباركود هو sku"],
      ku: ["جیاوازی barcode و sku چییە", "ئایا barcode هەمان sku ـە"],
      en: ["barcode vs sku", "what is the difference between a barcode and sku", "is a barcode the same as sku"],
    },
    answers: {
      ar: "SKU رمز داخلي يضعه المتجر لتنظيم المنتجات أو الخيارات، بينما الباركود تمثيل قابل للمسح لرقم أو معرف. قد يربط المتجر الاثنين بالمنتج نفسه، لكنهما ليسا الشيء نفسه بالضرورة.",
      ku: "SKU کۆدێکی ناوخۆییە کە فرۆشگا بۆ ڕێکخستنی بەرهەم یان هەڵبژاردەکان دایدەنێت، بەڵام barcode نوێنەرایەتیی ژمارە یان ناسنامەیەکە کە دەتوانرێت سکان بکرێت. دەتوانن بە هەمان بەرهەم پەیوەست بن، بەڵام هەمیشە یەک شت نین.",
      en: "An SKU is an internal identifier a store assigns to organize products or variants, while a barcode is a scannable representation of a number or identifier. A store may link both to the same item, but they are not necessarily the same thing.",
    },
  },
  {
    id: "fawri-global-model-vs-serial",
    scope: "global",
    questions: {
      ar: ["ما الفرق بين رقم الموديل والرقم التسلسلي", "شنو model number و serial number", "رقم الموديل نفس السيريال"],
      ku: ["جیاوازی model number و serial number چییە", "ژمارەی مۆدێل هەمان serial ـە"],
      en: ["model number vs serial number", "difference between model and serial number", "is model number the same as serial number"],
    },
    answers: {
      ar: "رقم الموديل يحدد عادة نوع أو إصدار المنتج الذي قد تشترك فيه وحدات كثيرة، أما الرقم التسلسلي فيميز غالبا وحدة فردية بعينها. مكان وطريقة عرض هذه الأرقام يختلفان حسب الشركة والمنتج.",
      ku: "ژمارەی مۆدێل زۆرجار جۆر یان وەشانی بەرهەم دیاری دەکات کە چەندین دانە دەتوانن هاوبەشی بن، بەڵام serial number زۆرجار دانەیەکی تاک دیاری دەکات. شوێن و شێوازی نووسینیان بە کۆمپانیا و بەرهەم دەگۆڕێت.",
      en: "A model number usually identifies a product type or version shared by many units, while a serial number usually identifies one individual unit. Where and how these identifiers are shown varies by manufacturer and product.",
    },
  },
  {
    id: "fawri-global-preorder-backorder",
    scope: "global",
    questions: {
      ar: ["شنو الفرق بين preorder و backorder", "ما معنى الطلب المسبق", "ما معنى backorder"],
      ku: ["جیاوازی preorder و backorder چییە", "preorder چییە", "backorder چییە"],
      en: ["preorder vs backorder", "what is a preorder", "what is a backorder"],
    },
    answers: {
      ar: "Pre-order يعني طلب منتج قبل توفره أو إطلاقه وفق موعد متوقع يحدده البائع، بينما Backorder يعني عادة طلب منتج موجود في الكتالوج لكنه غير متوفر حاليا ومن المتوقع إعادة توفيره. الموعد والالتزام الفعليان يجب أخذهما من سياسة المتجر والطلب نفسه.",
      ku: "Pre-order واتە داواکردنی بەرهەمێک پێش بەردەستبوون یان بڵاوکردنەوەی بە پێی کاتێکی چاوەڕوانکراو، بەڵام Backorder زۆرجار واتە بەرهەم لە کاتەلۆگدا هەیە بەڵام ئێستا بەردەست نییە و چاوەڕوان دەکرێت دووبارە دابین بکرێت. کاتی ڕاستەقینە دەبێت لە سیاسەتی فرۆشگا و داواکارییەکە وەربگیرێت.",
      en: "A pre-order is an order placed before a product is available or launched, based on an expected availability date. A backorder usually means the product is normally sold but is temporarily unavailable and expected to return. Actual timing and commitments must come from the merchant and the specific order.",
    },
  },
  {
    id: "fawri-global-dimensions-order",
    scope: "global",
    questions: {
      ar: ["شلون اقرا ابعاد المنتج", "ما معنى الطول العرض الارتفاع", "ترتيب ابعاد المنتج"],
      ku: ["چۆن قەبارەکانی بەرهەم بخوێنمەوە", "درێژی پانی بەرزی چییە"],
      en: ["how to read product dimensions", "length width height meaning", "product dimensions order"],
    },
    answers: {
      ar: "أبعاد المنتج توصف عادة بالطول والعرض والارتفاع، لكن ترتيب L × W × H وطريقة القياس قد تختلف حسب نوع المنتج والبائع. يجب الاعتماد على التسميات والوحدة المكتوبة مع مواصفات المنتج لا على ترتيب الأرقام وحده.",
      ku: "قەبارەی بەرهەم زۆرجار بە درێژی و پانی و بەرزی باس دەکرێت، بەڵام ڕیزبەندی L × W × H و شێوازی پێوانە بە جۆری بەرهەم و فرۆشیار دەگۆڕێت. پێویستە ناونیشان و یەکەی نووسراوی مواسفات بکرێتە سەرچاوە، نە تەنها ڕیزی ژمارەکان.",
      en: "Product dimensions are commonly described as length, width, and height, but the order of L × W × H and the measuring method can vary by product and seller. Use the labeled dimensions and units in the product specification rather than relying on number order alone.",
    },
  },
  {
    id: "fawri-global-bundle-set",
    scope: "global",
    questions: {
      ar: ["شنو يعني bundle", "ما معنى set بالمنتج", "هل البندل يشمل كل القطع"],
      ku: ["bundle چییە", "set لە بەرهەم چییە", "ئایا bundle هەموو پارچەکان دەگرێتەوە"],
      en: ["what does bundle mean", "what is a product set", "does a bundle include everything shown"],
    },
    answers: {
      ar: "Bundle أو Set يعني أن عدة عناصر تباع معا كوحدة واحدة، لكن المحتويات الدقيقة تعتمد على وصف ذلك العرض. الصور قد تكون توضيحية، لذلك قائمة المحتويات المكتوبة هي المرجع لما يشمله المنتج.",
      ku: "Bundle یان Set واتە چەند شتێک پێکەوە وەک یەک یەکە دەفرۆشرێن، بەڵام ناوەڕۆکی ورد بە وەسفی هەمان ئۆفەر پەیوەستە. وێنەکان دەتوانن تەنها بۆ ڕوونکردنەوە بن، بۆیە لیستی ناوەڕۆکی نووسراو سەرچاوەیە.",
      en: "A bundle or set means multiple items are sold together as one offer, but the exact contents depend on that listing. Images can be illustrative, so the written contents list is the reference for what is included.",
    },
  },
  {
    id: "fawri-global-product-condition",
    scope: "global",
    questions: {
      ar: ["شنو الفرق بين new و used و refurbished", "ما معنى refurbished", "المنتج المجدد شنو"],
      ku: ["جیاوازی new و used و refurbished چییە", "refurbished چییە"],
      en: ["new vs used vs refurbished", "what does refurbished mean", "what is a refurbished product"],
    },
    answers: {
      ar: "New يعني عادة منتجا يباع كجديد، وUsed يعني أنه استُخدم سابقا، أما Refurbished فيعني أنه خضع لعملية فحص أو إصلاح أو تجديد قبل إعادة البيع. معيار التجديد والحالة والضمان يختلف حسب البائع أو المصنع، لذلك وصف المنتج المحدد هو المرجع.",
      ku: "New زۆرجار واتە بەرهەم وەک نوێ دەفرۆشرێت، Used واتە پێشتر بەکارهاتووە، و Refurbished واتە پێش دووبارە فرۆشتن پشکنین یان چاککردنەوە یان نوێکردنەوەی بۆ کراوە. ئاستی نوێکردنەوە و دۆخ و گەرەنتی بە فرۆشیار یان بەرهەمهێنەر دەگۆڕێت.",
      en: "New generally means sold as new, used means previously used, and refurbished means the item has gone through some inspection, repair, or renewal process before resale. Refurbishment standards, condition, and warranty vary by seller or manufacturer, so the specific listing is the reference.",
    },
  },
  {
    id: "fawri-fashion-body-measurements",
    scope: "activity",
    activityKey: "fashion",
    questions: {
      ar: ["شلون اقيس الصدر والخصر والورك", "كيف اخذ قياسات الجسم للملابس", "طريقة قياس الصدر والخصر"],
      ku: ["چۆن سنگ و کەمەر و ناوقەد بپێوم", "چۆن پێوانەی جەستە بۆ جل وەربگرم"],
      en: ["how to measure chest waist and hips", "how to take body measurements for clothes", "measure chest and waist"],
    },
    answers: {
      ar: "استخدم شريط قياس مرنا من دون شده بقوة. قياس الصدر يؤخذ حول أعرض جزء، والخصر حول موضع الخصر الطبيعي، والورك حول أعرض جزء منه. بعد ذلك قارن الأرقام بجدول مقاسات المنتج نفسه.",
      ku: "شریتی پێوانەی نەرم بەکاربهێنە و زۆر مەکێشە. سنگ لە فراوانترین بەش، کەمەر لە شوێنی سروشتیی کەمەر، و ناوقەد لە فراوانترین بەش پێوانە بکە. پاشان ژمارەکان بە خشتەی قەبارەی هەمان بەرهەم بەراورد بکە.",
      en: "Use a flexible tape without pulling it tightly. Measure the chest around its fullest part, the waist around the natural waist, and the hips around the fullest part. Then compare those measurements with the specific product's size chart.",
    },
  },
  {
    id: "fawri-fashion-shoe-sizing",
    scope: "activity",
    activityKey: "fashion",
    questions: {
      ar: ["شلون اختار قياس الحذاء", "تحويل مقاس الحذاء eu uk us", "هل مقاسات الاحذية نفسها بكل الماركات"],
      ku: ["چۆن قەبارەی پێڵاو هەڵبژێرم", "گۆڕینی قەبارەی EU UK US", "قەبارەی پێڵاو لە هەموو مارکەکان یەکسانە"],
      en: ["how to choose shoe size", "eu uk us shoe size conversion", "are shoe sizes the same across brands"],
    },
    answers: {
      ar: "مقاسات الأحذية قد تختلف بين الماركات والقوالب حتى لو حملت الرقم نفسه. الأفضل قياس طول القدم ومقارنته بجدول الماركة أو المنتج. جداول التحويل بين EU وUK وUS تقريبية ما لم تكن صادرة عن الشركة نفسها.",
      ku: "قەبارەی پێڵاو لە نێوان مارکە و قالبەکاندا دەتوانێت جیاواز بێت تەنانەت ئەگەر هەمان ژمارە بێت. باشترە درێژی پێ بپێویت و بە خشتەی مارکە یان بەرهەم بەراورد بکەیت. خشتەی گۆڕینی EU و UK و US تەنها نزیکەییە مەگەر لە خودی کۆمپانیاوە بێت.",
      en: "Shoe sizing can vary by brand and last even when the printed size is the same. Measuring foot length and using that brand or product's chart is more reliable. Generic EU, UK, and US conversion charts are approximate unless supplied by the manufacturer.",
    },
  },
  {
    id: "fawri-fashion-elastane-stretch",
    scope: "activity",
    activityKey: "fashion",
    questions: {
      ar: ["شنو يعني elastane", "ما معنى spandex", "هل الايلاستان يخلي القماش مطاط"],
      ku: ["elastane چییە", "spandex چییە", "ئایا elastane پارچەکە کشاو دەکات"],
      en: ["what is elastane", "what is spandex", "does elastane make fabric stretchy"],
    },
    answers: {
      ar: "Elastane ويُعرف أيضا باسم Spandex أو Lycra في بعض السياقات هو ليف صناعي عالي المرونة يضاف إلى الأقمشة لإعطائها قابلية للتمدد والعودة. مقدار المرونة الفعلي يعتمد على نسبته وتركيب القماش وبنيته.",
      ku: "Elastane کە لە هەندێک شوێندا بە Spandex یان Lycra ناسراوە، ڕیشەیەکی دەستکردی زۆر کشاوە و بۆ زیادکردنی کشان و گەڕانەوەی پارچە بەکاردێت. ئاستی کشان بە ڕێژەی elastane و پێکهاتە و دروستکردنی پارچەکە پەیوەستە.",
      en: "Elastane, also called spandex and sometimes associated with the Lycra name, is a highly elastic synthetic fiber added to fabrics for stretch and recovery. Actual stretch depends on its percentage and the fabric's overall construction.",
    },
  },
  {
    id: "fawri-fashion-screen-color",
    scope: "activity",
    activityKey: "fashion",
    questions: {
      ar: ["ليش اللون يختلف عن الصورة", "هل لون الملابس بالصورة دقيق", "لون المنتج يختلف بالشاشة"],
      ku: ["بۆچی ڕەنگ لە وێنە جیاوازە", "ئایا ڕەنگی جل لە شاشە وردە"],
      en: ["why does the color look different from the photo", "are clothing colors accurate on screen", "product color differs on screen"],
    },
    answers: {
      ar: "قد يظهر اللون مختلفا بسبب إضاءة التصوير وإعدادات الشاشة وسطوعها ومعالجة الصورة. صورة المنتج تساعد على التقدير، لكن الاسم اللوني ووصف المنتج وصور متعددة تحت إضاءة مختلفة تعطي مرجعا أفضل.",
      ku: "ڕەنگ دەتوانێت بەهۆی ڕووناکیی وێنەگرتن، ڕێکخستنی شاشە، ڕووناکی شاشە و دەستکاریی وێنە جیاواز دەربکەوێت. وێنە یارمەتیدەرە، بەڵام ناوی ڕەنگ و وەسف و چەند وێنەیەک لە ڕووناکی جیاواز سەرچاوەی باشترن.",
      en: "Color can look different because of photography lighting, screen settings, brightness, and image processing. Product photos are useful guides, but the listed color name, description, and multiple images under different lighting provide a better reference.",
    },
  },
  {
    id: "fawri-fashion-unisex-sizing",
    scope: "activity",
    activityKey: "fashion",
    questions: {
      ar: ["شنو يعني unisex بالملابس", "كيف اختار مقاس unisex", "ملابس يونيسكس شنو"],
      ku: ["unisex لە جل چییە", "چۆن قەبارەی unisex هەڵبژێرم"],
      en: ["what does unisex mean in clothing", "how to choose unisex size", "unisex clothing sizing"],
    },
    answers: {
      ar: "Unisex يعني أن التصميم مسوق للاستخدام من أكثر من فئة، لكنه لا يضمن أن القياس يطابق مقاسات الرجال أو النساء المعتادة. استخدم قياسات القطعة وجدول المنتج بدل الاعتماد على اسم المقاس وحده.",
      ku: "Unisex واتە دیزاینەکە بۆ زیاتر لە یەک گروپ بازاڕ دەکرێت، بەڵام واتای ئەوە نییە قەبارەکە بە قەبارەی باوی پیاوان یان ژنان یەکسانە. پێوانەی پارچە و خشتەی بەرهەم بەکاربهێنە.",
      en: "Unisex means the design is marketed for more than one group, but it does not guarantee the sizing matches typical men's or women's sizing. Use the garment measurements and product size chart rather than the size label alone.",
    },
  },
  {
    id: "fawri-electronics-storage-units",
    scope: "activity",
    activityKey: "electronics",
    questions: {
      ar: ["شنو الفرق بين gb و tb", "كم gb في tb", "وحدات التخزين جيجا تيرا"],
      ku: ["جیاوازی GB و TB چییە", "چەند GB لە TB ـێکدایە", "یەکەکانی storage"],
      en: ["gb vs tb", "how many gb in a tb", "storage units gb tb"],
    },
    answers: {
      ar: "GB وTB وحدات لقياس سعة التخزين، وTB أكبر من GB. قد تعرض الشركات والأنظمة السعة بأساليب حساب مختلفة، لذلك المساحة الظاهرة للمستخدم قد لا تطابق الرقم التسويقي حرفيا، إضافة إلى المساحة التي يستخدمها النظام نفسه.",
      ku: "GB و TB یەکەی پێوانەی گنجایشی storage ـن و TB گەورەترە لە GB. کۆمپانیا و سیستەمەکان دەتوانن بە شێوازی ژماردنی جیاواز گنجایش پیشان بدەن، بۆیە شوێنی دیاریکراو بۆ بەکارهێنەر دەتوانێت لە ژمارەی بازاڕکردن جیاواز بێت.",
      en: "GB and TB are units used to express storage capacity, with TB being larger than GB. Manufacturers and operating systems can calculate and display capacity differently, and the system itself also uses some space, so visible usable capacity may differ from the marketed number.",
    },
  },
  {
    id: "fawri-electronics-ssd-hdd",
    scope: "activity",
    activityKey: "electronics",
    questions: {
      ar: ["ما الفرق بين ssd و hdd", "ssd لو hdd", "شنو الفرق بين الهارد ssd و hdd"],
      ku: ["جیاوازی SSD و HDD چییە", "SSD یان HDD"],
      en: ["ssd vs hdd", "difference between ssd and hdd", "should i choose ssd or hdd"],
    },
    answers: {
      ar: "SSD يخزن البيانات إلكترونيا من دون أجزاء ميكانيكية متحركة، لذلك يكون عادة أسرع وأهدأ وأكثر مقاومة للاهتزاز. HDD يستخدم أقراصا ميكانيكية وغالبا يوفر سعات كبيرة بتكلفة أقل لكل وحدة تخزين. الاختيار يعتمد على السرعة والسعة والميزانية والاستخدام.",
      ku: "SSD داتا بە شێوەی ئەلیکترۆنی هەڵدەگرێت و بەشی میکانیکی جوڵاو نییە، بۆیە زۆرجار خێراتر و بێدەنگتر و بەرگریی لەرزین باشترە. HDD دیسکی میکانیکی بەکاردێنێت و زۆرجار گنجایشی زۆر بە نرخی کەمتر بۆ هەر یەکە دابین دەکات.",
      en: "An SSD stores data electronically without moving mechanical parts, so it is usually faster, quieter, and more resistant to vibration. An HDD uses mechanical disks and often offers larger capacity at a lower cost per unit of storage. The better choice depends on speed, capacity, budget, and use.",
    },
  },
  {
    id: "fawri-electronics-refresh-rate",
    scope: "activity",
    activityKey: "electronics",
    questions: {
      ar: ["شنو يعني hz بالشاشة", "ما معنى 120hz", "refresh rate شنو"],
      ku: ["Hz لە شاشە چییە", "120Hz واتە چی", "refresh rate چییە"],
      en: ["what does hz mean on a display", "what is 120hz", "refresh rate meaning"],
    },
    answers: {
      ar: "معدل التحديث بالهرتز يصف عدد مرات تحديث الشاشة للصورة في الثانية. معدل أعلى يمكن أن يجعل الحركة تبدو أكثر سلاسة عندما يدعم المحتوى والجهاز ذلك، لكنه لا يحدد وحده جودة الصورة أو أداء الجهاز.",
      ku: "Refresh rate بە Hz ژمارەی جارەکانی نوێکردنەوەی وێنە لە شاشە لە هەر چرکەیەکدا نیشان دەدات. نرخی بەرزتر دەتوانێت جوڵە نرمتر پیشان بدات ئەگەر ناوەڕۆک و ئامێر پشتگیری بکەن، بەڵام بە تەنها کوالێتی وێنە یان کارایی دیاری ناکات.",
      en: "Refresh rate in hertz describes how many times a display updates the image each second. A higher rate can make motion look smoother when the content and device support it, but refresh rate alone does not determine image quality or overall device performance.",
    },
  },
  {
    id: "fawri-electronics-oled-lcd",
    scope: "activity",
    activityKey: "electronics",
    questions: {
      ar: ["ما الفرق بين oled و lcd", "oled لو lcd", "شنو شاشة oled"],
      ku: ["جیاوازی OLED و LCD چییە", "OLED یان LCD", "OLED چییە"],
      en: ["oled vs lcd", "difference between oled and lcd", "what is an oled display"],
    },
    answers: {
      ar: "في OLED تصدر كل بكسل إضاءته بنفسه، ما يسمح عادة بسواد أعمق وتباين مرتفع. LCD يستخدم إضاءة خلفية تمر عبر طبقة العرض. السطوع والألوان والعمر واستهلاك الطاقة تختلف كثيرا حسب اللوحة والجهاز، لذلك نوع الشاشة وحده لا يحدد الجودة الكلية.",
      ku: "لە OLED هەر پیکسڵێک خۆی ڕووناکی دروست دەکات و زۆرجار ڕەشی قووڵتر و contrast بەرزتر دەدات. LCD پشتڕووناکی بەکاردێنێت. ڕووناکی و ڕەنگ و تەمەن و بەکارهێنانی وزە بە پەنێڵ و ئامێر زۆر دەگۆڕێت.",
      en: "In OLED, individual pixels produce their own light, usually enabling deeper blacks and high contrast. LCD uses a backlight behind the display layer. Brightness, color, longevity, and power use vary greatly by panel and device, so display type alone does not determine overall quality.",
    },
  },
  {
    id: "fawri-electronics-fast-charging",
    scope: "activity",
    activityKey: "electronics",
    questions: {
      ar: ["شلون اعرف الشحن السريع يشتغل", "هل اي شاحن سريع يشحن بسرعة", "شنو يحتاج fast charging"],
      ku: ["چۆن بزانم شارجی خێرا کار دەکات", "هەر شارژەرێکی fast خێرا شارج دەکات", "fast charging چی پێویستە"],
      en: ["what is required for fast charging", "will any fast charger charge fast", "how do i know fast charging works"],
    },
    answers: {
      ar: "الشحن السريع يعتمد على توافق الجهاز والشاحن والكابل ومعيار الشحن معا. وجود قدرة عالية مكتوبة على الشاحن لا يعني أن الجهاز سيستخدمها كاملة؛ الجهاز يتفاوض على القدرة التي يدعمها ضمن المعيار المتوافق.",
      ku: "شارجی خێرا بە گونجانی ئامێر و شارژەر و کابڵ و ستانداردی شارج پێکەوە پەیوەستە. نووسینی توانای بەرز لە شارژەر واتای ئەوە نییە ئامێر هەمووی بەکاربهێنێت؛ ئامێر تەنها توانی پشتگیریکراو لە ستانداردی گونجاودا وەردەگرێت.",
      en: "Fast charging depends on compatibility among the device, charger, cable, and charging standard. A high wattage printed on the charger does not mean the device will use all of it; the device negotiates a supported power level under a compatible standard.",
    },
  },
  {
    id: "fawri-electronics-esim-sim",
    scope: "activity",
    activityKey: "electronics",
    questions: {
      ar: ["شنو الفرق بين esim و sim", "ما معنى esim", "هل esim تحتاج شريحة"],
      ku: ["جیاوازی eSIM و SIM چییە", "eSIM چییە", "ئایا eSIM پێویستی بە سیمکارت هەیە"],
      en: ["esim vs physical sim", "what is esim", "does esim need a physical card"],
    },
    answers: {
      ar: "SIM التقليدية بطاقة فعلية تُركب في الجهاز، بينما eSIM ملف اشتراك رقمي يُفعّل على شريحة مدمجة في الأجهزة التي تدعمه. الدعم يعتمد على موديل الجهاز وشركة الاتصالات والبلد، لذلك يجب التحقق من الطرفين.",
      ku: "SIM ی ئاسایی کارتێکی فیزیکییە کە لە ئامێر دادەنرێت، بەڵام eSIM پرۆفایلی دیجیتاڵی بەشدارییە کە لە چیپێکی ناوخۆیی لە ئامێری پشتگیریکراو چالاک دەکرێت. پشتگیری بە مۆدێل و کۆمپانیای پەیوەندی و وڵات پەیوەستە.",
      en: "A traditional SIM is a physical card inserted into a device, while an eSIM is a digital subscription profile activated on an embedded chip in supported devices. Support depends on the exact device model, carrier, and country, so both sides must be checked.",
    },
  },
  {
    id: "fawri-food-nutrition-serving",
    scope: "activity",
    activityKey: "food",
    questions: {
      ar: ["شنو يعني per serving بالمعلومات الغذائية", "المعلومات الغذائية للحصة لو لكل العبوة", "serving size شنو"],
      ku: ["per serving لە زانیاری خواردن چییە", "serving size چییە", "زانیاری خواردن بۆ هەموو پاکەتە"],
      en: ["what does per serving mean on nutrition label", "is nutrition information per serving or per package", "what is serving size"],
    },
    answers: {
      ar: "Serving size هي كمية مرجعية تُستخدم لعرض القيم الغذائية. بعض العبوات تعرض القيم لكل حصة، أو لكل 100 غرام/مل، أو بأكثر من طريقة. عدد الحصص في العبوة قد يكون أكثر من واحدة، لذلك يجب قراءة عنوان الجدول والكمية المرجعية.",
      ku: "Serving size بڕێکی سەرچاوەییە کە بۆ پیشاندانی زانیاریی خواردن بەکاردێت. هەندێک پاکەت بۆ هەر serving، یان بۆ 100 گرام/مل، یان بە چەند شێوازێک زانیاری دەدات. ژمارەی serving لە پاکەتدا دەتوانێت زیاتر لە یەک بێت.",
      en: "Serving size is a reference amount used to present nutrition values. A label may show values per serving, per 100 g/ml, or in more than one format. A package can contain multiple servings, so check the table heading and reference amount.",
    },
  },
  {
    id: "fawri-food-lot-batch",
    scope: "activity",
    activityKey: "food",
    questions: {
      ar: ["شنو رقم التشغيلة", "ما معنى lot number", "batch code على الطعام شنو"],
      ku: ["lot number چییە", "batch code لە خواردن چییە", "ژمارەی batch چییە"],
      en: ["what is a lot number on food", "what is a batch code", "food batch number meaning"],
    },
    answers: {
      ar: "رقم التشغيلة أو Batch/Lot code يربط المنتج عادة بدفعة إنتاج محددة لأغراض التتبع والجودة. شكله ومكانه يختلفان حسب الشركة، ولا يُعد بحد ذاته تاريخ انتهاء إلا إذا أوضح الملصق ذلك.",
      ku: "Lot یان Batch code زۆرجار بەرهەم بە کۆمەڵەیەکی دیاریکراوی بەرهەمهێنان پەیوەست دەکات بۆ شوێنکەوتن و کوالێتی. شێوە و شوێنی کۆدەکە بە کۆمپانیا دەگۆڕێت و بە خۆی بەرواری بەسەرچوون نییە مەگەر لیبڵەکە بە ڕوونی بڵێت.",
      en: "A lot or batch code usually links a product to a specific production batch for traceability and quality control. Its format and location vary by manufacturer, and it is not itself an expiry date unless the label explicitly says so.",
    },
  },
  {
    id: "fawri-food-net-weight",
    scope: "activity",
    activityKey: "food",
    questions: {
      ar: ["شنو يعني الوزن الصافي", "net weight شنو", "الوزن الصافي يشمل العلبة"],
      ku: ["net weight چییە", "کێشی خالص چییە", "ئایا net weight پاکەت دەگرێتەوە"],
      en: ["what is net weight", "does net weight include packaging", "net weight meaning"],
    },
    answers: {
      ar: "الوزن الصافي يشير عادة إلى وزن المحتوى من دون وزن العبوة أو التغليف. في المنتجات الموجودة في سائل قد يظهر أيضا وزن مصفّى أو Drained Weight، وهو مقياس مختلف يجب قراءة تسميته على العبوة.",
      ku: "Net weight زۆرجار کێشی ناوەڕۆکەکەیە بەبێ کێشی پاکەت یان پێچانەوە. لە بەرهەمێک کە لە شلەدا بێت دەتوانێت Drained Weight ـیش هەبێت، کە پێوانەیەکی جیاوازە و دەبێت ناونیشانی سەر پاکەت بخوێندرێتەوە.",
      en: "Net weight generally means the weight of the contents excluding the package or container. Products packed in liquid may also list a drained weight, which is a different measure and should be read by its label on the package.",
    },
  },
  {
    id: "fawri-food-certification-labels",
    scope: "activity",
    activityKey: "food",
    questions: {
      ar: ["شلون اتأكد المنتج حلال", "شنو يعني organic على المنتج", "كيف اعرف الشهادة على الغذاء"],
      ku: ["چۆن دڵنیابم بەرهەم حەلالە", "organic لە بەرهەم چییە", "چۆن certification بزانم"],
      en: ["how do i verify halal certification", "what does organic label mean", "how to check food certification"],
    },
    answers: {
      ar: "الادعاءات مثل حلال أو Organic أو شهادات أخرى يجب التحقق منها من علامة الاعتماد والجهة المانحة والمعلومات الموجودة على العبوة أو من الشركة المصنعة. لا يصح استنتاج وجود شهادة من اسم المنتج أو صورته وحدهما.",
      ku: "بانگەشەکانی وەک حەلال یان Organic یان بڕوانامەی تر دەبێت لە نیشانی بڕوانامە، دامەزراوەی دەرکەر و زانیاریی سەر پاکەت یان بەرهەمهێنەر پشکنرێت. نابێت تەنها لە ناو یان وێنەی بەرهەمەکەوە بڕوانامە هەبوون دابنرێت.",
      en: "Claims such as halal, organic, or other certifications should be verified from the certification mark, issuing body, package information, or manufacturer data. Certification should not be inferred from the product name or image alone.",
    },
  },
  {
    id: "fawri-perfume-fragrance-families",
    scope: "activity",
    activityKey: "perfumes",
    questions: {
      ar: ["شنو يعني عطر floral woody citrus gourmand", "ما هي عائلات العطور", "fragrance family شنو"],
      ku: ["fragrance family چییە", "floral woody citrus gourmand چییە", "خێزانی بۆن چین"],
      en: ["what are fragrance families", "floral woody citrus gourmand meaning", "what is a fragrance family"],
    },
    answers: {
      ar: "عائلة العطر طريقة عامة لوصف طابعه، مثل Floral للزهور، Woody للأخشاب، Citrus للحمضيات، وGourmand للروائح التي تذكّر بمكونات حلوة أو غذائية. العطر قد يجمع أكثر من عائلة، والوصف لا يحدد وحده كيف سيبدو على كل شخص.",
      ku: "Fragrance family شێوازێکی گشتییە بۆ باسکردنی تایبەتمەندی بۆن، وەک Floral بۆ گوڵ، Woody بۆ دار، Citrus بۆ ترشەمیوە و Gourmand بۆ بۆنی شیرین یان خواردنەوەیی. یەک بۆن دەتوانێت چەند خێزانێک تێکەڵ بکات.",
      en: "A fragrance family is a broad way to describe scent character, such as floral, woody, citrus, or gourmand for sweet food-like notes. A fragrance can combine several families, and the family label alone does not determine exactly how it will smell on every person.",
    },
  },
  {
    id: "fawri-perfume-sillage-projection",
    scope: "activity",
    activityKey: "perfumes",
    questions: {
      ar: ["شنو الفرق بين الفوحان والسيلاج", "projection و sillage شنو", "ما معنى sillage بالعطور"],
      ku: ["جیاوازی projection و sillage چییە", "sillage لە بۆن چییە"],
      en: ["projection vs sillage", "what is sillage in perfume", "what does fragrance projection mean"],
    },
    answers: {
      ar: "Projection يصف عادة مدى انتشار الرائحة حول الشخص، بينما Sillage يصف الأثر العطري الذي يتركه أثناء الحركة. كلاهما يتغير مع التركيبة والكمية والجو والبشرة، لذلك لا يمكن استنتاجهما بدقة من التركيز وحده.",
      ku: "Projection زۆرجار مەودای بڵاوبوونەوەی بۆن لە دەوری کەس باس دەکات، بەڵام Sillage شوێنەواری بۆنەکە لە کاتی جوڵە باس دەکات. هەردووکیان بە فۆرمولا و بڕ و کەش و پێست دەگۆڕێن.",
      en: "Projection usually describes how far a fragrance radiates around the wearer, while sillage describes the scent trail left as the wearer moves. Both vary with formula, amount applied, environment, and skin, so they cannot be predicted precisely from concentration alone.",
    },
  },
  {
    id: "fawri-perfume-parfum-extrait",
    scope: "activity",
    activityKey: "perfumes",
    questions: {
      ar: ["شنو parfum و extrait", "الفرق بين parfum و edp", "extrait de parfum شنو"],
      ku: ["Parfum و Extrait چییە", "جیاوازی Parfum و EDP چییە", "Extrait de Parfum چییە"],
      en: ["parfum vs edp", "what is extrait de parfum", "parfum concentration meaning"],
    },
    answers: {
      ar: "Parfum أو Extrait de Parfum يستخدم عادة لوصف تركيز عطري أعلى من EDP ضمن تصنيفات شائعة، لكن لا توجد نسبة واحدة ثابتة تنطبق على كل الشركات. الثبات والفوحان يعتمدان أيضا على الصيغة نفسها، لذلك مواصفات العطر هي المرجع.",
      ku: "Parfum یان Extrait de Parfum زۆرجار بۆ کۆنسەنتراسیۆنێکی بەرزتر لە EDP بەکاردێت، بەڵام یەک ڕێژەی جێگیر بۆ هەموو کۆمپانیاکان نییە. مانەوە و بڵاوبوونەوە بە خودی فۆرمولاکەش پەیوەستە.",
      en: "Parfum or Extrait de Parfum is commonly used for a higher fragrance concentration than EDP, but there is no single percentage that applies to every brand. Longevity and projection also depend on the formula itself, so the specific fragrance specification is the reference.",
    },
  },
  {
    id: "fawri-perfume-batch-authenticity",
    scope: "activity",
    activityKey: "perfumes",
    questions: {
      ar: ["هل batch code يثبت العطر اصلي", "شلون اتأكد العطر اصلي من الباتش", "batch code والعطر الاصلي"],
      ku: ["ئایا batch code ڕەسەنایەتی بۆن دەسەلمێنێت", "چۆن بە batch code بۆنی ڕەسەن بزانم"],
      en: ["does a batch code prove perfume authenticity", "can batch code verify original perfume", "perfume batch code authenticity"],
    },
    answers: {
      ar: "وجود Batch Code متناسق قد يكون جزءا من التحقق، لكنه لا يثبت الأصالة وحده لأن الأكواد والعبوات يمكن تقليدها. الأفضل الجمع بين مصدر الشراء وتفاصيل العبوة والفاتورة أو بيانات الموزع وأي وسيلة تحقق رسمية من العلامة إن وجدت.",
      ku: "هەبوونی Batch Code ی گونجاو دەتوانێت بەشێک لە پشکنین بێت، بەڵام بە تەنها ڕەسەنایەتی ناسەلمێنێت چونکە کۆد و پاکەت دەتوانرێت کۆپی بکرێت. باشترە سەرچاوەی کڕین و وردەکاریی پاکەت و پسوولە و ڕێگای فەرمی مارکە پێکەوە پشکنرێن.",
      en: "A consistent batch code can be one part of verification, but it does not prove authenticity by itself because codes and packaging can be copied. Purchase source, packaging details, receipt or distributor information, and any official brand verification method should be considered together.",
    },
  },
  {
    id: "fawri-jewelry-carat-karat",
    scope: "activity",
    activityKey: "jewelry",
    questions: {
      ar: ["شنو الفرق بين carat و karat", "قيراط الالماس وعيار الذهب نفس الشي", "carat vs karat"],
      ku: ["جیاوازی carat و karat چییە", "carat ی ئەڵماس و karat ی زێڕ یەک شتن"],
      en: ["carat vs karat", "diamond carat vs gold karat", "are carat and karat the same"],
    },
    answers: {
      ar: "Carat يستخدم لقياس وزن الأحجار الكريمة مثل الألماس، أما Karat فيستخدم في سياق الذهب للتعبير عن نسبة الذهب في السبيكة على مقياس 24. تشابه اللفظ لا يعني أنهما المقياس نفسه.",
      ku: "Carat بۆ پێوانەی کێشی بەردی گرانبەها وەک ئەڵماس بەکاردێت، بەڵام Karat لە زێڕدا ڕێژەی زێڕ لە تێکەڵەکە لە سیستەمی 24 نیشان دەدات. هاوشێوەیی ناوەکان واتای یەک پێوانە نییە.",
      en: "Carat is a unit of weight for gemstones such as diamonds, while karat in the context of gold expresses the proportion of gold in an alloy on a 24-part scale. The similar words refer to different measurements.",
    },
  },
  {
    id: "fawri-jewelry-lab-grown-diamond",
    scope: "activity",
    activityKey: "jewelry",
    questions: {
      ar: ["شنو يعني lab grown diamond", "الالماس المختبري حقيقي", "الفرق بين lab grown و natural diamond"],
      ku: ["lab grown diamond چییە", "ئایا ئەڵماسی لاب ڕاستەقینەیە", "جیاوازی lab grown و natural diamond چییە"],
      en: ["what is a lab grown diamond", "lab grown vs natural diamond", "are lab grown diamonds real diamonds"],
    },
    answers: {
      ar: "الألماس المزروع مختبريا يتكون من مادة بلورية لها الخصائص الأساسية للألماس، لكنه يُنتج بعملية صناعية بدلا من التكوّن الجيولوجي الطبيعي. المنشأ والسعر والتوثيق قد تختلف، لذلك يجب الرجوع إلى وصف وشهادة الحجر المحدد.",
      ku: "Lab-grown diamond ماددەی بلورییە کە تایبەتمەندییە سەرەکییەکانی ئەڵماسی هەیە، بەڵام بە پرۆسەی پیشەسازی دروست دەکرێت نە بە پێکهاتنی سروشتیی ژێر زەوی. سەرچاوە و نرخ و بڕوانامە دەگۆڕێت، بۆیە وەسف و بڕوانامەی هەمان بەرد گرنگە.",
      en: "A lab-grown diamond is crystalline diamond material produced through an industrial process rather than natural geological formation. Origin, pricing, and documentation can differ, so the description and grading documentation for the specific stone are the reference.",
    },
  },
  {
    id: "fawri-jewelry-cz-diamond",
    scope: "activity",
    activityKey: "jewelry",
    questions: {
      ar: ["شنو الفرق بين cubic zirconia و diamond", "cz هو الماس", "زركونيا مكعبه والماس"],
      ku: ["جیاوازی cubic zirconia و diamond چییە", "CZ ئەڵماسە"],
      en: ["cubic zirconia vs diamond", "is cz a diamond", "cz versus diamond"],
    },
    answers: {
      ar: "Cubic Zirconia أو CZ مادة مصنعة تُستخدم كبديل بصري للألماس، لكنها ليست ألماسا ولها تركيب وخصائص مختلفة. التمييز المهني والأصالة يعتمدان على الفحص أو التوثيق المناسب للحجر.",
      ku: "Cubic Zirconia یان CZ ماددەیەکی دروستکراوە کە وەک جێگرەوەی دیمەنی ئەڵماس بەکاردێت، بەڵام ئەڵماس نییە و پێکهاتە و تایبەتمەندیی جیاوازی هەیە. دڵنیایی پێویستی بە پشکنین یان بڕوانامەی گونجاو هەیە.",
      en: "Cubic zirconia, or CZ, is a manufactured material used as a visual diamond alternative, but it is not diamond and has different composition and properties. Professional identification and authenticity depend on appropriate testing or documentation.",
    },
  },
  {
    id: "fawri-jewelry-ring-size",
    scope: "activity",
    activityKey: "jewelry",
    questions: {
      ar: ["شلون اعرف قياس الخاتم", "كيف اقيس اصبعي للخاتم", "ring size شلون"],
      ku: ["چۆن قەبارەی ئەڵقە بزانم", "چۆن پەنجەم بۆ ئەڵقە بپێوم", "ring size چۆن دیاری بکەم"],
      en: ["how do i find my ring size", "how to measure finger for a ring", "ring size measurement"],
    },
    answers: {
      ar: "الأدق هو قياس خاتم مناسب بأداة قياس أو قياس محيط الإصبع ثم مقارنته بجدول المقاسات الذي يستخدمه البائع، لأن أنظمة المقاس تختلف حسب البلد. عرض الخاتم ووقت القياس وحرارة اليد قد تؤثر أيضا في الراحة.",
      ku: "وردترین ڕێگا پێوانەکردنی ئەڵقەیەکی گونجاو بە ئامراز یان پێوانەکردنی دەوری پەنجە و بەراوردکردنی بە خشتەی قەبارەی فرۆشیارە، چونکە سیستەمی قەبارە بە وڵات دەگۆڕێت. پانی ئەڵقە و کاتی پێوانە و گەرمی دەستیش کاریگەری هەیە.",
      en: "The most reliable method is to measure a well-fitting ring with a sizing tool or measure finger circumference and compare it with the seller's sizing chart, because ring-size systems vary by country. Band width, time of measurement, and hand temperature can also affect fit.",
    },
  },
  {
    id: "fawri-jewelry-tarnish",
    scope: "activity",
    activityKey: "jewelry",
    questions: {
      ar: ["ليش الفضة تسود", "شنو tarnish بالمجوهرات", "هل اسوداد الفضة يعني صدأ"],
      ku: ["بۆچی زیو ڕەش دەبێت", "tarnish لە خشڵ چییە", "ئایا ڕەشبوونی زیو rust ـە"],
      en: ["why does silver tarnish", "what is tarnish on jewelry", "is silver tarnish rust"],
    },
    answers: {
      ar: "Tarnish هو تغير سطحي ينتج من تفاعل بعض المعادن مع مواد في البيئة، وقد يظهر على الفضة كلون أغمق. ليس هو نفسه الصدأ الحديدي. طريقة التنظيف المناسبة تعتمد على المعدن والطلاء والأحجار الموجودة في القطعة.",
      ku: "Tarnish گۆڕانێکی سەر ڕووە کە لە کاردانەوەی هەندێک فلز لەگەڵ ماددەکانی ژینگە دروست دەبێت و لە زیودا دەتوانێت وەک ڕەنگی تاریک دەربکەوێت. هەمان rust ی ئاسن نییە. شێوازی پاککردنەوە بە فلز و داپۆشین و بەردەکان پەیوەستە.",
      en: "Tarnish is a surface change caused when certain metals react with substances in the environment, and silver can develop a darker appearance. It is not the same as iron rust. The appropriate cleaning method depends on the metal, plating, and any stones in the piece.",
    },
  },
];

export const FAWRI_ENCYCLOPEDIA_EXPANSION_ARTICLE_IDS = Object.freeze(
  FAWRI_ENCYCLOPEDIA_EXPANSION_ARTICLES.map((article) => article.id),
);
