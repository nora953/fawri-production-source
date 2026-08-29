export const SAVED_ANSWERS_AUTHORITY_COPY = {
  ar: {
    unavailableTitle: 'تعذر تحميل الإجابات المحفوظة من الخادم',
    unavailableBody: 'لا يمكن تأكيد حالة الإجابات المحفوظة الآن. أعد المحاولة قبل إجراء أي تعديل.',
    staleBody: 'تعذر تحديث الإجابات المحفوظة. البيانات المعروضة هي آخر نسخة مؤكدة من الخادم وقد لا تكون الأحدث.',
    retry: 'إعادة المحاولة',
    conflict: 'تغيّرت هذه الإجابة على الخادم. تم تحديث القائمة بأحدث نسخة؛ راجعها ثم أعد المحاولة.',
  },
  ku: {
    unavailableTitle: 'بارکردنی وەڵامە پاشەکەوتکراوەکان لە سێرڤەر سەرکەوتوو نەبوو',
    unavailableBody: 'ئێستا ناتوانرێت دۆخی وەڵامە پاشەکەوتکراوەکان پشتڕاست بکرێتەوە. پێش هەر گۆڕانکارییەک دووبارە هەوڵ بدەوە.',
    staleBody: 'نوێکردنەوەی وەڵامە پاشەکەوتکراوەکان سەرکەوتوو نەبوو. داتای پیشاندراو دوا وەشانی پشتڕاستکراوەی سێرڤەرە و لەوانەیە نوێترین نەبێت.',
    retry: 'دووبارە هەوڵدانەوە',
    conflict: 'ئەم وەڵامە لە سێرڤەر گۆڕاوە. لیستەکە بە نوێترین وەشان نوێکرایەوە؛ پێداچوونەوەی بکە و دووبارە هەوڵ بدەوە.',
  },
  en: {
    unavailableTitle: 'Could not load saved answers from the server',
    unavailableBody: 'The current saved-answer state cannot be confirmed. Retry before making changes.',
    staleBody: 'Saved answers could not be refreshed. The data shown is the last server-confirmed version and may not be current.',
    retry: 'Retry',
    conflict: 'This saved answer changed on the server. The list was refreshed to the newest version; review it and try again.',
  },
} as const;
