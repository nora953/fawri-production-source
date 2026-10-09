import type { Lang } from "@/lib/types";

const DISCARD_UNSAVED_NOTE: Record<Lang, string> = {
  ar: "لديك ملاحظات غير محفوظة. هل تريد الخروج دون حفظها؟",
  ku: "تێبینیی پاشەکەوتنەکراوت هەیە. دەتەوێت بەبێ پاشەکەوتکردن بچیتە دەرەوە؟",
  en: "You have unsaved notes. Leave without saving them?",
};

export function getDiscardUnsavedNoteCopy(lang: Lang): string {
  return DISCARD_UNSAVED_NOTE[lang];
}
