import type { Lang } from '@/lib/types';

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
  salePrice: string;
  originalPrice: string;
  price: string;
  currency: string;
  freePrice: string;
  customPrice: string;
  quantity: string;
  inventoryNotTracked: string;
  duration: string;
  booking: string;
  bookingRequired: string;
  bookingOptional: string;
  status: string;
  description: string;
  descriptionPlaceholder: string;
  fawri: string;
  fawriHint: string;
  images: string;
  inventory: string;
  inventorySet: string;
  inventorySaved: string;
  inventoryFailed: string;
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
  unavailable: string;
  draft: string;
  hidden: string;
  minute: string;
};

export const COMMERCE_CATALOG_PAGE_COPY: Record<Lang, CommerceCatalogPageCopy> = {
  ar: {
    title: 'المنتجات والخدمات',
    subtitle: 'مصدر فوري الموحد لبيانات المنتجات والخدمات والمخزون التي يعتمد عليها عند الرد على العملاء.',
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
    secureCrypto: 'تعذر إنشاء مفتاح أمان للعملية.',
    invalidName: 'أدخل اسمًا صحيحًا.',
    invalidPrice: 'راجع السعر الحالي والسعر السابق.',
    invalidQuantity: 'راجع كمية المخزون.',
    invalidForm: 'راجع حقول العنصر قبل الحفظ.',
    name: 'الاسم',
    namePlaceholder: 'اسم المنتج أو الخدمة',
    category: 'القسم',
    categoryPlaceholder: 'مثال: إلكترونيات، عناية، خدمات منزلية',
    salePrice: 'السعر',
    originalPrice: 'السعر السابق / للمقارنة',
    price: 'السعر',
    currency: 'د.ع',
    freePrice: 'مجاني',
    customPrice: 'حسب الطلب',
    quantity: 'المخزون',
    inventoryNotTracked: 'غير متابع',
    duration: 'المدة',
    booking: 'الحجز',
    bookingRequired: 'مطلوب',
    bookingOptional: 'غير مطلوب',
    status: 'الحالة',
    description: 'الوصف',
    descriptionPlaceholder: 'معلومات واضحة يمكن لفوري الاعتماد عليها عند الرد على العميل.',
    fawri: 'السماح لفوري باستخدام هذا العنصر',
    fawriHint: 'عند الإيقاف لن يستخدم فوري هذا المنتج أو الخدمة في الردود الآلية.',
    images: 'الصور',
    inventory: 'إدارة المخزون',
    inventorySet: 'تعيين',
    inventorySaved: 'تم تحديث المخزون.',
    inventoryFailed: 'تعذر تحديث المخزون.',
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
    unavailable: 'غير متوفر',
    draft: 'مسودة',
    hidden: 'مخفي عن فوري',
    minute: 'دقيقة',
  },
  ku: {
    title: 'بەرهەم و خزمەتگوزارییەکان',
    subtitle: 'سەرچاوەی یەکگرتووی فەوری بۆ زانیاریی بەرهەم و خزمەتگوزاری و کۆگا کە لە وەڵامدانەوە بە کڕیار پشت پێ دەبەستێت.',
    add: 'زیادکردنی بەرهەم یان خزمەتگوزاری',
    import: 'هاوردەکردنی بەرهەم',
    search: 'گەڕان بە ناو، بەش، SKU یان بارکۆد...',
    all: 'هەموو',
    products: 'بەرهەمەکان',
    services: 'خزمەتگوزارییەکان',
    product: 'بەرهەم',
    service: 'خزمەتگوزاری',
    noItems: 'هیچ بابەتێک نییە',
    noItemsHint: 'یەکەم بەرهەم یان خزمەتگوزاری زیاد بکە.',
    loading: 'کەتەلۆگ بار دەکرێت...',
    retry: 'دووبارە هەوڵدانەوە',
    loadFailed: 'بارکردنی کەتەلۆگ سەرکەوتوو نەبوو.',
    saveFailed: 'پاشەکەوتکردنی بابەت سەرکەوتوو نەبوو.',
    saved: 'بابەت زیادکرا.',
    updated: 'بابەت نوێکرایەوە.',
    deleted: 'بابەت سڕایەوە.',
    deleteConfirm: 'دەتەوێت ئەم بابەتە بسڕیتەوە؟',
    versionConflict: 'ئەم بابەتە لە شوێنێکی تر گۆڕدراوە. نوێترین وەشان بارکرا.',
    secureCrypto: 'دروستکردنی کلیلی پاراستن سەرکەوتوو نەبوو.',
    invalidName: 'ناوێکی دروست بنووسە.',
    invalidPrice: 'نرخەکان بپشکنە.',
    invalidQuantity: 'بڕی کۆگا بپشکنە.',
    invalidForm: 'خانەکان پێش پاشەکەوتکردن بپشکنە.',
    name: 'ناو',
    namePlaceholder: 'ناوی بەرهەم یان خزمەتگوزاری',
    category: 'بەش',
    categoryPlaceholder: 'نموونە: ئەلیکترۆنیات، خزمەتگوزاری',
    salePrice: 'نرخ',
    originalPrice: 'نرخی پێشوو / بەراورد',
    price: 'نرخ',
    currency: 'د.ع',
    freePrice: 'بەخۆڕایی',
    customPrice: 'بەپێی داواکاری',
    quantity: 'کۆگا',
    inventoryNotTracked: 'بەدواداچوون ناکرێت',
    duration: 'ماوە',
    booking: 'حجز',
    bookingRequired: 'پێویستە',
    bookingOptional: 'پێویست نییە',
    status: 'دۆخ',
    description: 'وەسف',
    descriptionPlaceholder: 'زانیارییەکی ڕوون کە فەوری بتوانێت پشتی پێ ببەستێت.',
    fawri: 'ڕێگە بدە فەوری ئەم بابەتە بەکاربهێنێت',
    fawriHint: 'کاتێک ناچالاکە فەوری لە وەڵامە ئۆتۆماتیکییەکان بەکاری ناهێنێت.',
    images: 'وێنەکان',
    inventory: 'بەڕێوەبردنی کۆگا',
    inventorySet: 'دانان',
    inventorySaved: 'کۆگا نوێکرایەوە.',
    inventoryFailed: 'نوێکردنەوەی کۆگا سەرکەوتوو نەبوو.',
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
    unavailable: 'بەردەست نییە',
    draft: 'ڕەشنووس',
    hidden: 'لە فەوری شاردراوەتەوە',
    minute: 'خولەک',
  },
  en: {
    title: 'Products & Services',
    subtitle: 'Fawri’s canonical source for trusted product, service, and inventory facts used in customer replies.',
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
    secureCrypto: 'Could not create a secure request key.',
    invalidName: 'Enter a valid name.',
    invalidPrice: 'Review current and comparison prices.',
    invalidQuantity: 'Review inventory quantity.',
    invalidForm: 'Review the item fields before saving.',
    name: 'Name',
    namePlaceholder: 'Product or service name',
    category: 'Category',
    categoryPlaceholder: 'e.g. Electronics, Beauty, Home services',
    salePrice: 'Price',
    originalPrice: 'Previous / compare price',
    price: 'Price',
    currency: 'IQD',
    freePrice: 'Free',
    customPrice: 'On request',
    quantity: 'Inventory',
    inventoryNotTracked: 'Not tracked',
    duration: 'Duration',
    booking: 'Booking',
    bookingRequired: 'Required',
    bookingOptional: 'Not required',
    status: 'Status',
    description: 'Description',
    descriptionPlaceholder: 'Clear information Fawri can rely on when answering customers.',
    fawri: 'Allow Fawri to use this item',
    fawriHint: 'When disabled, Fawri will not use this product or service in automated replies.',
    images: 'Images',
    inventory: 'Inventory management',
    inventorySet: 'Set',
    inventorySaved: 'Inventory updated.',
    inventoryFailed: 'Could not update inventory.',
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
    unavailable: 'Unavailable',
    draft: 'Draft',
    hidden: 'Hidden from Fawri',
    minute: 'min',
  },
};
