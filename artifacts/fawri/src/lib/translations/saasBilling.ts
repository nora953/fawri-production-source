import type { Lang } from '@/lib/types';

export const saasBillingCopy: Record<Lang, {
  title: string;
  providerDisabled: string;
  cycleActive: string;
  choose: string;
  current: string;
  perMonth: string;
  replies: string;
  recent: string;
  reconciliation: string;
  checkoutUnavailable: string;
  checkoutCreated: string;
  sandboxNotice: string;
  fastPayNotice: string;
  merchantSetupRequired: string;
  authorityUnavailableTitle: string;
  authorityUnavailableBody: string;
  retry: string;
  recentUnavailable: string;
  recentEmpty: string;
}> = {
  ar: {
    title: 'خطط اشتراك فوري',
    providerDisabled: 'الدفع الذاتي لاشتراك فوري غير مفعّل بعد. لن يتم اعتبار أي اشتراك مدفوعًا بدون تأكيد من مزود الدفع المعتمد.',
    cycleActive: 'دورتك الحالية ما زالت فعّالة. التجديد أو تغيير الخطة يصبح متاحًا عند انتهاء الدورة أو نفاد رصيد الخطة الأساسي.',
    choose: 'اختيار',
    current: 'الخطة الحالية',
    perMonth: 'د.ع / شهر',
    replies: 'رد أساسي',
    recent: 'آخر عمليات الاشتراك',
    reconciliation: 'دفعة تحتاج مراجعة',
    checkoutUnavailable: 'الدفع غير متاح حاليًا',
    checkoutCreated: 'تم إنشاء طلب الدفع',
    sandboxNotice: 'أنت تستخدم بيئة اختبار SuperQi. لا يتم استخدام أموال حقيقية في هذا الوضع.',
    fastPayNotice: 'FastPay سيكون متاحًا بعد إكمال حساب التاجر والحصول على بيانات الربط الرسمية من FastPay.',
    merchantSetupRequired: 'يتطلب إعداد حساب تاجر',
    authorityUnavailableTitle: 'تعذر تحميل خيارات الاشتراك والدفع',
    authorityUnavailableBody: 'تعذر الوصول إلى خدمة الفوترة الآن. لم نفترض أن الدفع غير مفعّل أو أن الخطط غير موجودة. حاول مرة أخرى.',
    retry: 'إعادة المحاولة',
    recentUnavailable: 'تعذر تحميل سجل عمليات الاشتراك. خيارات الخطط أدناه ما زالت مأخوذة من خدمة الفوترة الحالية.',
    recentEmpty: 'لا توجد عمليات اشتراك سابقة لهذا الحساب.',
  },
  en: {
    title: 'Fawri subscription plans',
    providerDisabled: 'Self-service Fawri subscription payment is not enabled yet. No subscription is treated as paid without confirmation from the configured payment provider.',
    cycleActive: 'Your current cycle is still active. Renewal or plan change becomes available when the cycle expires or the base plan balance is exhausted.',
    choose: 'Choose',
    current: 'Current plan',
    perMonth: 'IQD / month',
    replies: 'base replies',
    recent: 'Recent subscription billing',
    reconciliation: 'Payment needs review',
    checkoutUnavailable: 'Checkout is not available yet',
    checkoutCreated: 'Billing order created',
    sandboxNotice: 'SuperQi sandbox is active. No real money is used in this mode.',
    fastPayNotice: 'FastPay will become available after merchant onboarding and official integration credentials are provided.',
    merchantSetupRequired: 'Merchant setup required',
    authorityUnavailableTitle: 'Unable to load subscription billing',
    authorityUnavailableBody: 'The billing service could not be reached. We have not assumed that checkout is disabled or that plans are missing. Please try again.',
    retry: 'Try again',
    recentUnavailable: 'Recent subscription billing could not be loaded. The plan options below still come from the current billing catalog.',
    recentEmpty: 'There are no previous subscription billing operations for this account.',
  },
  ku: {
    title: 'پلانی بەشداری فەوری',
    providerDisabled: 'پارەدانی خۆخزمەتگوزاری بۆ بەشداری فەوری هێشتا چالاک نەکراوە. هیچ بەشدارییەک بە پارەدراو هەژمار ناکرێت تا دابینکەری پارەدان پشتڕاستی نەکاتەوە.',
    cycleActive: 'خولی ئێستات هێشتا چالاکە. نوێکردنەوە یان گۆڕینی پلان دوای کۆتایی خول یان تەواوبوونی وەڵامی بنەڕەتی بەردەست دەبێت.',
    choose: 'هەڵبژاردن',
    current: 'پلانی ئێستا',
    perMonth: 'IQD / مانگ',
    replies: 'وەڵامی بنەڕەتی',
    recent: 'دوایین مامەڵەکانی بەشداری',
    reconciliation: 'پارەدان پێویستی بە پشکنین هەیە',
    checkoutUnavailable: 'پارەدان هێشتا بەردەست نییە',
    checkoutCreated: 'داواکاری پارەدان دروست کرا',
    sandboxNotice: 'ژینگەی تاقیکردنەوەی SuperQi چالاکە. لەم دۆخەدا پارەی ڕاستەقینە بەکارناهێنرێت.',
    fastPayNotice: 'FastPay دوای تەواوکردنی هەژماری بازرگان و وەرگرتنی زانیارییە فەرمییەکانی بەستنەوە بەردەست دەبێت.',
    merchantSetupRequired: 'پێویستی بە ڕێکخستنی هەژماری بازرگان هەیە',
    authorityUnavailableTitle: 'نەتوانرا پلانی بەشداری و پارەدان باربکرێت',
    authorityUnavailableBody: 'لە ئێستادا نەتوانرا دەست بە خزمەتگوزاری پارەدان بگات. وانەزانراوە کە پارەدان ناچالاکە یان پلانەکان بوونیان نییە. دووبارە هەوڵ بدەوە.',
    retry: 'دووبارە هەوڵدانەوە',
    recentUnavailable: 'نەتوانرا دوایین مامەڵەکانی بەشداری باربکرێن. هەڵبژاردەکانی پلان لە خوارەوە هێشتا لە کاتەلۆگی ئێستای پارەدان وەرگیراون.',
    recentEmpty: 'هیچ مامەڵەی پێشووی بەشداری بۆ ئەم هەژمارە نییە.',
  },
};
