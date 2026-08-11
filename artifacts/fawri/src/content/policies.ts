import { POLICIES_POLICY_TEXT } from '@/lib/translations/features/content/policies';
export type PolicyLanguage = 'en' | 'ar' | 'ku';

export type PolicyText = {
  privacy: readonly string[];
  terms: readonly string[];
};

export const policyText: Record<PolicyLanguage, PolicyText> = POLICIES_POLICY_TEXT;

export function getPolicyText(lang: string): PolicyText {
  if (lang === 'ar' || lang === 'ku') {
    return policyText[lang];
  }

  return policyText.en;
}
