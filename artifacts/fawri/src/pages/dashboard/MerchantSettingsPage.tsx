import { COMMON_UI_LABELS } from '@/lib/translations/commonUi';
import { MERCHANT_SETTINGS_PAGE_UI_COPY } from '@/lib/translations/features/pages/dashboard/MerchantSettingsPage';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useTheme } from '@/contexts/ThemeContext';
import { useI18n } from '@/lib/i18n';
import MerchantAccountSecurityPanel from './MerchantAccountSecurityPanel';
import ServerSettingsPage from './ServerSettingsPage';

type UiLanguage = 'ar' | 'ku' | 'en';
type ThemePreference = 'light' | 'dark' | 'auto';

type UiCopy = {
  preferencesTitle: string;
  preferencesDescription: string;
  language: string;
  appearance: string;
  light: string;
  dark: string;
  auto: string;
  authorityTitle: string;
  authorityDescription: string;
  deliveryModel: string;
  superQiModel: string;
};

const UI_COPY: Record<UiLanguage, UiCopy> = MERCHANT_SETTINGS_PAGE_UI_COPY;

export default function MerchantSettingsPage() {
  const { lang, setLang, dir } = useI18n();
  const { theme, setTheme } = useTheme();
  const copy = UI_COPY[lang as UiLanguage] || UI_COPY.ar;

  return (
    <div dir={dir} className="min-h-screen bg-background pb-28">
      <div className="mx-auto max-w-5xl space-y-4 px-4 pt-4">
        <Card>
          <CardHeader>
            <CardTitle>{copy.preferencesTitle}</CardTitle>
            <p className="text-sm leading-6 text-muted-foreground">
              {copy.preferencesDescription}
            </p>
          </CardHeader>
          <CardContent className="grid gap-4 md:grid-cols-2">
            <label className="space-y-2 text-sm font-medium">
              <span>{copy.language}</span>
              <select
                value={lang}
                onChange={event => setLang(event.target.value as UiLanguage)}
                className="h-11 w-full rounded-md border bg-background px-3"
              >
                <option value="ar">{COMMON_UI_LABELS.languageNames.ar}</option>
                <option value="ku">{COMMON_UI_LABELS.languageNames.ku}</option>
                <option value="en">{COMMON_UI_LABELS.languageNames.en}</option>
              </select>
            </label>

            <label className="space-y-2 text-sm font-medium">
              <span>{copy.appearance}</span>
              <select
                value={theme}
                onChange={event =>
                  setTheme(event.target.value as ThemePreference)
                }
                className="h-11 w-full rounded-md border bg-background px-3"
              >
                <option value="light">{copy.light}</option>
                <option value="dark">{copy.dark}</option>
                <option value="auto">{copy.auto}</option>
              </select>
            </label>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{copy.authorityTitle}</CardTitle>
            <p className="text-sm leading-6 text-muted-foreground">
              {copy.authorityDescription}
            </p>
          </CardHeader>
          <CardContent className="space-y-3 text-sm leading-6 text-muted-foreground">
            <p>{copy.deliveryModel}</p>
            <p>{copy.superQiModel}</p>
          </CardContent>
        </Card>

        <MerchantAccountSecurityPanel />
      </div>

      <ServerSettingsPage />
    </div>
  );
}
