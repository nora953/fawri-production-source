import type { Lang } from '@/lib/types';

// Canonical merchant catalog-editor copy. Keep Arabic, Sorani Kurdish, and English
// semantically aligned here so UI fixes cannot drift between local component dictionaries.

export type CommerceCatalogPageCopy = {
  title: string;
  subtitle: string;
  add: string;
  import: string;
  search: string;
  all: string;
  products: string;
  services: string;
  product: string;
  service: string;
  noItems: string;
  noItemsHint: string;
  loading: string;
  retry: string;
  loadFailed: string;
  saveFailed: string;
  saved: string;
  updated: string;
  deleted: string;
  deleteConfirm: string;
  versionConflict: string;
  secureCrypto: string;
  invalidName: string;
  invalidPrice: string;
  invalidQuantity: string;
  invalidForm: string;
  name: string;
  namePlaceholder: string;
  category: string;
  categoryPlaceholder: string;
  basePrice: string;
  basePriceHint: string;
  priceExample: (value: string) => string;
  price: string;
  freePrice: string;
  customPrice: string;
  quantity: string;
  inventoryNotTracked: string;
  duration: string;
  booking: string;
  bookingRequired: string;
  bookingOptional: string;
  description: string;
  descriptionPlaceholder: string;
  descriptionMissing: string;
  details: string;
  detailsTitle: string;
  variants: string;
  fawri: string;
  fawriHint: string;
  inventory: string;
  inventorySet: string;
  inventorySaved: string;
  inventoryFailed: string;
  inventoryByLocation: string;
  defaultLocation: string;
  disabledLocation: string;
  inventoryLocationHint: string;
  inventoryLoading: string;
  inventoryRetry: string;
  inventoryDetails: string;
  hideInventoryDetails: string;
  variantDetails: string;
  hideVariantDetails: string;
  save: string;
  saving: string;
  edit: string;
  create: string;
  available: string;
  lowStock: string;
  inventoryOut: string;
  unavailable: string;
  draft: string;
  hidden: string;
  remaining: string;
  units: string;
  someVariantsOut: string;
  minute: string;
  sku: string;
  skuHint: string;
  availableForSale: string;
  availableForSaleHint: string;
};

