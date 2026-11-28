import type { Lang } from '@/lib/types';

/** Shared source of truth for Google merchant admission copy in all locales. */
export const GOOGLE_MERCHANT_AUTH_COPY: Record<Lang, {
  login: { title: string; start: string; retry: string; choose: string; note: string; error: string };
  signup: { title: string; start: string; restart: string; choose: string; pending: string; error: string };
}> = {
  ar: {
    login: {
      title: 'الدخول بحساب Google',
      start: 'الدخول بواسطة Google',
      retry: 'إعادة محاولة Google',
      choose: 'اختر حساب Google المرتبط بمتجرك.',
      note: 'لديك متجر مسجل بحساب Google؟ ادخل من هنا. الحسابات الجديدة تُنشأ من صفحة التسجيل.',
      error: 'تعذر تسجيل الدخول بحساب Google، أو الحساب غير مسجل بعد.',
    },
    signup: {
      title: 'التسجيل بحساب Google',
      start: 'متابعة باستخدام Google',
      restart: 'إعادة محاولة Google',
      choose: 'اختر حساب Google لإكمال التسجيل.',
      pending: 'الهوية موثّقة، لكن التجربة المجانية والاشتراك يحتاجان موافقة منفصلة.',
      error: 'تعذر إكمال التسجيل عبر Google. حاول مرة أخرى.',
    },
  },
  en: {
    login: {
      title: 'Sign in with Google',
      start: 'Continue with Google',
      retry: 'Retry Google sign-in',
      choose: 'Choose the Google account linked to your store.',
      note: 'For existing Google-linked merchants only. New merchants must sign up first.',
      error: 'Google sign-in failed or this Google account is not registered.',
    },
    signup: {
      title: 'Sign up with Google',
      start: 'Continue with Google',
      restart: 'Retry Google sign-up',
      choose: 'Choose your Google account to finish sign-up.',
      pending: 'Identity is verified; trial and subscription require separate approval.',
      error: 'Google sign-up could not be completed. Try again.',
    },
  },
  ku: {
    login: {
      title: 'چوونەژوورەوە بە Google',
      start: 'بە Google بچۆ ژوورەوە',
      retry: 'دووبارە هەوڵدان بە Google',
      choose: 'هەژماری Google پەیوەست بە دووکانەکەت هەڵبژێرە.',
      note: 'تەنیا بۆ بازرگانانی تۆمارکراو؛ هەژماری نوێ لە پەڕەی تۆمارکردن دروست بکە.',
      error: 'چوونەژوورەوە بە Google سەرکەوتوو نەبوو یان هەژمارەکە تۆمار نەکراوە.',
    },
    signup: {
      title: 'تۆمارکردن بە Google',
      start: 'بە Google بەردەوام بە',
      restart: 'دووبارە هەوڵدان بە Google',
      choose: 'هەژماری Google هەڵبژێرە بۆ تەواوکردنی تۆمارکردن.',
      pending: 'ناسنامە پشتڕاست دەکرێتەوە؛ تاقیکردنەوە و بەشداریکردن پێویستیان بە پەسەندکردنی جیاوازە.',
      error: 'تۆمارکردن بە Google سەرکەوتوو نەبوو. دووبارە هەوڵبدەوە.',
    },
  },
};