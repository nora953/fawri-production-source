import type { Lang } from '@/lib/types';

export const GOOGLE_PHONE_VERIFICATION_COPY: Record<Lang, {
  title: string; subtitle: string; country: string; phone: string;
  placeholder: string; invalidPhone: string; send: string; code: string;
  verify: string; retry: string; error: string; expired: string;
  success: string; note: string;
}> = {
  ar: {
    title: 'تأكيد رقم واتساب',
    subtitle: 'اربط رقم واتساب بمتجرك الجديد للتحقق من ملكية الهاتف.',
    country: 'الدولة', phone: 'رقم واتساب', placeholder: 'رقم الهاتف',
    invalidPhone: 'تأكد من رمز الدولة ورقم الهاتف.',
    send: 'إرسال رمز واتساب', code: 'رمز التحقق المكون من 6 أرقام',
    verify: 'تأكيد الرقم', retry: 'إرسال رمز جديد',
    error: 'تعذر إتمام التحقق. حاول لاحقاً.',
    expired: 'انتهت صلاحية الرمز. اطلب رمزاً جديداً.',
    success: 'تم تأكيد الرقم وربطه بمتجرك.',
    note: 'تأكيد الرقم لا يمنح تجربة مجانية أو اشتراكاً تلقائياً.',
  },
  en: {
    title: 'Verify your WhatsApp number',
    subtitle: 'Link a WhatsApp number to your new store by proving you own it.',
    country: 'Country', phone: 'WhatsApp number', placeholder: 'Phone number',
    invalidPhone: 'Check your country code and phone number.',
    send: 'Send WhatsApp code', code: 'Six-digit verification code',
    verify: 'Verify number', retry: 'Send a new code',
    error: 'Verification could not be completed. Please try again later.',
    expired: 'This code has expired. Request a new one.',
    success: 'Your number was verified and linked to your store.',
    note: 'Verifying a phone does not automatically grant a trial or subscription.',
  },
  ku: {
    title: 'پشتڕاستکردنەوەی ژمارەی واتساپ',
    subtitle: 'ژمارەی واتساپ بە دووکانە نوێیەکەتەوە ببەستە و خاوەندارییەکەی پشتڕاست بکەرەوە.',
    country: 'وڵات', phone: 'ژمارەی واتساپ', placeholder: 'ژمارەی تەلەفۆن',
    invalidPhone: 'کۆدی وڵات و ژمارەی تەلەفۆن بپشکنە.',
    send: 'ناردنی کۆدی واتساپ', code: 'کۆدی شەش ژمارەیی',
    verify: 'پشتڕاستکردنەوە', retry: 'ناردنی کۆدی نوێ',
    error: 'پشتڕاستکردنەوە سەرکەوتوو نەبوو. دواتر هەوڵبدەوە.',
    expired: 'کاتەکەی کۆد تەواو بووە. کۆدی نوێ داوا بکە.',
    success: 'ژمارەکەت پشتڕاستکرایەوە و بە دووکانەکەت پەیوەستکرا.',
    note: 'پشتڕاستکردنەوەی ژمارەکە تاقیکردنەوە یان بەشداریکردن بەخۆڕایی نادات.',
  },
};