export const COMMERCE_CATALOG_COPY: Record<Lang, CommerceCatalogPageCopy> = {
  ar: {
    title: 'المنتجات والخدمات',
    subtitle: 'أضف معلومات العنصر مرة واحدة، ويتولى فوري حساب حالة المخزون واستخدامها في الكاشير والردود.',
    add: 'إضافة منتج أو خدمة',
    import: 'استيراد المنتجات',
    search: 'ابحث بالاسم أو القسم أو SKU أو الباركود...',
    all: 'الكل',
    products: 'المنتجات',
    services: 'الخدمات',
    product: 'منتج',
    service: 'خدمة',
    noItems: 'لا توجد عناصر بعد',
    noItemsHint: 'أضف أول منتج أو خدمة ليبدأ فوري باستخدام بيانات الكتالوج الموثوقة.',
    loading: 'جارٍ تحميل الكتالوج...',
    retry: 'إعادة المحاولة',
    loadFailed: 'تعذر تحميل الكتالوج من الخادم.',
    saveFailed: 'تعذر حفظ العنصر.',
    saved: 'تمت إضافة العنصر.',
    updated: 'تم تحديث العنصر.',
    deleted: 'تم حذف العنصر.',
    deleteConfirm: 'هل تريد حذف هذا العنصر؟',
    versionConflict: 'تم تعديل هذا العنصر من مكان آخر. حمّلنا أحدث نسخة؛ راجعها ثم احفظ مجددًا.',
    secureCrypto: 'تعذر إنشاء رمز آمن للعملية.',
    invalidName: 'أدخل اسمًا صحيحًا.',
    invalidPrice: 'راجع سعر البيع.',
    invalidQuantity: 'راجع كمية المخزون.',
    invalidForm: 'راجع حقول العنصر قبل الحفظ.',
    name: 'الاسم',
    namePlaceholder: 'اسم المنتج أو الخدمة',
    category: 'القسم',
    categoryPlaceholder: 'مثال: إلكترونيات، عناية، خدمات منزلية',
    basePrice: 'سعر البيع',
    basePriceHint: '',
    priceExample: (value: string) => `مثال: ${value}`,
    price: 'السعر',
    freePrice: 'مجاني',
    customPrice: 'حسب الطلب',
    quantity: 'المخزون',
    inventoryNotTracked: 'غير متابع',
    duration: 'المدة',
    booking: 'الحجز',
    bookingRequired: 'مطلوب',
    bookingOptional: 'غير مطلوب',
    description: 'الوصف',
    descriptionPlaceholder: 'معلومات واضحة يمكن لفوري الاعتماد عليها عند الرد على العميل.',
    descriptionMissing: 'لا يوجد وصف مضاف لهذا العنصر.',
    details: 'التفاصيل',
    detailsTitle: 'تفاصيل المنتج',
    variants: 'الأنواع',
    fawri: 'استخدام هذا العنصر في ردود فوري',
    fawriHint: 'عند الإيقاف يبقى العنصر في الكتالوج والكاشير، لكن فوري لا يستخدم معلوماته في الردود الآلية.',
    inventory: 'إدارة المخزون',
    inventorySet: 'تعيين',
    inventorySaved: 'تم تحديث المخزون.',
    inventoryFailed: 'تعذر تحديث المخزون.',
    inventoryByLocation: 'المخزون حسب الموقع',
    defaultLocation: 'الموقع الافتراضي',
    disabledLocation: 'موقع معطّل',
    inventoryLocationHint: 'لكل موقع كمية مستقلة. الكمية الإجمالية أعلاه هي مجموع مخزون المواقع.',
    inventoryLoading: 'جارٍ تحميل مخزون المواقع...',
    inventoryRetry: 'إعادة تحميل المخزون',
    inventoryDetails: 'تفاصيل المخزون',
    hideInventoryDetails: 'إخفاء المخزون',
    variantDetails: 'تفاصيل الأنواع',
    hideVariantDetails: 'إخفاء الأنواع',
    save: 'حفظ',
    saving: 'جارٍ الحفظ...',
    edit: 'تعديل المنتج أو الخدمة',
    create: 'إضافة منتج أو خدمة',
    available: 'متوفر',
    lowStock: 'مخزون منخفض',
    inventoryOut: 'نفد المخزون',
    unavailable: 'غير متوفر',
    draft: 'مسودة',
    hidden: 'مخفي عن فوري',
    remaining: 'بقي',
    units: 'قطعة',
    someVariantsOut: 'بعض الأنواع نفدت',
    minute: 'دقيقة',
    sku: 'رمز العنصر (SKU)',
    skuHint: 'يولّد فوري رمزًا فريدًا تلقائيًا. يمكنك تغييره قبل الحفظ.',
    availableForSale: 'متاح للبيع',
    availableForSaleHint: 'يظهر هذا الخيار فقط عندما لا يعتمد توفر العنصر على كمية مخزون مسجلة.',
  },
  ku: {
    title: 'بەرهەم و خزمەتگوزارییەکان',
    subtitle: 'زانیاریی بابەتەکە جارێک زیاد بکە؛ فەوری دۆخی کۆگا خۆکار هەژمار دەکات و لە کاشێر و وەڵامەکان بەکاری دەهێنێت.',
    add: 'زیادکردنی بەرهەم یان خزمەتگوزاری',
    import: 'هاوردەکردنی بەرهەم',
    search: 'گەڕان بە ناو، بەش، SKU یان بارکۆد...',
    all: 'هەموو',
    products: 'بەرهەمەکان',
    services: 'خزمەتگوزارییەکان',
    product: 'بەرهەم',
    service: 'خزمەتگوزاری',
    noItems: 'هیچ بابەتێک نییە',
    noItemsHint: 'یەکەم بەرهەم یان خزمەتگوزاری زیاد بکە تا فەوری بتوانێت زانیارییە متمانەپێکراوەکانی کەتەلۆگ بەکاربهێنێت.',
    loading: 'کەتەلۆگ بار دەکرێت...',
    retry: 'دووبارە هەوڵدانەوە',
    loadFailed: 'بارکردنی کەتەلۆگ سەرکەوتوو نەبوو.',
    saveFailed: 'پاشەکەوتکردنی بابەت سەرکەوتوو نەبوو.',
    saved: 'بابەت زیادکرا.',
    updated: 'بابەت نوێکرایەوە.',
    deleted: 'بابەت سڕایەوە.',
    deleteConfirm: 'دەتەوێت ئەم بابەتە بسڕیتەوە؟',
    versionConflict: 'ئەم بابەتە لە شوێنێکی تر گۆڕدراوە. نوێترین وەشان بارکرا؛ پێداچوونەوەی بۆ بکە و دووبارە پاشەکەوتی بکە.',
    secureCrypto: 'دروستکردنی ناسنامەی پارێزراو سەرکەوتوو نەبوو.',
    invalidName: 'ناوێکی دروست بنووسە.',
    invalidPrice: 'نرخی فرۆشتن بپشکنە.',
    invalidQuantity: 'بڕی کۆگا بپشکنە.',
    invalidForm: 'خانەکان پێش پاشەکەوتکردن بپشکنە.',
    name: 'ناو',
    namePlaceholder: 'ناوی بەرهەم یان خزمەتگوزاری',
    category: 'بەش',
    categoryPlaceholder: 'نموونە: ئەلیکترۆنیات، چاودێری، خزمەتگوزاریی ماڵەوە',
    basePrice: 'نرخی فرۆشتن',
    basePriceHint: '',
    priceExample: (value: string) => `نموونە: ${value}`,
    price: 'نرخ',
    freePrice: 'بەخۆڕایی',
    customPrice: 'بەپێی داواکاری',
    quantity: 'کۆگا',
    inventoryNotTracked: 'بەدواداچوون ناکرێت',
    duration: 'ماوە',
    booking: 'کاتگرتن',
    bookingRequired: 'پێویستە',
    bookingOptional: 'پێویست نییە',
    description: 'وەسف',
    descriptionPlaceholder: 'زانیارییەکی ڕوون کە فەوری بتوانێت لە کاتی وەڵامدانەوە بە کڕیار پشتی پێ ببەستێت.',
    descriptionMissing: 'هیچ وەسفێک بۆ ئەم بابەتە زیاد نەکراوە.',
    details: 'وردەکاری',
    detailsTitle: 'وردەکاری بەرهەم',
    variants: 'جۆرەکان',
    fawri: 'بەکارهێنانی ئەم بابەتە لە وەڵامەکانی فەوری',
    fawriHint: 'کاتێک ناچالاکە، بابەتەکە لە کەتەلۆگ و کاشێر دەمێنێتەوە بەڵام فەوری لە وەڵامە ئۆتۆماتیکییەکان بەکاری ناهێنێت.',
    inventory: 'بەڕێوەبردنی کۆگا',
    inventorySet: 'دانان',
    inventorySaved: 'کۆگا نوێکرایەوە.',
    inventoryFailed: 'نوێکردنەوەی کۆگا سەرکەوتوو نەبوو.',
    inventoryByLocation: 'کۆگا بەپێی شوێن',
    defaultLocation: 'شوێنی بنەڕەتی',
    disabledLocation: 'شوێنی ناچالاک',
    inventoryLocationHint: 'هەر شوێنێک بڕی کۆگای سەربەخۆی هەیە. کۆی سەرەوە کۆی کۆگای هەموو شوێنەکانە.',
    inventoryLoading: 'کۆگای شوێنەکان بار دەکرێت...',
    inventoryRetry: 'دووبارە بارکردنەوەی کۆگا',
    inventoryDetails: 'وردەکاری کۆگا',
    hideInventoryDetails: 'شاردنەوەی کۆگا',
    variantDetails: 'وردەکاری جۆرەکان',
    hideVariantDetails: 'شاردنەوەی جۆرەکان',
    save: 'پاشەکەوتکردن',
    saving: 'پاشەکەوت دەکرێت...',
    edit: 'دەستکاری بەرهەم یان خزمەتگوزاری',
    create: 'زیادکردنی بەرهەم یان خزمەتگوزاری',
    available: 'بەردەست',
    lowStock: 'کۆگای کەم',
    inventoryOut: 'کۆگا تەواو بوو',
    unavailable: 'بەردەست نییە',
    draft: 'ڕەشنووس',
    hidden: 'لە فەوری شاردراوەتەوە',
    remaining: 'ماوە',
    units: 'دانە',
    someVariantsOut: 'هەندێک جۆر تەواو بوون',
    minute: 'خولەک',
    sku: 'کۆدی بابەت (SKU)',
    skuHint: 'فەوری کۆدێکی تاک خۆکار دروست دەکات. پێش پاشەکەوتکردن دەتوانیت بیگۆڕیت.',
    availableForSale: 'بۆ فرۆشتن بەردەستە',
    availableForSaleHint: 'تەنها کاتێک دەردەکەوێت کە بەردەستبوون بە بڕی کۆگای تۆمارکراو نەبەستراوە.',
  },
  en: {
    title: 'Products & Services',
    subtitle: 'Enter item details once; Fawri calculates inventory status automatically and uses it across cashier and replies.',
    add: 'Add product or service',
    import: 'Import products',
    search: 'Search by name, category, SKU, or barcode...',
    all: 'All',
    products: 'Products',
    services: 'Services',
    product: 'Product',
    service: 'Service',
    noItems: 'No catalog items yet',
    noItemsHint: 'Add your first product or service so Fawri can use trusted catalog facts.',
    loading: 'Loading catalog...',
    retry: 'Retry',
    loadFailed: 'Could not load the catalog from the server.',
    saveFailed: 'Could not save the item.',
    saved: 'Item added.',
    updated: 'Item updated.',
    deleted: 'Item deleted.',
    deleteConfirm: 'Delete this catalog item?',
    versionConflict: 'This item changed elsewhere. The latest server version was loaded; review it and save again.',
    secureCrypto: 'Could not create a secure operation identifier.',
    invalidName: 'Enter a valid name.',
    invalidPrice: 'Review the sale price.',
    invalidQuantity: 'Review inventory quantity.',
    invalidForm: 'Review the item fields before saving.',
    name: 'Name',
    namePlaceholder: 'Product or service name',
    category: 'Category',
    categoryPlaceholder: 'e.g. Electronics, Beauty, Home services',
    basePrice: 'Sale price',
    basePriceHint: '',
    priceExample: (value: string) => `e.g. ${value}`,
    price: 'Price',
    freePrice: 'Free',
    customPrice: 'On request',
    quantity: 'Inventory',
    inventoryNotTracked: 'Not tracked',
    duration: 'Duration',
    booking: 'Booking',
    bookingRequired: 'Required',
    bookingOptional: 'Not required',
    description: 'Description',
    descriptionPlaceholder: 'Clear information Fawri can rely on when answering customers.',
    descriptionMissing: 'No description has been added for this item.',
    details: 'Details',
    detailsTitle: 'Product details',
    variants: 'Variants',
    fawri: 'Use this item in Fawri replies',
    fawriHint: 'When disabled, the item stays in catalog and cashier, but Fawri will not use it in automated replies.',
    inventory: 'Inventory management',
    inventorySet: 'Set',
    inventorySaved: 'Inventory updated.',
    inventoryFailed: 'Could not update inventory.',
    inventoryByLocation: 'Inventory by location',
    defaultLocation: 'Default location',
    disabledLocation: 'Disabled location',
    inventoryLocationHint: 'Each location has independent stock. The total above is the combined inventory across locations.',
    inventoryLoading: 'Loading location inventory...',
    inventoryRetry: 'Reload inventory',
    inventoryDetails: 'Inventory details',
    hideInventoryDetails: 'Hide inventory',
    variantDetails: 'Variant details',
    hideVariantDetails: 'Hide variants',
    save: 'Save',
    saving: 'Saving...',
    edit: 'Edit product or service',
    create: 'Add product or service',
    available: 'Available',
    lowStock: 'Low stock',
    inventoryOut: 'Out of stock',
    unavailable: 'Unavailable',
    draft: 'Draft',
    hidden: 'Hidden from Fawri',
    remaining: 'left',
    units: 'units',
    someVariantsOut: 'Some variants are out',
    minute: 'min',
    sku: 'Item code (SKU)',
    skuHint: 'Fawri creates a unique code automatically. You can change it before saving.',
    availableForSale: 'Available for sale',
    availableForSaleHint: 'Shown only when availability is not driven by a tracked inventory quantity.',
  },
};

