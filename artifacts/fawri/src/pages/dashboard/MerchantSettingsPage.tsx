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

const UI_COPY: Record<UiLanguage, UiCopy> = {
  ar: {
    preferencesTitle: 'تفضيلات الواجهة',
    preferencesDescription:
      'اللغة والمظهر تفضيلات محلية للواجهة فقط، وليستا جزءًا من إعدادات التوصيل أو الدفع أو الرد التلقائي على السيرفر.',
    language: 'لغة الواجهة',
    appearance: 'المظهر',
    light: 'فاتح',
    dark: 'داكن',
    auto: 'حسب النظام',
    authorityTitle: 'حدود نموذج الإعدادات',
    authorityDescription:
      'الإعدادات التشغيلية أدناه تأتي من السيرفر وتُحفظ على السيرفر فقط.',
    deliveryModel:
      'التوصيل يدعم أجرة واحدة لجميع المناطق. اختلاف الأجرة لكل منطقة غير ممثل في نموذج السيرفر ويحتاج COORDINATOR/PRODUCT MODEL HANDOFF REQUIRED قبل أي ترحيل.',
    superQiModel:
      'SuperQi هنا يحدد طريقة دفع إلكترونية فقط. اسم الحساب وQR غير مدعومين بسلطة سيرفر آمنة حاليًا، لذلك لا يتم حفظهما محليًا ولا ضمن الإعدادات التشغيلية.',
  },
  ku: {
    preferencesTitle: 'هەڵبژاردەکانی ڕووکار',
    preferencesDescription:
      'زمان و دیمەن تەنها هەڵبژاردەی ناوخۆیی ڕووکارن و بەشێک نین لە ڕێکخستنەکانی گەیاندن، پارەدان یان وەڵامی خۆکاری سێرڤەر.',
    language: 'زمانی ڕووکار',
    appearance: 'دیمەن',
    light: 'ڕووناک',
    dark: 'تاریک',
    auto: 'بەپێی سیستەم',
    authorityTitle: 'سنووری مۆدێلی ڕێکخستنەکان',
    authorityDescription:
      'ڕێکخستنە کارپێکراوەکانی خوارەوە لە سێرڤەرەوە دێن و تەنها لە سێرڤەر پاشەکەوت دەکرێن.',
    deliveryModel:
      'گەیاندن تەنها یەک نرخ بۆ هەموو ناوچەکان پشتگیری دەکات. نرخی جیاواز بۆ هەر ناوچەیەک لە مۆدێلی سێرڤەر نییە و پێویستی بە COORDINATOR/PRODUCT MODEL HANDOFF REQUIRED هەیە.',
    superQiModel:
      'SuperQi لێرە تەنها وەک شێوازی پارەدانی ئەلیکترۆنی هەڵدەبژێردرێت. ناوی هەژمار و QR دەسەڵاتی سێرڤەری پارێزراویان نییە، بۆیە ناوخۆ یان لە ڕێکخستنە کارپێکراوەکان پاشەکەوت ناکرێن.',
  },
  en: {
    preferencesTitle: 'Interface preferences',
    preferencesDescription:
      'Language and appearance are local UI preferences only. They are not part of the server delivery, payment, or automatic-reply settings.',
    language: 'Interface language',
    appearance: 'Appearance',
    light: 'Light',
    dark: 'Dark',
    auto: 'System',
    authorityTitle: 'Settings model limits',
    authorityDescription:
      'The operational settings below are loaded from the server and saved to the server only.',
    deliveryModel:
      'Delivery supports one fee across all areas. Different per-area fees are not representable by the current server model and require COORDINATOR/PRODUCT MODEL HANDOFF REQUIRED before migration.',
    superQiModel:
      'SuperQi here selects an electronic payment method only. Account-name and QR data do not have a secure server authority, so they are not stored locally or in operational settings.',
  },
};

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
                <option value="ar">العربية</option>
                <option value="ku">کوردی</option>
                <option value="en">English</option>
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
