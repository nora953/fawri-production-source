import { scoreSemanticDocument } from "./semanticRetriever.js";
import {
  isAuthoritativeFactQuestion,
  KnowledgeRuntimeGateError,
  getPostgresKnowledgeSqlClient,
  type KnowledgeSqlExecutor,
} from "./postgresKnowledgeRuntime.js";
import {
  normalizeKnowledgeText,
  boundedText,
} from "./normalization.js";
import type {
  FawriCuratedKnowledge,
  FawriEncyclopediaMatch,
  FawriEncyclopediaResolver,
  KnowledgeLanguage,
  SemanticDocument,
} from "./types.js";
import { FAWRI_ENCYCLOPEDIA_EXPANSION_ARTICLES } from "./fawriEncyclopediaExpansion.js";
import { FAWRI_ENCYCLOPEDIA_EXPANSION_V2_ARTICLES } from "./fawriEncyclopediaExpansion2.js";

export type ActivityKey =
  | "fashion"
  | "electronics"
  | "food"
  | "perfumes"
  | "jewelry";

export type CuratedArticle = {
  id: string;
  scope: "global" | "activity";
  activityKey?: ActivityKey;
  questions: Record<KnowledgeLanguage, string[]>;
  answers: Record<KnowledgeLanguage, string>;
};

const ACTIVITY_ALIASES: Record<ActivityKey, string[]> = {
  fashion: [
    "ملابس", "ازياء", "أزياء", "fashion", "clothing", "apparel",
    "جلوبەرگ", "جل و بەرگ",
  ],
  electronics: [
    "الكترونيات", "إلكترونيات", "electronics", "electronic",
    "ئەلکترۆنیات", "ئەلکترۆنی",
  ],
  food: [
    "مواد غذائية", "مواد غذاييه", "اغذيه", "أغذية", "food", "grocery",
    "خواردن", "خواردنی",
  ],
  perfumes: [
    "عطور", "عطر", "perfume", "perfumes", "fragrance",
    "بۆن", "عەتر",
  ],
  jewelry: [
    "مجوهرات", "حلي", "jewelry", "jewellery",
    "زێڕ", "خشڵ",
  ],
};