export const CATALOG_PRODUCT_DETAILS_COPY = {
  ar: {
    quantity: 'الكمية',
    inventoryAfterSave: 'مخزون الأنواع المحفوظة يُعدّل من أدوات المخزون بعد الحفظ حتى تبقى الحركة مسجلة.',
    baseData: 'بيانات المنتج',
    reportingCost: 'تكلفة المنتج',
    reportingCostHint: 'اختياري، للتقارير وحساب الربح فقط ولا يظهر للعميل.',
    sku: 'SKU',
    barcode: 'الباركود',
    multiProduct: 'منتج متعدد الخيارات',
    multiProductHint: 'فعّله إذا كان للمنتج نسخ مختلفة مثل اللون، السعة، الوزن، النكهة، المادة أو المقاس.',
    options: 'خيارات المنتج',
    optionsHint: 'أضف كل خاصية مرة واحدة واكتب قيمها في نفس السطر، ثم أنشئ الأنواع دفعة واحدة.',
    addOption: 'إضافة خيار',
    optionName: 'اسم الخيار',
    optionNamePlaceholder: 'مثال: اللون، السعة، النكهة',
    optionValues: 'القيم',
    optionValuesPlaceholder: 'مثال: أسود، أبيض أو 128GB، 256GB',
    valuesHint: 'افصل القيم بفاصلة عربية أو إنجليزية.',
    generate: 'إنشاء / تحديث الأنواع',
    combinations: 'أنواع المنتج',
    combination: 'النوع',
    variantWithinGroup: 'باقي الخيارات',
    salePrice: 'سعر بيع خاص — اختياري',
    cost: 'تكلفة خاصة — اختياري',
    stock: 'المخزون',
    images: 'صورة النوع — اختياري',
    actions: 'الإجراء',
    inheritedSale: (value: string) => `الافتراضي: ${value || 'سعر المنتج'}`,
    inheritedCost: (value: string) => `الافتراضي: ${value || 'تكلفة المنتج'}`,
    inheritedImage: 'بدون صورة خاصة = يستخدم صور المنتج',
    inheritanceTitle: 'القيم الافتراضية تُطبّق تلقائيًا',
    inheritanceHint: (price: string, cost: string) => `سعر البيع ${price || '—'} والتكلفة ${cost || '—'} وصور المنتج هي القيم الافتراضية لكل الأنواع. أدخل فقط القيم المختلفة عند الحاجة.`,
    bulkStock: 'كمية لكل نوع',
    applyStock: 'تطبيق على الكل',
    generateSku: 'توليد SKU للأنواع',
    noVariants: 'أضف خيارًا مثل اللون أو السعة أو النكهة أو المقاس، ثم اكتب كل القيم في سطر واحد.',
    invalidOptions: 'أدخل اسمًا وقيمة واحدة على الأقل لكل خيار، ولا تكرر أسماء الخيارات.',
    tooMany: 'عدد الأنواع أكبر من 100. قلل عدد القيم.',
    existingVariants: 'هذا المنتج يحتوي أنواعًا محفوظة. لا يمكن إيقاف تعدد الخيارات قبل إزالة الأنواع أو تعديلها.',
    legacy: 'هذا المنتج يحتوي أنواعًا قديمة بلا خيارات منظمة. أبقيناها في الجدول حتى لا نفقد أي بيانات.',
    name: 'الاسم',
    advanced: 'الشحن والقياسات الفيزيائية',
    advancedHint: 'اختياري. هذه بيانات وزن وأبعاد الشحن فقط، وليست خيارات المنتج.',
    weight: 'الوزن (كغم)',
    length: 'الطول (سم)',
    width: 'العرض (سم)',
    height: 'الارتفاع (سم)',
    currentInventoryLocked: 'بعد الحفظ',
    groupCount: (count: number) => {
      if (count === 1) return 'نوع واحد';
      if (count === 2) return 'نوعان';
      return `${count} أنواع`;
    },
    groupSale: 'سعر بيع لكل هذه المجموعة',
    groupCost: 'كلفة لكل هذه المجموعة',
    groupStock: 'مخزون لكل نوع في المجموعة',
    groupImages: 'صور هذه المجموعة',
    groupImagesHint: 'الصورة التي تضيفها هنا تطبق على كل الأنواع داخل هذه المجموعة. تستطيع تغيير صورة نوع واحد من صفه.',
    applyGroup: 'تطبيق',
    clearOverrideHint: 'اتركه فارغًا واضغط تطبيق للرجوع إلى القيمة الافتراضية.',
    copyGroup: 'نسخ بيانات المجموعة',
    copyTo: 'اختر المجموعة الهدف',
    copyAction: 'نسخ',
    copyHint: 'ينسخ السعر والكلفة والصور والمخزون للأنواع المناظرة فقط. لا ينسخ SKU أو الباركود.',
    mixedGroupImages: 'بعض الأنواع داخل هذه المجموعة لها صور مختلفة. إضافة صور هنا ستوحّد صور المجموعة.',
    excludeCombination: 'استبعاد النوع',
    excludedTitle: 'أنواع مستبعدة',
    excludedHint: 'هذه الأنواع لن تُنشأ حتى لو حدّثت الأنواع مرة أخرى. يمكنك استعادتها قبل الحفظ.',
    restoreCombination: 'استعادة',
    savedVariantProtected: 'هذا نوع محفوظ. لا نحذفه من محرر الإنشاء حتى لا نفقد سجل المخزون.',
  },
  ku: {
    quantity: 'بڕ',
    inventoryAfterSave: 'کۆگای جۆرە پاشەکەوتکراوەکان دوای پاشەکەوتکردن لە ئامرازەکانی کۆگا بگۆڕە تا هەموو جووڵەکانی کۆگا تۆمارکراو بمێننەوە.',
    baseData: 'داتای بەرهەم',
    reportingCost: 'تێچووی بەرهەم',
    reportingCostHint: 'ئارەزوومەندانە، تەنها بۆ ڕاپۆرت و قازانجە و بە کڕیار پیشان نادرێت.',
    sku: 'SKU',
    barcode: 'بارکۆد',
    multiProduct: 'بەرهەمی چەند هەڵبژاردەیی',
    multiProductHint: 'ئەگەر بەرهەمەکە جۆری جیاوازی هەیە وەک ڕەنگ، گنجایش، کێش، تام، ماددە یان قەبارە، چالاکی بکە.',
    options: 'هەڵبژاردەکانی بەرهەم',
    optionsHint: 'هەر تایبەتمەندییەک جارێک زیاد بکە و هەموو بەهاکانی لە هەمان ڕیز بنووسە، پاشان جۆرەکان یەکجار دروست بکە.',
    addOption: 'زیادکردنی هەڵبژاردە',
    optionName: 'ناوی هەڵبژاردە',
    optionNamePlaceholder: 'نموونە: ڕەنگ، قەبارە، تام',
    optionValues: 'بەهاکان',
    optionValuesPlaceholder: 'نموونە: ڕەش، سپی یان 128GB، 256GB',
    valuesHint: 'بەهاکان بە کۆمای عەرەبی یان ئینگلیزی جیا بکەوە.',
    generate: 'دروستکردن / نوێکردنەوەی جۆرەکان',
    combinations: 'جۆرەکانی بەرهەم',
    combination: 'جۆر',
    variantWithinGroup: 'هەڵبژاردەکانی تر',
    salePrice: 'نرخی فرۆشتنی تایبەت — ئارەزوومەندانە',
    cost: 'تێچووی تایبەت — ئارەزوومەندانە',
    stock: 'کۆگا',
    images: 'وێنەی جۆر — ئارەزوومەندانە',
    actions: 'کردار',
    inheritedSale: (value: string) => `بنەڕەتی: ${value || 'نرخی بەرهەم'}`,
    inheritedCost: (value: string) => `بنەڕەتی: ${value || 'تێچووی بەرهەم'}`,
    inheritedImage: 'بێ وێنەی تایبەت = وێنەکانی بەرهەم',
    inheritanceTitle: 'بەها بنەڕەتییەکان خۆکار جێبەجێ دەبن',
    inheritanceHint: (price: string, cost: string) => `نرخی فرۆشتن ${price || '—'} و تێچوو ${cost || '—'} و وێنەکانی بەرهەم بەها بنەڕەتییەکانی هەموو جۆرەکانن. تەنها بەها جیاوازەکان بنووسە.`,
    bulkStock: 'بڕ بۆ هەر جۆر',
    applyStock: 'جێبەجێکردن بۆ هەموو',
    generateSku: 'دروستکردنی SKU بۆ جۆرەکان',
    noVariants: 'هەڵبژاردەیەک وەک ڕەنگ، قەبارە یان تام زیاد بکە و هەموو بەهاکان لە یەک ڕیز بنووسە.',
    invalidOptions: 'بۆ هەر هەڵبژاردە ناو و لانیکەم یەک بەها بنووسە و ناوەکان دووبارە مەکە.',
    tooMany: 'ژمارەی جۆرەکان لە 100 زیاترە. ژمارەی بەهاکان کەم بکەرەوە.',
    existingVariants: 'ئەم بەرهەمە جۆری پاشەکەوتکراوی هەیە. تا جۆرەکان لابنرێن یان دەستکاری بکرێن ناتوانیت دۆخی چەند هەڵبژاردەیی ناچالاک بکەیت.',
    legacy: 'ئەم بەرهەمە جۆرە کۆنی هەیە کە هەڵبژاردەکانیان بە شێوەی ڕێکخراو تۆمار نەکراون. بۆ ئەوەی هیچ داتایەک لەدەست نەچێت لە خشتەکەدا ماونەتەوە.',
    name: 'ناو',
    advanced: 'گەیاندن و پێوانە فیزیکییەکان',
    advancedHint: 'ئارەزوومەندانە. ئەمانە تەنها کێش و قەبارەی گەیاندنن، نە هەڵبژاردەکانی بەرهەم.',
    weight: 'کێش (کگم)',
    length: 'درێژی (سم)',
    width: 'پانی (سم)',
    height: 'بەرزی (سم)',
    currentInventoryLocked: 'دوای پاشەکەوتکردن',
    groupCount: (count: number) => `${count} جۆر`,
    groupSale: 'نرخی فرۆشتن بۆ ئەم گرووپە',
    groupCost: 'تێچوو بۆ ئەم گرووپە',
    groupStock: 'کۆگا بۆ هەر جۆری گرووپەکە',
    groupImages: 'وێنەکانی ئەم گرووپە',
    groupImagesHint: 'وێنەکانی لێرە بۆ هەموو جۆرەکانی گرووپەکە جێبەجێ دەبن. دەتوانیت وێنەی یەک جۆر لە ڕیزەکەی بگۆڕیت.',
    applyGroup: 'جێبەجێکردن',
    clearOverrideHint: 'بە بەتاڵی بهێڵەوە و جێبەجێکردن هەڵبژێرە بۆ گەڕانەوە بۆ بەهای بنەڕەتی.',
    copyGroup: 'کۆپیکردنی داتای گرووپ',
    copyTo: 'گرووپی ئامانج هەڵبژێرە',
    copyAction: 'کۆپی',
    copyHint: 'نرخ و تێچوو و وێنە و کۆگا بۆ جۆر هاوشێوەکان کۆپی دەکات. SKU و بارکۆد کۆپی ناکات.',
    mixedGroupImages: 'هەندێک جۆری ئەم گرووپە وێنەی جیاواز هەیە. زیادکردنی وێنە لێرە وێنەکانی گرووپەکە یەکسان دەکات.',
    excludeCombination: 'دەرخستنی جۆر',
    excludedTitle: 'جۆرە دەرخراوەکان',
    excludedHint: 'ئەم جۆرە دەرخراوانە کاتێک جۆرەکان دووبارە دروست دەکەیت ناگەڕێنەوە. پێش پاشەکەوتکردن دەتوانیت بیانگەڕێنیتەوە.',
    restoreCombination: 'گەڕاندنەوە',
    savedVariantProtected: 'ئەم جۆریە پاشەکەوتکراوە و لێرە ناسڕدرێتەوە بۆ پاراستنی مێژووی کۆگا.',
  },
  en: {
    quantity: 'Quantity',
    inventoryAfterSave: 'Saved variant inventory is adjusted from inventory tools after save so every movement stays auditable.',
    baseData: 'Product data',
    reportingCost: 'Product cost',
    reportingCostHint: 'Optional, merchant-only reporting cost used for profit calculations.',
    sku: 'SKU',
    barcode: 'Barcode',
    multiProduct: 'Multi-option product',
    multiProductHint: 'Enable when the product has sellable versions such as color, capacity, weight, flavor, material, or size.',
    options: 'Product options',
    optionsHint: 'Add each attribute once, enter all its values on the same row, then generate every variant in one step.',
    addOption: 'Add option',
    optionName: 'Option name',
    optionNamePlaceholder: 'e.g. Color, Capacity, Flavor',
    optionValues: 'Values',
    optionValuesPlaceholder: 'e.g. Black, White or 128GB, 256GB',
    valuesHint: 'Separate values with commas.',
    generate: 'Generate / update variants',
    combinations: 'Product variants',
    combination: 'Variant',
    variantWithinGroup: 'Other options',
    salePrice: 'Special sale price — optional',
    cost: 'Special cost — optional',
    stock: 'Stock',
    images: 'Variant image — optional',
    actions: 'Action',
    inheritedSale: (value: string) => `Default: ${value || 'product price'}`,
    inheritedCost: (value: string) => `Default: ${value || 'product cost'}`,
    inheritedImage: 'No special image = use product images',
    inheritanceTitle: 'Default values apply automatically',
    inheritanceHint: (price: string, cost: string) => `Sale price ${price || '—'}, cost ${cost || '—'}, and product images are the default values for every variant. Enter only values that are different.`,
    bulkStock: 'Stock per variant',
    applyStock: 'Apply to all',
    generateSku: 'Generate variant SKUs',
    noVariants: 'Add an option such as color, capacity, flavor, or size, then enter all values on one row.',
    invalidOptions: 'Give every option a name and at least one value, with no duplicate option names.',
    tooMany: 'More than 100 variants. Reduce the number of values.',
    existingVariants: 'This product already has saved variants. Multi-option mode cannot be disabled until those variants are removed or changed.',
    legacy: 'This product contains legacy variants without structured options. They remain editable in the table to avoid data loss.',
    name: 'Name',
    advanced: 'Shipping & physical measurements',
    advancedHint: 'Optional. These are only shipping weight and dimensions, not product options.',
    weight: 'Weight (kg)',
    length: 'Length (cm)',
    width: 'Width (cm)',
    height: 'Height (cm)',
    currentInventoryLocked: 'after save',
    groupCount: (count: number) => `${count} variants`,
    groupSale: 'Sale price for this group',
    groupCost: 'Cost for this group',
    groupStock: 'Stock for each variant in group',
    groupImages: 'Images for this group',
    groupImagesHint: 'Images added here apply to every variant in this group. You can override one variant from its row.',
    applyGroup: 'Apply',
    clearOverrideHint: 'Leave blank and apply to return to the default value.',
    copyGroup: 'Copy group data',
    copyTo: 'Choose target group',
    copyAction: 'Copy',
    copyHint: 'Copies price, cost, images, and stock to matching variants only. SKU and barcode are never copied.',
    mixedGroupImages: 'Some variants in this group have different images. Adding images here will unify the group images.',
    excludeCombination: 'Exclude variant',
    excludedTitle: 'Excluded variants',
    excludedHint: 'These variants stay excluded when you regenerate. You can restore them before saving.',
    restoreCombination: 'Restore',
    savedVariantProtected: 'This is a saved variant. It is protected here so inventory history is not discarded.',
  },
} as const;

