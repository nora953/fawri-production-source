export type ActivityLanguage = "ar" | "ku" | "en";

type ActivityTranslation = Record<ActivityLanguage, string>;

const ACTIVITY_TRANSLATIONS: Record<string, ActivityTranslation> = {
  ملابس: {
    ar: "ملابس",
    ku: "جلوبەرگ",
    en: "Clothing",
  },
  clothing: {
    ar: "ملابس",
    ku: "جلوبەرگ",
    en: "Clothing",
  },

  إلكترونيات: {
    ar: "إلكترونيات",
    ku: "ئەلیکترۆنیات",
    en: "Electronics",
  },
  الكترونيات: {
    ar: "إلكترونيات",
    ku: "ئەلیکترۆنیات",
    en: "Electronics",
  },
  electronics: {
    ar: "إلكترونيات",
    ku: "ئەلیکترۆنیات",
    en: "Electronics",
  },

  "متجر أدوات احتياطية": {
    ar: "متجر أدوات احتياطية",
    ku: "فرۆشگای پارچەی یەدەکی",
    en: "Spare Parts Store",
  },
  "متجر قطع غيار": {
    ar: "متجر قطع غيار",
    ku: "فرۆشگای پارچەی یەدەکی",
    en: "Spare Parts Store",
  },
  "متجر ادوات احتياطيه": {
    ar: "متجر أدوات احتياطية",
    ku: "فرۆشگای پارچەی یەدەکی",
    en: "Spare Parts Store",
  },

  "spare parts store": {
    ar: "متجر قطع غيار",
    ku: "فرۆشگای پارچەی یەدەکی",
    en: "Spare Parts Store",
  },
};

const normalizeActivityKey = (activity: string): string =>
  activity.trim().replace(/\s+/g, " ").toLocaleLowerCase();

export const getLocalizedActivity = (
  activity: string | null | undefined,
  lang: ActivityLanguage,
): string => {
  if (!activity?.trim()) {
    return "";
  }

  const normalizedActivity = normalizeActivityKey(activity);
  return ACTIVITY_TRANSLATIONS[normalizedActivity]?.[lang] ?? activity.trim();
};