const ARTICLES: CuratedArticle[] = [
  {
    id: "fawri-global-sku",
    scope: "global",
    questions: {
      ar: ["ما هو sku", "شنو معنى sku", "ما معنى رمز المنتج"],
      ku: ["sku چییە", "مانای sku چییە", "کۆدی بەرهەم چییە"],
      en: ["what is sku", "what does sku mean", "what is a product sku"],
    },
    answers: {
      ar: "SKU هو رمز داخلي مميز يستخدمه المتجر للتفريق بين المنتجات أو الخيارات مثل اللون والحجم. قد يكون لكل خيار SKU مختلف.",
      ku: "SKU کۆدێکی ناوخۆیی تایبەتە کە فرۆشگا بۆ جیاکردنەوەی بەرهەم یان هەڵبژاردەکان وەک ڕەنگ و قەبارە بەکاری دەهێنێت. هەر هەڵبژاردەیەک دەتوانێت SKU ی جیاواز هەبێت.",
      en: "An SKU is an internal store identifier used to distinguish products or variants such as color and size. Different variants can have different SKUs.",
    },
  },
  {
    id: "fawri-global-variant",
    scope: "global",
    questions: {
      ar: ["ما هو متغير المنتج", "شنو يعني variant", "ما الفرق بين المنتج والخيار"],
      ku: ["variant چییە", "جیاوازی بەرهەم و هەڵبژاردە چییە"],
      en: ["what is a product variant", "what does variant mean", "product versus variant"],
    },
    answers: {
      ar: "متغير المنتج هو نسخة محددة من نفس المنتج تختلف بصفة مثل اللون أو الحجم أو السعة. السعر أو المخزون قد يختلفان بين المتغيرات، لذلك يجب تحديد الخيار المطلوب عند السؤال عن بياناته الحالية.",
      ku: "گۆڕاوەی بەرهەم وەشانی دیاریکراوی هەمان بەرهەمە کە بە تایبەتمەندییەک وەک ڕەنگ، قەبارە یان گنجایش جیاوازە. نرخ یان بەردەستبوون دەتوانێت لە نێوان گۆڕاوەکاندا جیاواز بێت، بۆیە بۆ زانیاریی ئێستا دەبێت هەڵبژاردەکە دیاری بکرێت.",
      en: "A product variant is a specific version of the same product that differs by an attribute such as color, size, or capacity. Price or stock can differ by variant, so the exact option should be identified for current facts.",
    },
  },
  {
    id: "fawri-fashion-sizing",
    scope: "activity",
    activityKey: "fashion",
    questions: {
      ar: ["كيف اختار المقاس", "شلون اعرف مقاسي", "طريقة اختيار قياس الملابس"],
      ku: ["چۆن قەبارە هەڵبژێرم", "چۆن قەبارەم بزانم", "قەبارەی جل چۆن دیاری بکەم"],
      en: ["how do i choose my size", "how do i know my clothing size", "how to choose clothing size"],
    },
    answers: {
      ar: "أفضل طريقة هي قياس الجسم بشريط قياس ومقارنة الصدر والخصر والورك بجدول مقاسات المنتج نفسه. المقاسات قد تختلف بين الماركات والموديلات، لذلك جدول المنتج أدق من الاعتماد على S أو M أو L وحدها.",
      ku: "باشترین ڕێگا ئەوەیە بە شریتی پێوانە جەستە بپێویت و سنگ و کەمەر و ناوقەد بە خشتەی قەبارەی هەمان بەرهەم بەراورد بکەیت. قەبارەکان لە نێوان مارکە و مۆدێلەکاندا دەگۆڕێن، بۆیە خشتەی بەرهەم وردترە لە تەنها S یان M یان L.",
      en: "The best method is to measure the body with a tape and compare chest, waist, and hip measurements with that product's own size chart. S, M, and L can vary by brand and model, so the product chart is more reliable.",
    },
  },
  {
    id: "fawri-fashion-fabrics",
    scope: "activity",
    activityKey: "fashion",
    questions: {
      ar: ["ما الفرق بين القطن والبوليستر", "قطن لو بوليستر", "الفرق بين cotton و polyester"],
      ku: ["جیاوازی کەتان و پۆلیستەر چییە", "کەتان یان پۆلیستەر"],
      en: ["cotton vs polyester", "what is the difference between cotton and polyester"],
    },
    answers: {
      ar: "القطن ليف طبيعي وغالبا يكون أكثر امتصاصا للرطوبة وتهوية، بينما البوليستر ليف صناعي يجف أسرع ويقاوم التجعد عادة. الإحساس والعناية والمتانة تعتمد أيضا على سماكة القماش ونسبة الخلط وطريقة التصنيع.",
      ku: "کەتان ڕیشەیەکی سروشتییە و زۆرجار هەناسەدان و هەڵمژینی شێداری باشترە، بەڵام پۆلیستەر ڕیشەیەکی دەستکردە کە زووتر وشک دەبێتەوە و زۆرجار کەمتر چرووک دەبێت. هەست و چاودێری و بەهێزی پارچەکە بە ئەستووری، ڕێژەی تێکەڵکردن و دروستکردنیش پەیوەستە.",
      en: "Cotton is a natural fiber that is often more breathable and absorbent, while polyester is synthetic, usually dries faster, and often resists wrinkling better. Feel, care, and durability also depend on fabric weight, blend, and construction.",
    },
  },
  {
    id: "fawri-fashion-fit",
    scope: "activity",
    activityKey: "fashion",
    questions: {
      ar: ["ما الفرق بين slim fit و regular و oversized", "شنو slim fit", "شنو oversized"],
      ku: ["slim fit و regular و oversized چییە", "slim fit چییە", "oversized چییە"],
      en: ["slim fit vs regular fit vs oversized", "what is slim fit", "what is oversized fit"],
    },
    answers: {
      ar: "Slim fit يكون أقرب إلى الجسم، وRegular fit بقصة معتدلة، وOversized بقصة أوسع ومقصودة. الشكل الفعلي يختلف حسب تصميم القطعة، لذلك القياسات وجدول المنتج هما المرجع الأفضل.",
      ku: "Slim fit لە جەستە نزیکترە، Regular fit بڕینێکی مامناوەندە، و Oversized بە ئەنقەست فراوانترە. شێوەی ڕاستەقینە بە دیزاینی پارچەکە دەگۆڕێت، بۆیە پێوانە و خشتەی بەرهەم باشترین سەرچاوەن.",
      en: "Slim fit sits closer to the body, regular fit has a more standard cut, and oversized fit is intentionally roomier. Actual fit varies by garment design, so product measurements and the size chart are the best reference.",
    },
  },
  {
    id: "fawri-fashion-care-label",
    scope: "activity",
    activityKey: "fashion",
    questions: {
      ar: ["كيف اغسل القطعة", "تعليمات غسل الملابس", "كيف اعتني بالملابس"],
      ku: ["چۆن جلەکە بشۆم", "ڕێنمایی شۆردنی جل", "چۆن چاودێری جل بکەم"],
      en: ["how should i wash this garment", "clothing wash instructions", "how to care for clothing"],
    },
    answers: {
      ar: "اتبع ملصق العناية الموجود على القطعة لأنه يحدد درجة الغسل والتجفيف والكي المناسبة للمادة والتصنيع. إذا تعارضت نصيحة عامة مع ملصق القطعة، فملصق القطعة هو المرجع.",
      ku: "ڕێنمایی چاودێریی سەر پارچە جلەکە پەیڕەو بکە، چونکە پلەی شۆردن و وشککردنەوە و ئوتووی گونجاو بۆ ماددە و دروستکردنەکە دیاری دەکات. ئەگەر ئامۆژگاریی گشتی لەگەڵ لیبڵەکە جیاواز بوو، لیبڵی پارچەکە سەرچاوەیە.",
      en: "Follow the care label on the garment because it specifies washing, drying, and ironing conditions for that material and construction. If general advice conflicts with the item's label, the item's label is the reference.",
    },
  },
  {
    id: "fawri-electronics-ram-storage",
    scope: "activity",
    activityKey: "electronics",
    questions: {
      ar: ["ما الفرق بين الرام والتخزين", "شنو الفرق بين ram و storage", "الرام شنو"],
      ku: ["جیاوازی ram و storage چییە", "ram چییە"],
      en: ["ram vs storage", "difference between ram and storage", "what is ram"],
    },
    answers: {
      ar: "RAM ذاكرة مؤقتة يستخدمها الجهاز أثناء تشغيل التطبيقات والمهام، وزيادتها تساعد عادة في تعدد المهام. التخزين هو المساحة الدائمة للملفات والتطبيقات والصور. كلاهما مختلف ولا يعوض أحدهما الآخر.",
      ku: "RAM بیرگەی کاتییە کە ئامێر لە کاتی کارکردنی ئەپ و ئەرکەکان بەکاری دەهێنێت و زۆربوونی زۆرجار لە کارکردنی چەند ئەرک یارمەتیدەرە. Storage شوێنی هەمیشەیی بۆ فایل و ئەپ و وێنەکانە. ئەمانە دوو شتی جیاوازن.",
      en: "RAM is temporary working memory used while apps and tasks are running, and more RAM can help with multitasking. Storage is persistent space for apps, files, and photos. They are different resources and do not replace each other.",
    },
  },
  {
    id: "fawri-electronics-mah",
    scope: "activity",
    activityKey: "electronics",
    questions: {
      ar: ["شنو يعني mah بالبطارية", "ما معنى mah", "سعة البطارية mah"],
      ku: ["mAh لە باتری چییە", "مانای mAh چییە"],
      en: ["what does mah mean", "battery mah meaning", "what is mah in a battery"],
    },
    answers: {
      ar: "mAh هي وحدة شائعة للتعبير عن سعة البطارية. الرقم الأكبر يعني سعة كهربائية أكبر نظريا، لكنه لا يضمن وحده مدة تشغيل أطول لأن الاستهلاك يعتمد على الجهاز والشاشة والمعالج والاستخدام والبرمجيات.",
      ku: "mAh یەکەیەکی باوە بۆ دەربڕینی گنجایشی باتری. ژمارەی گەورەتر بە تیۆری گنجایشی کارەبایی زیاتر نیشان دەدات، بەڵام بە تەنها ماوەی کارکردنی درێژتر مسۆگەر ناکات چونکە بەکارهێنان بە ئامێر و شاشە و پرۆسێسەر و شێوازی بەکارهێنان پەیوەستە.",
      en: "mAh is a common unit for battery capacity. A larger number means more electrical capacity in theory, but it does not by itself guarantee longer runtime because power use depends on the device, display, processor, software, and usage.",
    },
  },
  {
    id: "fawri-electronics-ip-rating",
    scope: "activity",
    activityKey: "electronics",
    questions: {
      ar: ["شنو يعني ip67", "شنو يعني ip68", "ما معنى تصنيف ip"],
      ku: ["IP67 چییە", "IP68 چییە", "IP rating چییە"],
      en: ["what does ip67 mean", "what does ip68 mean", "what is an ip rating"],
    },
    answers: {
      ar: "تصنيف IP يصف مستوى الحماية الذي تم اختباره ضد دخول الغبار والماء وفق معيار محدد. معنى الأرقام يعتمد على التصنيف الكامل، ولا يعني أن الجهاز غير قابل للتلف بالماء في كل الظروف. يجب الرجوع إلى مواصفات الموديل وشروط الشركة المصنعة.",
      ku: "IP rating ئاستی پاراستنی تاقیکراوە دژی چوونەژوورەوەی تۆز و ئاو بە پێی ستانداردێکی دیاریکراو نیشان دەدات. مانای ژمارەکان بە کۆدی تەواو پەیوەستە و واتای ئەوە نییە کە ئامێر لە هەموو دۆخێکدا لە ئاو زیان نابینێت. پێویستە مواسفات و مەرجەکانی مۆدێلەکە بپشکنرێت.",
      en: "An IP rating describes tested protection against dust and water ingress under a defined standard. The digits have specific meanings, and the rating does not mean a device is immune to water damage in every situation. Check the exact model specifications and manufacturer conditions.",
    },
  },
  {
    id: "fawri-electronics-usbc",
    scope: "activity",
    activityKey: "electronics",
    questions: {
      ar: ["هل كل usb c نفس الشي", "شنو الفرق بين منافذ usb c", "هل usb c يعني شحن سريع"],
      ku: ["هەموو USB C یەکسانن", "جیاوازی USB C چییە", "USB C واتە شارجی خێرا"],
      en: ["are all usb c ports the same", "does usb c mean fast charging", "usb c differences"],
    },
    answers: {
      ar: "شكل منفذ USB-C وحده لا يحدد سرعة الشحن أو نقل البيانات أو دعم الفيديو. هذه القدرات تختلف حسب الجهاز والكابل والمعيار المدعوم، لذلك يجب التحقق من مواصفات الموديل والكابل.",
      ku: "تەنها شێوەی پۆرتی USB-C خێرایی شارج یان گواستنەوەی داتا یان پشتگیری ڤیدیۆ دیاری ناکات. ئەم توانایانە بە ئامێر و کابڵ و ستانداردی پشتگیریکراو دەگۆڕێن، بۆیە مواسفات بپشکنە.",
      en: "The USB-C connector shape alone does not define charging speed, data speed, or video support. Those capabilities depend on the device, cable, and supported standard, so the exact model and cable specifications should be checked.",
    },
  },
  {
    id: "fawri-food-date-labels",
    scope: "activity",
    activityKey: "food",
    questions: {
      ar: ["شنو الفرق بين best before و expiry", "ما الفرق بين يفضل قبل وتاريخ الانتهاء", "best before يعني منتهي"],
      ku: ["جیاوازی best before و expiry چییە", "best before واتە بەسەرچوو"],
      en: ["best before vs expiry", "best before versus use by", "does best before mean expired"],
    },
    answers: {
      ar: "عبارات التاريخ تختلف حسب البلد ونوع المنتج. غالبا يشير Best Before إلى الجودة، بينما تواريخ الانتهاء أو Use By قد ترتبط بالسلامة أو الصلاحية المحددة. المرجع النهائي هو نص العبوة وتعليمات الشركة والأنظمة المحلية، ولا ينبغي تجاوز تعليمات السلامة على الملصق.",
      ku: "دەستەواژەکانی بەروار بە پێی وڵات و جۆری بەرهەم دەگۆڕێن. زۆرجار Best Before پەیوەندی بە کوالێتی هەیە، بەڵام Expiry یان Use By دەتوانێت بە سەلامەتی یان ماوەی بەکارهێنان پەیوەست بێت. نووسینی سەر پاکەت و ڕێنمایی بەرهەمهێنەر و یاسای ناوخۆیی سەرچاوەی کۆتاییە.",
      en: "Date-label terms vary by country and product. Best Before often relates to quality, while Expiry or Use By may relate to safety or a defined usable period. The package wording, manufacturer instructions, and local rules are the final reference, and safety directions on the label should not be overridden.",
    },
  },
  {
    id: "fawri-food-allergens",
    scope: "activity",
    activityKey: "food",
    questions: {
      ar: ["هل يحتوي على مسببات حساسية", "شلون اعرف الحساسية من المنتج", "وين الاقي allergen"],
      ku: ["ئایا مادەی هەستیاری تێدایە", "چۆن allergen بزانم"],
      en: ["does it contain allergens", "how do i check allergens", "where are allergens listed"],
    },
    answers: {
      ar: "معلومات مسببات الحساسية يجب أخذها من قائمة المكونات وبيان الحساسية على عبوة المنتج أو بيانات الشركة المصنعة. لا يصح استنتاج خلو المنتج من مادة مسببة للحساسية من الاسم أو الصورة فقط.",
      ku: "زانیاریی ماددە هەستیارکەرەکان دەبێت لە لیستی پێکهاتە و ئاگاداریی هەستیاریی سەر پاکەت یان زانیاریی بەرهەمهێنەر وەربگیرێت. نابێت تەنها لە ناو یان وێنەی بەرهەمەکەوە بێ ماددەی هەستیارکەر دابنرێت.",
      en: "Allergen information should come from the ingredient list and allergen statement on the package or manufacturer data. A product should not be assumed allergen-free from its name or image alone.",
    },
  },
  {
    id: "fawri-food-storage",
    scope: "activity",
    activityKey: "food",
    questions: {
      ar: ["كيف اخزن هذا المنتج", "طريقة حفظ المنتج الغذائي", "هل يحتاج ثلاجة"],
      ku: ["چۆن ئەم خواردنە هەڵبگرم", "ئایا پێویستی بە ساردکەرەوە هەیە"],
      en: ["how should i store this food", "does this need refrigeration", "food storage instructions"],
    },
    answers: {
      ar: "طريقة الحفظ تعتمد على المنتج وحالته قبل وبعد الفتح. اتبع تعليمات التخزين المكتوبة على العبوة أو من الشركة المصنعة، خصوصا متطلبات التبريد ومدة الاستخدام بعد الفتح.",
      ku: "شێوازی هەڵگرتن بە جۆری بەرهەم و دۆخی پێش و دوای کردنەوە پەیوەستە. ڕێنمایی هەڵگرتنی سەر پاکەت یان بەرهەمهێنەر پەیڕەو بکە، بە تایبەتی ساردکردنەوە و ماوەی بەکارهێنان دوای کردنەوە.",
      en: "Storage depends on the product and whether it is opened or unopened. Follow the storage instructions on the package or from the manufacturer, especially refrigeration requirements and any after-opening time limit.",
    },
  },
  {
    id: "fawri-perfume-edt-edp",
    scope: "activity",
    activityKey: "perfumes",
    questions: {
      ar: ["ما الفرق بين edt و edp", "شنو الفرق بين eau de toilette و eau de parfum", "edp اقوى من edt"],
      ku: ["جیاوازی EDT و EDP چییە", "EDP بەهێزترە لە EDT"],
      en: ["edt vs edp", "eau de toilette vs eau de parfum", "is edp stronger than edt"],
    },
    answers: {
      ar: "EDT وEDP تسميات لتركيزات عطرية مختلفة عادة، وغالبا يكون EDP أعلى تركيزا من EDT ضمن نفس الخط، لكن النسب والثبات والفوحان تختلف بين الشركات والتركيبات. مواصفات العطر نفسه هي المرجع الأدق.",
      ku: "EDT و EDP زۆرجار ناونیشانی کۆنسەنتراسیۆنی جیاوازی بۆنن و EDP لە هەمان هێڵدا زۆرجار کۆنسەنتراسیۆنی بەرزتر هەیە. بەڵام ڕێژە و ماندووبوون و بڵاوبوونەوە لە نێوان کۆمپانیا و فۆرمولاکاندا دەگۆڕێت؛ مواسفات هەمان بۆن وردترە.",
      en: "EDT and EDP usually describe different fragrance concentrations, and EDP is often more concentrated than EDT within the same line. Exact percentages, longevity, and projection vary by brand and formula, so the specific fragrance specification is the better reference.",
    },
  },
  {
    id: "fawri-perfume-notes",
    scope: "activity",
    activityKey: "perfumes",
    questions: {
      ar: ["شنو النوتات العليا والوسطى والقاعدية", "ما معنى top middle base notes", "طبقات العطر شنو"],
      ku: ["top middle base notes چییە", "چینەکانی بۆن چین"],
      en: ["what are top middle and base notes", "fragrance notes explained", "perfume note layers"],
    },
    answers: {
      ar: "النوتات العليا هي الانطباع الأول بعد الرش، والوسطى تظهر مع تطور العطر، والقاعدية تبقى عادة لفترة أطول وتشكل أساس الرائحة. هذا وصف لبنية الرائحة وليس جدولا زمنيا ثابتا لأن الأداء يختلف حسب التركيبة والجلد والبيئة.",
      ku: "Top notes یەکەم هەستە دوای پشکردن، middle notes لەگەڵ گەشەکردنی بۆن دەردەکەون، و base notes زۆرجار ماوەی درێژتر دەمێنن و بنەمای بۆنەکەن. ئەمە باسکردنی پێکهاتەی بۆنە، نە کاتژمێرێکی جێگیر.",
      en: "Top notes form the first impression after spraying, middle notes emerge as the fragrance develops, and base notes usually last longer and form the foundation. These describe fragrance structure rather than a fixed timeline, because performance varies by formula, skin, and environment.",
    },
  },
  {
    id: "fawri-perfume-storage",
    scope: "activity",
    activityKey: "perfumes",
    questions: {
      ar: ["كيف اخزن العطر", "وين احفظ العطر", "هل الشمس تخرب العطر"],
      ku: ["چۆن بۆن هەڵبگرم", "بۆن لە کوێ هەڵبگرم", "خۆر بۆن زیان پێدەگەیەنێت"],
      en: ["how should i store perfume", "where should perfume be stored", "does sunlight affect perfume"],
    },
    answers: {
      ar: "يفضل حفظ العطر مغلقا في مكان معتدل ومستقر بعيدا عن الشمس المباشرة والحرارة العالية والتغيرات الكبيرة في الحرارة. العبوة الأصلية ومكان مظلم داخل الغرفة غالبا أفضل من تركها قرب نافذة أو مصدر حرارة.",
      ku: "باشترە بۆن داخراو لە شوێنێکی مامناوەند و جێگیر، دوور لە تیشکی ڕاستەوخۆی خۆر و گەرمای زۆر و گۆڕانی توندی پلەی گەرمی هەڵبگیرێت. پاکەتی ئەسڵی و شوێنێکی تاریک زۆرجار باشترە لە نزیک پەنجەرە یان سەرچاوەی گەرما.",
      en: "Perfume is best kept closed in a stable, moderate environment away from direct sunlight, high heat, and large temperature swings. Its original packaging in a dark indoor place is generally better than a window or heat source.",
    },
  },
  {
    id: "fawri-perfume-longevity",
    scope: "activity",
    activityKey: "perfumes",
    questions: {
      ar: ["كم يثبت العطر", "ليش العطر يثبت على شخص اكثر", "مدة ثبات العطر"],
      ku: ["بۆن چەند دەمێنێتەوە", "بۆچی بۆن لە کەسێک زیاتر دەمێنێتەوە"],
      en: ["how long does perfume last", "why does perfume last longer on some people", "perfume longevity"],
    },
    answers: {
      ar: "ثبات العطر يتأثر بالتركيبة والتركيز والكمية المرشوشة ونوع البشرة والحرارة والرطوبة وطريقة التخزين. لذلك لا يمكن إعطاء مدة دقيقة من اسم التركيز وحده ما لم تكن هناك بيانات خاصة بالعطر نفسه.",
      ku: "مانەوەی بۆن بە فۆرمولا و کۆنسەنتراسیۆن و بڕی پشکردن و جۆری پێست و پلەی گەرمی و شێداری و شێوازی هەڵگرتن پەیوەستە. بۆیە تەنها لە ناوی کۆنسەنتراسیۆنەکەوە ناتوانرێت ماوەیەکی ورد دیاری بکرێت.",
      en: "Fragrance longevity depends on formula, concentration, amount applied, skin type, temperature, humidity, and storage. A precise duration cannot be inferred from the concentration label alone unless there is data for that specific fragrance.",
    },
  },
  {
    id: "fawri-jewelry-925",
    scope: "activity",
    activityKey: "jewelry",
    questions: {
      ar: ["شنو يعني 925 بالفضة", "ما معنى فضة 925", "925 silver شنو"],
      ku: ["925 لە زیو چییە", "زیوی 925 واتە چی"],
      en: ["what does 925 silver mean", "what is sterling silver 925", "925 jewelry meaning"],
    },
    answers: {
      ar: "ختم 925 يستخدم عادة للدلالة على فضة إسترليني تحتوي نظريا على 92.5% فضة مع معادن أخرى لتحسين الصلابة. وجود الختم وحده ليس فحص أصالة؛ التحقق من البائع أو الفحص المختص هو الأدق عند الحاجة.",
      ku: "نیشانی 925 زۆرجار بۆ Sterling Silver بەکاردێت کە بە تیۆری 92.5% زیو و ماددەی تر بۆ بەهێزکردن تێدایە. تەنها بوونی نیشانەکە بەڵگەی تەواوی ڕەسەنایەتی نییە؛ بۆ دڵنیایی پشکنینی فرۆشیار یان پسپۆڕ وردترە.",
      en: "A 925 mark is commonly used for sterling silver, nominally 92.5% silver with other metals added for strength. The stamp alone is not an authenticity test; seller documentation or professional testing is more reliable when verification matters.",
    },
  },
  {
    id: "fawri-jewelry-karat",
    scope: "activity",
    activityKey: "jewelry",
    questions: {
      ar: ["شنو الفرق بين ذهب 24 و 18 و 14", "ما معنى عيار الذهب", "gold karat meaning"],
      ku: ["جیاوازی 24 و 18 و 14 عەیار چییە", "عەیاری زێڕ چییە"],
      en: ["24k vs 18k vs 14k gold", "what does gold karat mean", "gold karat explained"],
    },
    answers: {
      ar: "العيار يعبّر عن نسبة الذهب في السبيكة على مقياس من 24 جزءا. 24K هو الأعلى نقاء ضمن هذا النظام، بينما 18K و14K يحتويان نسبة ذهب أقل ومعادن أخرى أكثر، ما يؤثر في اللون والصلابة والسعر.",
      ku: "عەیار ڕێژەی زێڕ لە تێکەڵەکەدا لە سیستەمی 24 بەش نیشان دەدات. 24K لەم سیستەمەدا پاکترە، بەڵام 18K و 14K ڕێژەی زێڕی کەمتر و ماددەی تری زیاتر هەیە و ئەمە لە ڕەنگ و بەهێزی و نرخ کاریگەری دەکات.",
      en: "Karat expresses the proportion of gold in an alloy on a 24-part scale. 24K is the highest-purity level in that system, while 18K and 14K contain less gold and more alloying metals, which affects color, hardness, and price.",
    },
  },
  {
    id: "fawri-jewelry-plated-solid",
    scope: "activity",
    activityKey: "jewelry",
    questions: {
      ar: ["شنو الفرق بين مطلي وذهب صافي", "gold plated vs solid gold", "ما معنى مطلي ذهب"],
      ku: ["جیاوازی gold plated و solid gold چییە", "زێڕپۆش چییە"],
      en: ["gold plated vs solid gold", "what does gold plated mean", "plated versus solid jewelry"],
    },
    answers: {
      ar: "المطلي بالذهب يكون له عادة معدن أساسي مغطى بطبقة ذهب، بينما القطعة الذهبية الصلبة تكون سبيكتها نفسها تحتوي الذهب بالنسبة المحددة للعيار. سماكة ونوع الطلاء يختلفان، لذلك يجب الرجوع إلى مواصفات القطعة.",
      ku: "Gold plated زۆرجار بنەمایەکی فلزی هەیە کە بە چینێک زێڕ داپۆشراوە، بەڵام پارچەی solid gold خۆی تێکەڵەیەکە کە زێڕی بە ڕێژەی عەیارەکە تێدایە. ئەستووری و جۆری داپۆشین دەگۆڕێت، بۆیە مواسفات پارچەکە سەرچاوەیە.",
      en: "Gold-plated jewelry usually has a base metal covered by a layer of gold, while solid-gold jewelry is made from an alloy containing gold at the stated karat proportion. Plating type and thickness vary, so the item specification matters.",
    },
  },
  {
    id: "fawri-jewelry-care",
    scope: "activity",
    activityKey: "jewelry",
    questions: {
      ar: ["كيف احافظ على المجوهرات", "طريقة تنظيف المجوهرات", "شلون اخزن الحلي"],
      ku: ["چۆن خشڵ بپارێزم", "چۆن خشڵ پاک بکەم", "چۆن زێڕ هەڵبگرم"],
      en: ["how to care for jewelry", "how to clean jewelry", "how should jewelry be stored"],
    },
    answers: {
      ar: "طريقة العناية تختلف حسب المعدن والحجر والطلاء. كقاعدة عامة، تجنب المواد الكيميائية القوية والاحتكاك غير الضروري واحفظ القطع منفصلة لتقليل الخدش. اتبع تعليمات القطعة، خصوصا للأحجار الحساسة والقطع المطلية.",
      ku: "چاودێری بە جۆری فلز و بەرد و داپۆشین دەگۆڕێت. بە گشتی لە ماددە کیمیاییە توندەکان و کێشانەوەی ناپێویست دووربکەوە و پارچەکان جیاواز هەڵبگرە بۆ کەمکردنەوەی خراش. ڕێنمایی هەمان پارچە پەیڕەو بکە، بە تایبەتی بۆ بەردی هەستیار و پارچەی داپۆشراو.",
      en: "Care depends on the metal, stones, and plating. As a general rule, avoid harsh chemicals and unnecessary abrasion, and store pieces separately to reduce scratching. Follow the item's own care instructions, especially for delicate stones and plated pieces.",
    },
  },
];