export type CatalogProductDetailsCopy = (typeof CATALOG_PRODUCT_DETAILS_COPY)[keyof typeof CATALOG_PRODUCT_DETAILS_COPY];

export type CatalogItemTypeCopy = {
  chooseType: string;
  chooseTypeHint: string;
  product: string;
  productHint: string;
  service: string;
  serviceHint: string;
  itemSettings: string;
  itemSettingsHint: string;
  trackInventory: string;
  trackInventoryHint: string;
  fawriReplies: string;
  fawriRepliesHint: string;
  serviceDetails: string;
  serviceDetailsHint: string;
  duration: string;
  durationHint: string;
  buffer: string;
  bufferHint: string;
  bookingRequired: string;
  bookingRequiredHint: string;
  priceType: string;
  priceFixed: string;
  priceFrom: string;
  priceFree: string;
  priceCustom: string;
  location: string;
  locationMerchant: string;
  locationCustomer: string;
  locationOnline: string;
  locationFlexible: string;
  locationFlexibleHint: string;
};

export const CATALOG_ITEM_TYPE_COPY: Record<Lang, CatalogItemTypeCopy> = {
  ar: {
    chooseType: 'نوع العنصر',
    chooseTypeHint: 'اختر منتجًا يباع أو خدمة يقدمها نشاطك. يمكنك التبديل قبل الحفظ من دون فقدان البيانات التي أدخلتها.',
    product: 'منتج',
    productHint: 'سلعة قابلة للبيع يمكن تتبع مخزونها وباركودها وخياراتها.',
    service: 'خدمة',
    serviceHint: 'خدمة يمكن لفوري شرحها والمساعدة في طلبها أو حجزها.',
    itemSettings: 'إعدادات العنصر',
    itemSettingsHint: 'إعدادات تشغيل مختصرة لهذا العنصر.',
    trackInventory: 'تتبع المخزون',
    trackInventoryHint: 'حدّث الكمية تلقائيًا مع المبيعات ونبّه عند انخفاض المخزون أو نفاده.',
    fawriReplies: 'استخدامه في ردود فوري',
    fawriRepliesHint: 'اسمح لفوري باستخدام معلومات هذا العنصر عند الرد على العملاء.',
    serviceDetails: 'تفاصيل الخدمة',
    serviceDetailsHint: 'هذه المعلومات تساعد فوري على إعطاء العميل تفاصيل دقيقة عن الخدمة.',
    duration: 'مدة الخدمة بالدقائق',
    durationHint: 'اختياري، من دقيقة واحدة إلى 24 ساعة.',
    buffer: 'وقت فاصل بعد الخدمة (دقيقة)',
    bufferHint: 'اختياري، ويستخدم لاحقًا عند إدارة الحجوزات.',
    bookingRequired: 'تحتاج إلى حجز',
    bookingRequiredHint: 'فعّله إذا كان العميل يحتاج إلى طلب موعد أو حجز الخدمة مسبقًا.',
    priceType: 'طريقة عرض السعر',
    priceFixed: 'سعر ثابت',
    priceFrom: 'يبدأ من',
    priceFree: 'مجاني',
    priceCustom: 'حسب الطلب',
    location: 'مكان تقديم الخدمة',
    locationMerchant: 'في موقع التاجر',
    locationCustomer: 'عند العميل',
    locationOnline: 'أونلاين',
    locationFlexible: 'أكثر من مكان لتقديم الخدمة',
    locationFlexibleHint: 'اختر مكانين على الأقل من الأماكن التي يمكن تقديم هذه الخدمة فيها.',
  },
  ku: {
    chooseType: 'جۆری بابەت',
    chooseTypeHint: 'بەرهەمێک کە دەیفرۆشیت یان خزمەتگوزارییەک کە کاروبارەکەت پێشکەشی دەکات هەڵبژێرە. پێش پاشەکەوتکردن دەتوانیت بگۆڕیت بەبێ لەدەستدانی داتای نووسراو.',
    product: 'بەرهەم',
    productHint: 'کاڵایەکی فرۆشراو کە دەتوانرێت کۆگا، بارکۆد و هەڵبژاردەکانی بەدواداچوون بکرێن.',
    service: 'خزمەتگوزاری',
    serviceHint: 'خزمەتگوزارییەک کە فەوری دەتوانێت ڕوونی بکاتەوە و بۆ داواکاری یان کاتگرتن یارمەتی بدات.',
    itemSettings: 'ڕێکخستنەکانی بابەت',
    itemSettingsHint: 'ڕێکخستنە کورتییەکانی کارپێکردنی ئەم بابەتە.',
    trackInventory: 'بەدواداچوونی کۆگا',
    trackInventoryHint: 'بڕ لەگەڵ فرۆشتن خۆکار نوێ بکەرەوە و لە کەمبوون یان تەواوبوونی کۆگا ئاگادار بە.',
    fawriReplies: 'بەکارهێنان لە وەڵامەکانی فەوری',
    fawriRepliesHint: 'ڕێگە بدە فەوری زانیارییەکانی ئەم بابەتە لە وەڵامەکاندا بەکاربهێنێت.',
    serviceDetails: 'وردەکاریی خزمەتگوزاری',
    serviceDetailsHint: 'ئەم زانیارییانە یارمەتی فەوری دەدەن پرسیارەکانی خزمەتگوزاری بە وردی وەڵام بداتەوە.',
    duration: 'ماوەی خزمەتگوزاری بە خولەک',
    durationHint: 'ئارەزوومەندانە، لە 1 خولەک تا 24 کاتژمێر.',
    buffer: 'ماوەی نێوان دوای خزمەتگوزاری (خولەک)',
    bufferHint: 'ئارەزوومەندانە، دواتر لە بەڕێوەبردنی کاتگرتنەکان بەکاردێت.',
    bookingRequired: 'پێویستی بە کاتگرتن هەیە',
    bookingRequiredHint: 'ئەگەر کڕیار پێویستی بە داواکردنی کات یان کاتگرتنی خزمەتگوزاری پێشتر هەیە، چالاکی بکە.',
    priceType: 'شێوازی نیشاندانی نرخ',
    priceFixed: 'نرخی جێگیر',
    priceFrom: 'دەستپێدەکات لە',
    priceFree: 'بەخۆڕایی',
    priceCustom: 'بەپێی داواکاری',
    location: 'شوێنی خزمەتگوزاری',
    locationMerchant: 'لە شوێنی بازرگان',
    locationCustomer: 'لە شوێنی کڕیار',
    locationOnline: 'ئۆنلاین',
    locationFlexible: 'نەرم / چەند هەڵبژاردە',
    locationFlexibleHint: 'لانیکەم دوو شوێن هەڵبژێرە کە خزمەتگوزارییەکە لێیان پێشکەش دەکرێت.',
  },
  en: {
    chooseType: 'Item type',
    chooseTypeHint: 'Choose a product you sell or a service your business provides. You can switch before saving without losing the data you already entered.',
    product: 'Product',
    productHint: 'A sellable item whose inventory, barcode, and product options can be tracked.',
    service: 'Service',
    serviceHint: 'A service Fawri can explain and help customers request or book.',
    itemSettings: 'Item settings',
    itemSettingsHint: 'Compact operating settings for this item.',
    trackInventory: 'Track inventory',
    trackInventoryHint: 'Update quantity automatically with sales and warn when stock is low or runs out.',
    fawriReplies: 'Use in Fawri replies',
    fawriRepliesHint: 'Allow Fawri to use this item information when answering customers.',
    serviceDetails: 'Service details',
    serviceDetailsHint: 'These facts help Fawri answer service questions accurately.',
    duration: 'Service duration (minutes)',
    durationHint: 'Optional, from 1 minute up to 24 hours.',
    buffer: 'Buffer after service (minutes)',
    bufferHint: 'Optional and ready for future booking availability.',
    bookingRequired: 'Booking required',
    bookingRequiredHint: 'Enable when customers should request an appointment or booking first.',
    priceType: 'Price display',
    priceFixed: 'Fixed price',
    priceFrom: 'Starts from',
    priceFree: 'Free',
    priceCustom: 'Custom / on request',
    location: 'Service location',
    locationMerchant: 'Merchant location',
    locationCustomer: 'Customer location',
    locationOnline: 'Online',
    locationFlexible: 'Flexible / multiple options',
    locationFlexibleHint: 'Choose at least two locations where this service can be provided.',
  },
};

