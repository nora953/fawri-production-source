// Centralized localized copy extracted from pages/dashboard/ProductsPage.tsx.
// Keep runtime behavior in the source component; keep language copy here.

export const PRODUCTS_PAGE_MESSAGES = {
  loadFailed: {
    ar: 'تعذر تحميل المنتجات من الخادم.',
    ku: 'بارکردنی بەرهەمەکان لە سێرڤەر سەرکەوتوو نەبوو.',
    en: 'Could not load products from the server.',
  },
  saveFailed: {
    ar: 'لم يتم حفظ المنتج لأن الخادم رفض العملية.',
    ku: 'بەرهەمەکە پاشەکەوت نەکرا چونکە سێرڤەر داواکارییەکەی ڕەتکردەوە.',
    en: 'The product was not saved because the server rejected the request.',
  },
  deleteFailed: {
    ar: 'لم يتم حذف المنتج لأن الخادم رفض العملية.',
    ku: 'بەرهەمەکە نەسڕایەوە چونکە سێرڤەر داواکارییەکەی ڕەتکردەوە.',
    en: 'The product was not deleted because the server rejected the request.',
  },
  versionConflict: {
    ar: 'تم تعديل هذا المنتج من مكان آخر. تم تحميل أحدث نسخة من الخادم؛ راجعها وحاول مجددًا.',
    ku: 'ئەم بەرهەمە لە شوێنێکی تر گۆڕدراوە. نوێترین وەشانی سێرڤەر بارکرا؛ پێداچوونەوە بکە و دووبارە هەوڵ بدە.',
    en: 'This product changed elsewhere. The latest server version was loaded; review it and try again.',
  },
  importValidation: {
    ar: 'لم يبدأ الاستيراد بسبب أخطاء في الصفوف:',
    ku: 'هاوردەکردن دەستپێنەکرد چونکە هەڵە لە ڕیزەکان هەیە:',
    en: 'Import was not started because some rows are invalid:',
  },
  secureCryptoRequired: {
    ar: 'تعذر إنشاء مفتاح أمان للعملية. لم يتم الحفظ.',
    ku: 'دروستکردنی کلیلی پاراستن بۆ کردارەکە سەرکەوتوو نەبوو. پاشەکەوت نەکرا.',
    en: 'A secure request key could not be created. Nothing was saved.',
  },
  variantQuantityLocked: {
    ar: 'كمية المنتج ذي المتغيرات تُدار من مخزون المتغيرات.',
    ku: 'بڕی بەرهەمی خاوەن جۆراوجۆری لە کۆگای جۆراوجۆرییەکان بەڕێوەدەبرێت.',
    en: 'Quantity for products with variants is managed by variant inventory.',
  },
  editorInvalid: {
    ar: 'راجع حقول الصور والمتغيرات والقياسات والقيم الرقمية قبل الحفظ.',
    ku: 'پێش پاشەکەوتکردن خانەکانی وێنە و جۆراوجۆری و پێوانە و ژمارەکان بپشکنە.',
    en: 'Review image, variant, measurement, and numeric fields before saving.',
  },
  imageReferenceOnly: {
    ar: 'الكتالوج يخزن مراجع الصور فقط. أدخل رابطًا موجودًا أو storage key؛ رفع الملفات غير متوفر حاليًا.',
    ku: 'کەتەلۆگ تەنها سەرچاوەی وێنە هەڵدەگرێت. URL یان storage key بنووسە؛ بارکردنی فایل بەردەست نییە.',
    en: 'The catalog stores image references only. Enter an existing URL or storage key; file upload is not available.',
  },
  images: { ar: 'الصور', ku: 'وێنەکان', en: 'Images' },
  addImage: { ar: 'إضافة مرجع صورة', ku: 'زیادکردنی سەرچاوەی وێنە', en: 'Add image reference' },
  imageUrl: { ar: 'رابط الصورة', ku: 'URL ی وێنە', en: 'Image URL' },
  storageKey: { ar: 'Storage key', ku: 'Storage key', en: 'Storage key' },
  imageAlt: { ar: 'النص البديل', ku: 'دەقی جێگرەوە', en: 'Alt text' },
  variants: { ar: 'المتغيرات', ku: 'جۆراوجۆرییەکان', en: 'Variants' },
  addVariant: { ar: 'إضافة متغير', ku: 'زیادکردنی جۆراوجۆری', en: 'Add variant' },
  variantName: { ar: 'اسم المتغير', ku: 'ناوی جۆراوجۆری', en: 'Variant name' },
  variantPrice: { ar: 'سعر المتغير (اختياري)', ku: 'نرخی جۆراوجۆری (ئارەزوومەندانە)', en: 'Variant price (optional)' },
  variantInitialStock: { ar: 'المخزون الابتدائي', ku: 'کۆگای سەرەتایی', en: 'Initial stock' },
  variantInventoryManaged: {
    ar: 'المخزون الحالي يُعدّل من أدوات المخزون بعد الحفظ.',
    ku: 'کۆگای ئێستا دوای پاشەکەوتکردن لە ئامرازەکانی کۆگا دەگۆڕدرێت.',
    en: 'Current stock is changed with inventory controls after saving.',
  },
  options: { ar: 'الخيارات', ku: 'هەڵبژاردەکان', en: 'Options' },
  addOption: { ar: 'إضافة خيار', ku: 'زیادکردنی هەڵبژاردە', en: 'Add option' },
  optionName: { ar: 'اسم الخيار (مثل Size)', ku: 'ناوی هەڵبژاردە (وەک Size)', en: 'Option name (e.g. Size)' },
  optionValue: { ar: 'القيمة (مثل M)', ku: 'بەها (وەک M)', en: 'Value (e.g. M)' },
  physicalDetails: { ar: 'الشحن / التفاصيل الفيزيائية', ku: 'گەیاندن / وردەکارییە فیزیکییەکان', en: 'Shipping / physical details' },
  physicalDetailsOptional: { ar: 'اختياري بالكامل. اترك الحقول فارغة إذا لم تكن هذه المعلومات متوفرة.', ku: 'بە تەواوی ئارەزوومەندانەیە. ئەگەر زانیارییەکە بەردەست نییە خانەکان بەتاڵ بهێڵە.', en: 'Completely optional. Leave these fields empty when the information is unknown.' },
  weightKg: { ar: 'الوزن (كغم)', ku: 'کێش (کگم)', en: 'Weight (kg)' },
  dimensionsCm: { ar: 'الأبعاد (سم)', ku: 'ڕەهەندەکان (سم)', en: 'Dimensions (cm)' },
  length: { ar: 'الطول', ku: 'درێژی', en: 'Length' },
  width: { ar: 'العرض', ku: 'پانی', en: 'Width' },
  height: { ar: 'الارتفاع', ku: 'بەرزی', en: 'Height' },
  variantMeasurementsHint: { ar: 'اترك قياسات المتغير فارغة لاستخدام قياسات المنتج. إذا أدخلت الأبعاد فأدخل الطول والعرض والارتفاع معًا.', ku: 'پێوانەکانی جۆراوجۆری بەتاڵ بهێڵە بۆ بەکارهێنانی پێوانەکانی بەرهەم. ئەگەر ڕەهەند بنووسیت، درێژی و پانی و بەرزی هەمووی بنووسە.', en: 'Leave variant measurements empty to inherit product values. If overriding dimensions, enter length, width, and height together.' },
  inventory: { ar: 'إدارة المخزون', ku: 'بەڕێوەبردنی کۆگا', en: 'Inventory' },
  inventorySet: { ar: 'تعيين', ku: 'دانان', en: 'Set' },
  inventorySaved: { ar: 'تم تحديث المخزون من الخادم.', ku: 'کۆگا لە سێرڤەر نوێکرایەوە.', en: 'Inventory updated from the server.' },
  inventoryFailed: { ar: 'تعذر تحديث المخزون.', ku: 'نوێکردنەوەی کۆگا سەرکەوتوو نەبوو.', en: 'Could not update inventory.' },
  retry: { ar: 'إعادة المحاولة', ku: 'دووبارە هەوڵدانەوە', en: 'Retry' },
  variantCount: { ar: 'متغير', ku: 'جۆراوجۆری', en: 'variants' },
};

export const PRODUCTS_PAGE_NUMBER_LOCALE = {
    ar: 'ar-IQ',
    ku: 'ckb-IQ',
    en: 'en-IQ',
  };
