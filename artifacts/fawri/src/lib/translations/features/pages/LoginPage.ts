// Centralized localized copy extracted from pages/LoginPage.tsx.
// Keep runtime behavior in the source component; keep language copy here.

export const LOGIN_PAGE_SECURITY_TEXT = {
    ar: {
      approval: 'تم إرسال طلب اعتماد هذا الجهاز إلى المالك. لن يمكن الدخول حتى يمنح المالك الثقة للجهاز من صفحة مراقب العمل.',
      sessionLimit: 'تم بلوغ الحد الأقصى للجلسات المفتوحة. يجب إنهاء إحدى الجلسات أولًا.',
      deviceRequired: 'تعذر التحقق من هوية الجهاز. أعد فتح المتصفح وحاول مرة أخرى.',
      ownerDeviceVerification: 'تم تسجيل الدخول من جهاز جديد. أدخل رمز التحقق المرسل إلى رقم المالك لاعتماد هذا الجهاز.',
      trustedDeviceLimit: 'تم بلوغ الحد الأقصى للأجهزة الموثوقة. ألغِ اعتماد جهاز قديم قبل اعتماد هذا الجهاز.',
      otpDeliveryUnavailable: 'خدمة إرسال رمز التحقق غير مهيأة في هذه البيئة. لا يمكن إكمال تسجيل الدخول الآمن حتى يتم تهيئتها.',
      otpDeliveryFailed: 'تعذر إرسال رمز التحقق حاليًا. حاول مرة أخرى بعد قليل.',
      previewOtpLabel: 'رمز الاختبار لهذه البيئة',
    },
    en: {
      approval: 'A device approval request was sent to the owner. Sign-in remains blocked until the owner trusts this device from Work Monitor.',
      sessionLimit: 'The open-session limit has been reached. An existing session must be terminated first.',
      deviceRequired: 'The device identity could not be verified. Reopen the browser and try again.',
      ownerDeviceVerification: 'A sign-in was detected from a new device. Enter the verification code sent to the owner phone to trust this device.',
      trustedDeviceLimit: 'The trusted-device limit has been reached. Revoke an old trusted device before trusting this one.',
      otpDeliveryUnavailable: 'OTP delivery is not configured in this environment. Secure sign-in cannot continue until it is configured.',
      otpDeliveryFailed: 'The verification code could not be delivered right now. Try again shortly.',
      previewOtpLabel: 'Preview verification code',
    },
    ku: {
      approval: 'داواکاری متمانەپێکردنی ئەم ئامێرە بۆ خاوەنەکە نێردرا. تا خاوەنەکە لە چاودێری کار متمانەی پێ نەدات چوونەژوورەوە ڕێگەپێنەدراوە.',
      sessionLimit: 'سنووری دانیشتنە کراوەکان پڕ بووە. دەبێت یەک دانیشتن کۆتایی پێبهێنرێت.',
      deviceRequired: 'ناسنامەی ئامێرەکە پشتڕاست نەکرایەوە. وێبگەڕەکە دووبارە بکەرەوە.',
      ownerDeviceVerification: 'چوونەژوورەوە لە ئامێرێکی نوێ دۆزرایەوە. کۆدی پشتڕاستکردنەوەی نێردراو بۆ ژمارەی خاوەنەکە بنووسە بۆ متمانەپێکردنی ئەم ئامێرە.',
      trustedDeviceLimit: 'سنووری ئامێرە متمانەپێکراوەکان پڕ بووە. پێش متمانەپێکردنی ئەم ئامێرە، متمانە لە ئامێرێکی کۆن هەڵبگرە.',
      otpDeliveryUnavailable: 'ناردنی کۆدی پشتڕاستکردنەوە لەم ژینگەیە ڕێکنەخراوە. تا ڕێکنەخرێت چوونەژوورەوەی پارێزراو تەواو نابێت.',
      otpDeliveryFailed: 'لە ئێستادا نەتوانرا کۆدی پشتڕاستکردنەوە بنێردرێت. دوای کەمێک دووبارە هەوڵبدەوە.',
      previewOtpLabel: 'کۆدی تاقیکردنەوەی ئەم ژینگەیە',
    },
  };
