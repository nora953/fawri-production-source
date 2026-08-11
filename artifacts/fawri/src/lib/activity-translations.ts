import { ACTIVITY_TRANSLATIONS_ACTIVITY_TRANSLATIONS } from '@/lib/translations/features/lib/activity-translations';
export type ActivityLanguage = "ar" | "ku" | "en";

type ActivityTranslation = Record<ActivityLanguage, string>;

const ACTIVITY_TRANSLATIONS: Record<string, ActivityTranslation> = ACTIVITY_TRANSLATIONS_ACTIVITY_TRANSLATIONS;

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
