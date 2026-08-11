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
  },
};