const ALL_ARTICLES: CuratedArticle[] = [
  ...ARTICLES,
  ...FAWRI_ENCYCLOPEDIA_EXPANSION_ARTICLES,
  ...FAWRI_ENCYCLOPEDIA_EXPANSION_V2_ARTICLES,
];

function normalizeActivityKey(value: unknown): ActivityKey | null {
  const normalized = normalizeKnowledgeText(value);
  if (!normalized) return null;
  for (const [key, aliases] of Object.entries(ACTIVITY_ALIASES) as Array<
    [ActivityKey, string[]]
  >) {
    if (
      aliases.some((alias) => {
        const candidate = normalizeKnowledgeText(alias);
        return normalized === candidate || normalized.includes(candidate);
      })
    ) {
      return key;
    }
  }
  return null;
}

function articleScore(
  article: CuratedArticle,
  customerText: string,
  language: KnowledgeLanguage,
): number {
  let best = 0;
  for (const question of article.questions[language]) {
    const document: SemanticDocument = {
      id: article.id,
      merchantId: "fawri-curated",
      question,
      answer: article.answers[language],
      language,
      source: "merchant_approved",
      kind: "saved_answer",
    };
    best = Math.max(
      best,
      scoreSemanticDocument(customerText, language, document),
    );
  }
  if (article.scope === "activity") best = Math.min(1, best + 0.04);
  return best;
}