export const CATALOG_EDITOR_SHELL_COPY = {
  ar: {
    cancel: 'إلغاء',
    unsaved: 'تغييرات غير محفوظة',
    discardTitle: 'لديك تغييرات غير محفوظة',
    discard: 'إذا خرجت الآن ستفقد التغييرات التي لم تُحفظ. هل تريد المتابعة؟',
    keepEditing: 'متابعة التعديل',
    discardAction: 'الخروج بدون حفظ',
  },
  ku: {
    cancel: 'هەڵوەشاندنەوە',
    unsaved: 'گۆڕانکاری پاشەکەوت نەکراوە',
    discardTitle: 'گۆڕانکاری پاشەکەوت نەکراوت هەیە',
    discard: 'ئەگەر ئێستا بچیتە دەرەوە، گۆڕانکارییە پاشەکەوت نەکراوەکان لەدەست دەدەیت. دەتەوێت بەردەوام بیت؟',
    keepEditing: 'بەردەوامبوون لە دەستکاری',
    discardAction: 'چوونەدەرەوە بەبێ پاشەکەوتکردن',
  },
  en: {
    cancel: 'Cancel',
    unsaved: 'Unsaved changes',
    discardTitle: 'You have unsaved changes',
    discard: 'If you leave now, changes that were not saved will be lost. Do you want to continue?',
    keepEditing: 'Keep editing',
    discardAction: 'Leave without saving',
  },
} as const;

