export type AdminSecurityLanguage = "ar" | "ku" | "en";

export const ADMIN_SECURITY_ACTION_COPY = {
  ar: {
    unknownLog: "تم تسجيل عملية إدارية",
    countSeparator: "من",
    labels: {
      assistant_device_trusted: "منح الثقة لجهاز المسؤول المساعد",
      assistant_device_trust_revoked: "سحب الثقة من جهاز المسؤول المساعد",
      assistant_session_revoked: "إنهاء جلسة المسؤول المساعد",
      assistant_sessions_revoked: "إنهاء جميع جلسات المسؤول المساعد",
    },
    details: {
      assistant_device_trusted: "تم منح الثقة لجهاز المسؤول المساعد",
      assistant_device_trust_revoked: "تم سحب الثقة من جهاز المسؤول المساعد",
      assistant_session_revoked: "تم إنهاء جلسة المسؤول المساعد",
      assistant_sessions_revoked: "تم إنهاء جميع جلسات المسؤول المساعد",
    },
  },
  ku: {
    unknownLog: "کردارێکی بەڕێوەبردن تۆمار کرا",
    countSeparator: "لە",
    labels: {
      assistant_device_trusted: "متمانەپێکردنی ئامێری بەڕێوەبەری یاریدەدەر",
      assistant_device_trust_revoked: "سەندنەوەی متمانە لە ئامێری بەڕێوەبەری یاریدەدەر",
      assistant_session_revoked: "کۆتاییهێنان بە دانیشتنی بەڕێوەبەری یاریدەدەر",
      assistant_sessions_revoked: "کۆتاییهێنان بە هەموو دانیشتنەکانی بەڕێوەبەری یاریدەدەر",
    },
    details: {
      assistant_device_trusted: "متمانە بە ئامێری بەڕێوەبەری یاریدەدەر درا",
      assistant_device_trust_revoked: "متمانە لە ئامێری بەڕێوەبەری یاریدەدەر سەندرایەوە",
      assistant_session_revoked: "دانیشتنی بەڕێوەبەری یاریدەدەر کۆتایی پێ هات",
      assistant_sessions_revoked: "هەموو دانیشتنەکانی بەڕێوەبەری یاریدەدەر کۆتاییان پێ هات",
    },
  },
  en: {
    unknownLog: "Administrative action recorded",
    countSeparator: "of",
    labels: {
      assistant_device_trusted: "Trust assistant device",
      assistant_device_trust_revoked: "Revoke assistant device trust",
      assistant_session_revoked: "Terminate assistant session",
      assistant_sessions_revoked: "Terminate all assistant sessions",
    },
    details: {
      assistant_device_trusted: "The assistant administrator device was trusted",
      assistant_device_trust_revoked: "Trust was revoked from the assistant administrator device",
      assistant_session_revoked: "The assistant administrator session was terminated",
      assistant_sessions_revoked: "All assistant administrator sessions were terminated",
    },
  },
} as const;