function articleBestQuestion(
  article: CuratedArticle,
  customerText: string,
  language: KnowledgeLanguage,
): { question: string; score: number } {
  let bestQuestion = article.questions[language][0] || "";
  let bestScore = 0;
  for (const question of article.questions[language]) {
    const document: SemanticDocument = {
      id: article.id,
      merchantId: "fawri-curated",
      question,
      answer: article.answers[language],
      language,
      source: "merchant_approved",
      kind: "saved_answer",
    };
    const score = scoreSemanticDocument(customerText, language, document);
    if (score > bestScore) {
      bestQuestion = question;
      bestScore = score;
    }
  }
  if (article.scope === "activity") bestScore = Math.min(1, bestScore + 0.04);
  return { question: bestQuestion, score: bestScore };
}

function retrieveContext(params: {
  customerText: string;
  language: KnowledgeLanguage;
  activityKey: ActivityKey | null;
  limit: number;
  threshold: number;
}): FawriCuratedKnowledge[] {
  return ALL_ARTICLES
    .filter(
      (article) =>
        article.scope === "global" ||
        (article.scope === "activity" &&
          params.activityKey &&
          article.activityKey === params.activityKey),
    )
    .map((article) => {
      const best = articleBestQuestion(
        article,
        params.customerText,
        params.language,
      );
      return { article, question: best.question, score: best.score };
    })
    .filter((candidate) => candidate.score >= params.threshold)
    .sort((left, right) => right.score - left.score)
    .slice(0, params.limit)
    .map(({ article, question, score }) => ({
      id: article.id,
      scope: article.scope,
      activityKey:
        article.scope === "activity" ? article.activityKey || null : null,
      question: boundedText(question, 500),
      answer: boundedText(article.answers[params.language], 2_000),
      language: params.language,
      confidence: score,
    }));
}