export const CATALOG_IMAGE_UPLOAD_COPY = {
  ar: {
    title: 'الصور',
    help: 'أضف الصور دفعة واحدة. اضغط على أي صورة لتكبيرها.',
    upload: 'إضافة صور',
    uploading: 'جارٍ الرفع...',
    drop: 'اسحب الصور هنا أو اضغط للاختيار',
    formats: 'JPG / PNG / WebP — حتى 8 MB',
    primary: 'رئيسية',
    makePrimary: 'تعيين كرئيسية',
    alt: 'وصف الصورة',
    remove: 'إزالة',
    viewImages: 'عرض الصور',
    limit: 'تم الوصول إلى الحد الأقصى لعدد الصور.',
    failed: 'تعذر رفع الصورة.',
    previewFailed: 'تعذر عرض الصورة',
    close: 'إغلاق',
  },
  ku: {
    title: 'وێنەکان',
    help: 'وێنەکان بە یەکجار زیاد بکە. بۆ گەورەکردن کلیک لە وێنە بکە.',
    upload: 'زیادکردنی وێنەکان',
    uploading: 'باردەکرێت...',
    drop: 'وێنەکان لێرە دابنێ یان کلیک بکە',
    formats: 'JPG / PNG / WebP — تا 8 MB',
    primary: 'سەرەکی',
    makePrimary: 'بیکە بە سەرەکی',
    alt: 'وەسفی وێنە',
    remove: 'لابردن',
    viewImages: 'بینینی وێنەکان',
    limit: 'گەیشتیتە سنووری ژمارەی وێنەکان.',
    failed: 'بارکردنی وێنە سەرکەوتوو نەبوو.',
    previewFailed: 'وێنە پیشان نەدرا',
    close: 'داخستن',
  },
  en: {
    title: 'Images',
    help: 'Add images in one batch. Click any thumbnail to enlarge it.',
    upload: 'Add images',
    uploading: 'Uploading...',
    drop: 'Drop images here or click to choose',
    formats: 'JPG / PNG / WebP — up to 8 MB',
    primary: 'Primary',
    makePrimary: 'Make primary',
    alt: 'Image description',
    remove: 'Remove',
    viewImages: 'View images',
    limit: 'Maximum image count reached.',
    failed: 'Could not upload image.',
    previewFailed: 'Could not display image',
    close: 'Close',
  },
} as const;
