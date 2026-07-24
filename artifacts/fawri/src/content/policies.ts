export type PolicyLanguage = 'en' | 'ar' | 'ku';

export type PolicyText = {
  privacy: readonly string[];
  terms: readonly string[];
};

export const policyText: Record<PolicyLanguage, PolicyText> = {
  en: {
    privacy: [
      'Fawri stores merchant account data including name, phone number, store name, and activity type.',
      'Fawri stores product data including names, prices, images, quantities, and descriptions.',
      'Fawri stores customer messages for the purpose of managing replies, conversations, and orders.',
      'Fawri may use AI only when needed to improve or generate replies.',
      'The merchant is responsible for the accuracy of product data, prices, and stock.',
      'The merchant is responsible for the legality of their business activity and the products they offer.',
      'Fawri does not guarantee increased sales. It helps improve reply speed and order management.',
      'The merchant may request deletion of their store data from the platform.',
      'Customer data is used only for store service and order handling and is never sold to third parties.',
    ],
    terms: [
      'The merchant must provide accurate information about their store and business activity.',
      "The store's business activity must be legal and must not violate applicable laws or regulations.",
      'Using Fawri to sell illegal, harmful, counterfeit, or fraudulent products is strictly prohibited.',
      'Using Fawri to sell weapons, unlicensed medical products, or any prohibited activity is not allowed.',
      'The merchant is responsible for products, prices, delivery, exchanges, refunds, and customer complaints.',
      'Fawri reserves the right to suspend or terminate any account that violates these terms.',
      'Subscription plans are subject to a defined reply limit and expiration date.',
      'When replies or the subscription expire, auto-replies stop until renewal or re-activation.',
      'Fawri does not guarantee sales. It helps organize replies and improve the customer experience.',
    ],
  },

  ar: {
    privacy: [
      'نقوم بحفظ بيانات حساب التاجر مثل الاسم، رقم الهاتف، اسم المتجر، ونوع النشاط.',
      'نقوم بحفظ بيانات المنتجات مثل الأسماء، الأسعار، الصور، الكميات، والأوصاف.',
      'نقوم بحفظ رسائل العملاء لغرض إدارة الردود، المحادثات، والطلبات.',
      'قد يستخدم فوري الذكاء الاصطناعي عند الحاجة فقط لتحسين أو إنشاء الردود.',
      'التاجر مسؤول عن صحة بيانات المنتجات والأسعار والمخزون.',
      'التاجر مسؤول عن قانونية نشاطه التجاري والمنتجات التي يعرضها.',
      'فوري لا يضمن زيادة المبيعات، بل يساعد على تحسين سرعة الرد وإدارة الطلبات.',
      'يمكن للتاجر طلب حذف بيانات متجره من المنصة.',
      'بيانات العملاء تُستخدم فقط لخدمة المتجر وإدارة الطلبات ولا تُباع لأطراف خارجية.',
    ],
    terms: [
      'يجب على التاجر تقديم معلومات صحيحة عن المتجر والنشاط التجاري.',
      'يجب أن يكون نشاط المتجر قانونياً وغير مخالف للقوانين أو التعليمات.',
      'يُمنع استخدام فوري لبيع منتجات غير قانونية أو ضارة أو مزيفة أو احتيالية.',
      'يُمنع استخدام فوري لبيع الأسلحة أو المنتجات الطبية غير المرخصة أو أي نشاط محظور.',
      'التاجر مسؤول عن المنتجات، الأسعار، التوصيل، الاستبدال، الاسترجاع، وشكاوى العملاء.',
      'يحق لفوري تعليق أو إيقاف أي حساب يخالف شروط الاستخدام.',
      'تخضع الباقات لعدد ردود محدد وتاريخ صلاحية محدد.',
      'عند انتهاء الردود أو انتهاء صلاحية الباقة، يتوقف الرد التلقائي حتى التجديد أو التفعيل.',
      'لا تضمن منصة فوري تحقيق مبيعات، لكنها تساعد في تنظيم الردود وتحسين تجربة العملاء.',
    ],
  },

  ku: {
    privacy: [
      'داتای ئەکاونتی بازرگان پارادەێت وەک ناو، ژمارەی تەلەفۆن، ناوی فرۆشگا، و جۆری چالاکی.',
      'داتای کاڵاکان پارادەێت وەک ناوەکان، نرخەکان، وێنەکان، بڕەکان، و باسکردنەکان.',
      'نامەکانی کڕیار بۆ مەبەستی بەڕێوەبردنی وەڵامدانەوە، گفتوگۆکان، و داواکاریەکان پارادەێت.',
      'فورى لەوە تەنها کاتێک زیرەکی دەستکرد بەکاردێت کە پێویست بێت بۆ باشترکردن یان دروستکردنی وەڵام.',
      'بازرگان بەرپرسیارێتی ڕاستی داتای کاڵا، نرخ، و کۆگا هەیە.',
      'بازرگان بەرپرسیارێتی یاساییبوونی چالاکی بازرگانیەکەی و کاڵاکانی هەیە.',
      'فورى پشتیوانی زیادبوونی فرۆشتن ناکات، بەڵکو یارمەتی خێراکردنی وەڵام و بەڕێوەبردنی داواکاری دەدات.',
      'بازرگان دەتوانێت داواکاری سڕینەوەی داتای فرۆشگاکەی بکات.',
      'داتای کڕیار تەنها بۆ خزمەتگوزاری فرۆشگا و بەڕێوەبردنی داواکاری بەکاردێت و بە لایەنی دەرەوە نافرۆشرێت.',
    ],
    terms: [
      'بازرگان دەبێت زانیاری ڕاست دەربارەی فرۆشگا و چالاکی بازرگانی پێشکەش بکات.',
      'چالاکی فرۆشگا دەبێت یاسایی بێت و مخالفەتی یاسا و رێنماییەکان نەکات.',
      'بەکارهێنانی فورى بۆ فرۆشتنی کاڵای نایاسایی، زیانبەخش، دروڵ، یان خاپووری قەدەغەیە.',
      'بەکارهێنانی فورى بۆ فرۆشتنی چەک، دەرمانی بێ مۆڵەت، یان هەر چالاکیەکی قەدەغەکراو نابێت.',
      'بازرگان بەرپرسیارێتی کاڵاکان، نرخەکان، گەیاندن، گۆڕینەوە، گەڕاندنەوە، و گلەکانی کڕیار هەیە.',
      'فورى مافی هەیە هەر ئەکاونتێک کە مەرجەکانی بەکارهێنان بشکێنێت وەستێنێت.',
      'پلانەکان بە ژمارەی دیاریکراوی وەڵام و بەرواری بەسەرچوونی دیاریکراو بەکاردێن.',
      'کاتێک وەڵامەکان یان پلانەکە بەسەرچوو، وەڵامی ئۆتۆماتیکی دوور دەبێتەوە تا نوێکردنەوە.',
      'فورى پشتیوانی فرۆشتن ناکات، بەڵکو یارمەتی ڕێکخستنی وەڵام و باشترکردنی ئەزموونی کڕیار دەدات.',
    ],
  },
};

export function getPolicyText(lang: string): PolicyText {
  if (lang === 'ar' || lang === 'ku') {
    return policyText[lang];
  }

  return policyText.en;
}