function retrieveArticle(params: {
  customerText: string;
  language: KnowledgeLanguage;
  activityKey: ActivityKey | null;
  threshold: number;
}): FawriEncyclopediaMatch | null {
  const candidates = ALL_ARTICLES
    .filter(
      (article) =>
        article.scope === "global" ||
        (article.scope === "activity" &&
          params.activityKey &&
          article.activityKey === params.activityKey),
    )
    .map((article) => ({
      article,
      score: articleScore(article, params.customerText, params.language),
    }))
    .sort((left, right) => right.score - left.score);

  const best = candidates[0];
  if (!best || best.score < params.threshold) return null;
  const second = candidates[1];
  if (second && best.score < 0.9 && best.score - second.score < 0.06) {
    return null;
  }

  return {
    articleId: best.article.id,
    scope: best.article.scope,
    activityKey:
      best.article.scope === "activity" ? best.article.activityKey || null : null,
    answerText: boundedText(best.article.answers[params.language], 2_000),
    language: params.language,
    confidence: best.score,
  };
}

export class PostgresFawriEncyclopediaResolver
  implements FawriEncyclopediaResolver
{
  constructor(
    private readonly sql: KnowledgeSqlExecutor = getPostgresKnowledgeSqlClient(),
    private readonly threshold = 0.58,
  ) {}

  async resolve(input: {
    merchantId: string;
    customerText: string;
    language: KnowledgeLanguage;
  }): Promise<FawriEncyclopediaMatch | null> {
    const merchantId = boundedText(input.merchantId, 160);
    const customerText = boundedText(input.customerText, 2_000);
    if (!merchantId || !customerText) return null;
    if (isAuthoritativeFactQuestion(customerText)) return null;

    let rows: Array<{ activity_type?: unknown }>;
    try {
      rows = (
        await this.sql.query<{ activity_type?: unknown }>(
          `SELECT activity_type
             FROM merchants
            WHERE id = $1
            LIMIT 2`,
          [merchantId],
        )
      ).rows;
    } catch {
      throw new KnowledgeRuntimeGateError(
        "FAWRI_ENCYCLOPEDIA_ACTIVITY_UNAVAILABLE",
        "merchant activity is unavailable for encyclopedia resolution",
      );
    }
    if (rows.length !== 1) return null;

    return retrieveArticle({
      customerText,
      language: input.language,
      activityKey: normalizeActivityKey(rows[0]?.activity_type),
      threshold: this.threshold,
    });
  }

  async listRelevantContext(input: {
    merchantId: string;
    customerText: string;
    language: KnowledgeLanguage;
    limit?: number;
  }): Promise<FawriCuratedKnowledge[]> {
    const merchantId = boundedText(input.merchantId, 160);
    const customerText = boundedText(input.customerText, 2_000);
    const limit = Math.max(1, Math.min(6, Math.trunc(input.limit ?? 4)));
    if (!merchantId || !customerText) return [];
    if (isAuthoritativeFactQuestion(customerText)) return [];

    let rows: Array<{ activity_type?: unknown }>;
    try {
      rows = (
        await this.sql.query<{ activity_type?: unknown }>(
          `SELECT activity_type
             FROM merchants
            WHERE id = $1
            LIMIT 2`,
          [merchantId],
        )
      ).rows;
    } catch {
      throw new KnowledgeRuntimeGateError(
        "FAWRI_ENCYCLOPEDIA_ACTIVITY_UNAVAILABLE",
        "merchant activity is unavailable for encyclopedia context",
      );
    }
    if (rows.length !== 1) return [];

    return retrieveContext({
      customerText,
      language: input.language,
      activityKey: normalizeActivityKey(rows[0]?.activity_type),
      limit,
      threshold: 0.28,
    });
  }
}

export const FAWRI_ENCYCLOPEDIA_ARTICLE_IDS = Object.freeze(
  ALL_ARTICLES.map((article) => article.id),
);
