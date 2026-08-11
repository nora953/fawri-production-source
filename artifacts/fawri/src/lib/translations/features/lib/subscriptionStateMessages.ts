// Centralized localized copy extracted from lib/subscriptionStateMessages.ts.
// Keep runtime behavior in the source component; keep language copy here.

export const SUBSCRIPTION_STATE_MESSAGES_SUBSCRIPTION_STATE_MESSAGES = {
  ar: {
    noSubscriptionTitle: 'لا يوجد اشتراك',
    noSubscriptionBody: 'لا توجد خطة اشتراك مسجلة لهذا الحساب حالياً.',
    suspendedTitle: 'الاشتراك موقوف',
    suspendedBody: 'الاشتراك غير فعّال حالياً. بيانات حسابك ما زالت محفوظة وفق سياسة الاحتفاظ.',
    expiredProtectedTitle: 'انتهى الاشتراك',
    expiredProtectedBody: 'انتهى اشتراكك، لكن بيانات حسابك ما زالت محفوظة خلال فترة الاحتفاظ.',
    pendingTitle: 'الاشتراك بانتظار التفعيل',
    pendingBody: 'الخطة مسجلة، لكنها لن تصبح فعّالة حتى تكتمل عملية التفعيل.',
    repliesExhaustedTitle: 'نفدت الردود',
    repliesExhaustedBody: 'توقفت الردود التلقائية لأن رصيد الردود انتهى، بينما تبقى الخطة مسجلة حتى تاريخ انتهائها.',
    emergencyUnavailable: 'تعذر تفعيل رصيد الطوارئ. حاول مرة أخرى.',
  },
  ku: {
    noSubscriptionTitle: 'هیچ بەشدارییەک نییە',
    noSubscriptionBody: 'لە ئێستادا هیچ پلانی بەشدارییەک بۆ ئەم هەژمارە تۆمار نەکراوە.',
    suspendedTitle: 'بەشدارییەکە ڕاگیراوە',
    suspendedBody: 'بەشدارییەکە لە ئێستادا چالاک نییە. داتاکانی هەژمارەکەت بەگوێرەی سیاسەتی پاراستن هێشتا پارێزراون.',
    expiredProtectedTitle: 'بەشدارییەکە بەسەرچووە',
    expiredProtectedBody: 'بەشدارییەکەت بەسەرچووە، بەڵام داتاکانی هەژمارەکەت لە ماوەی پاراستندا هێشتا پارێزراون.',
    pendingTitle: 'بەشدارییەکە چاوەڕێی چالاککردنە',
    pendingBody: 'پلانەکە تۆمارکراوە، بەڵام تا تەواوبوونی چالاککردن چالاک نابێت.',
    repliesExhaustedTitle: 'وەڵامەکان تەواو بوون',
    repliesExhaustedBody: 'وەڵامدانەوەی خۆکار وەستاوە چونکە کرێدیتی وەڵام تەواو بووە، بەڵام پلانەکە تا بەرواری بەسەرچوون تۆمارکراو دەمێنێتەوە.',
    emergencyUnavailable: 'نەتوانرا کرێدیتی فریاکەوتن چالاک بکرێت. دووبارە هەوڵ بدە.',
  },
  en: {
    noSubscriptionTitle: 'No subscription',
    noSubscriptionBody: 'No subscription plan is currently registered for this account.',
    suspendedTitle: 'Subscription suspended',
    suspendedBody: 'The subscription is not active. Your account data remains stored under the retention policy.',
    expiredProtectedTitle: 'Subscription expired',
    expiredProtectedBody: 'Your subscription has expired, but your account data remains stored during the retention period.',
    pendingTitle: 'Subscription pending activation',
    pendingBody: 'The plan is registered but will not become active until activation is completed.',
    repliesExhaustedTitle: 'Replies exhausted',
    repliesExhaustedBody: 'Automatic replies have stopped because the reply balance is exhausted. The plan remains registered until its expiry date.',
    emergencyUnavailable: 'Emergency credit could not be activated. Please try again.',
  },
};
