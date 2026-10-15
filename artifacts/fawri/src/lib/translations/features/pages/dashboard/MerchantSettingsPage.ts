// Centralized localized copy extracted from pages/dashboard/MerchantSettingsPage.tsx.
// Keep runtime behavior in the source component; keep language copy here.

export const MERCHANT_SETTINGS_PAGE_UI_COPY = {
  ar: {
    preferencesTitle: 'تفضيلات الواجهة',
    preferencesDescription:
      'اللغة والمظهر تفضيلات محلية للواجهة فقط، وليستا جزءًا من إعدادات التوصيل أو الدفع أو الرد التلقائي على السيرفر.',
    language: 'لغة الواجهة',
    appearance: 'المظهر',
    light: 'فاتح',
    dark: 'داكن',
    auto: 'حسب النظام',
    authorityTitle: 'حدود نموذج الإعدادات',
    authorityDescription:
      'الإعدادات التشغيلية أدناه تأتي من السيرفر وتُحفظ على السيرفر فقط.',
    deliveryModel:
      'التوصيل يدعم أجرة موحدة أو أجرة مختلفة حسب المنطقة، وتبقى الأسعار والمناطق محفوظة ضمن سلطة السيرفر.',
    superQiModel:
      'SuperQi هنا يحدد طريقة دفع إلكترونية فقط. اسم الحساب وQR غير مدعومين بسلطة سيرفر آمنة حاليًا، لذلك لا يتم حفظهما محليًا ولا ضمن الإعدادات التشغيلية.',
  },
  ku: {
    preferencesTitle: 'هەڵبژاردەکانی ڕووکار',
    preferencesDescription:
      'زمان و دیمەن تەنها هەڵبژاردەی ناوخۆیی ڕووکارن و بەشێک نین لە ڕێکخستنەکانی گەیاندن، پارەدان یان وەڵامی خۆکاری سێرڤەر.',
    language: 'زمانی ڕووکار',
    appearance: 'دیمەن',
    light: 'ڕووناک',
    dark: 'تاریک',
    auto: 'بەپێی سیستەم',
    authorityTitle: 'سنووری مۆدێلی ڕێکخستنەکان',
    authorityDescription:
      'ڕێکخستنە کارپێکراوەکانی خوارەوە لە سێرڤەرەوە دێن و تەنها لە سێرڤەر پاشەکەوت دەکرێن.',
    deliveryModel:
      'گەیاندن یەک نرخ یان نرخی جیاواز بەپێی ناوچە پشتگیری دەکات و هەموو نرخەکان لە دەسەڵاتی سێرڤەر پاشەکەوت دەکرێن.',
    superQiModel:
      'SuperQi لێرە تەنها وەک شێوازی پارەدانی ئەلیکترۆنی هەڵدەبژێردرێت. ناوی هەژمار و QR دەسەڵاتی سێرڤەری پارێزراویان نییە، بۆیە ناوخۆ یان لە ڕێکخستنە کارپێکراوەکان پاشەکەوت ناکرێن.',
  },
  en: {
    preferencesTitle: 'Interface preferences',
    preferencesDescription:
      'Language and appearance are local UI preferences only. They are not part of the server delivery, payment, or automatic-reply settings.',
    language: 'Interface language',
    appearance: 'Appearance',
    light: 'Light',
    dark: 'Dark',
    auto: 'System',
    authorityTitle: 'Settings model limits',
    authorityDescription:
      'The operational settings below are loaded from the server and saved to the server only.',
    deliveryModel:
      'Delivery supports either one flat fee or different fees by area, with all pricing stored in the server authority.',
    superQiModel:
      'SuperQi here selects an electronic payment method only. Account-name and QR data do not have a secure server authority, so they are not stored locally or in operational settings.',
  },
};
