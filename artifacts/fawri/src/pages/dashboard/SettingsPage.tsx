import React, { useEffect, useRef, useState } from 'react';
import { useI18n } from '@/lib/i18n';
import { useTheme } from '@/contexts/ThemeContext';
import { getCurrentMerchant, getMerchants, saveMerchants } from '@/lib/store';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import ChangePasswordModal from '@/components/ChangePasswordModal';
import {
  Settings,
  Store,
  Palette,
  Truck,
  CreditCard,
  Bot,
  Save,
  Phone,
  ChevronDown,
  Plus,
  Trash2,
  Upload,
  Image as ImageIcon,
  X,
} from 'lucide-react';

type ThemePreference = 'light' | 'dark' | 'auto';
type SystemLanguage = 'ar' | 'ku' | 'en';
type ReplyLanguage = 'auto' | SystemLanguage;



type SettingsLang = 'ar' | 'ku' | 'en';

type DeliveryZone = {
  id: string;
  area: string;
  cost: string;
};

type SettingsForm = {
  owner_name: string;
  store_name: string;
  activity_type: string;
  phone: string;
  theme_preference: ThemePreference;
  language: SystemLanguage;
  cod_enabled: boolean;
  superqi_enabled: boolean;
  superqi_account_name: string;
  superqi_qr: string;
  delivery_zones: DeliveryZone[];
  delivery_notes: string;
  auto_reply_enabled: boolean;
  reply_language: ReplyLanguage;
};

const defaultForm: SettingsForm = {
  owner_name: '',
  store_name: '',
  activity_type: '',
  phone: '',
  theme_preference: 'auto',
  language: 'ar',
  cod_enabled: true,
  superqi_enabled: false,
  superqi_account_name: '',
  superqi_qr: '',
  delivery_zones: [{ id: 'zone-1', area: '', cost: '0' }],
  delivery_notes: '',
  auto_reply_enabled: true,
  reply_language: 'auto',
};

function makeId(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function FawriToggle({
  checked,
  onChange,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className={`relative h-8 w-14 shrink-0 rounded-full transition-colors duration-200 ${
        checked ? 'bg-orange-500' : 'bg-zinc-300'
      }`}
      aria-pressed={checked}
    >
      <span
        className={`absolute top-1 h-6 w-6 rounded-full bg-white shadow-md transition-all duration-200 ${
          checked ? 'right-7' : 'right-1'
        }`}
      />
    </button>
  );
}

function SelectField({
  value,
  onChange,
  options,
}: {
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <div className="relative">
      <select
        value={value}
        onChange={event => onChange(event.target.value)}
        className="h-11 w-full appearance-none rounded-xl border border-input bg-background px-4 pl-11 text-sm outline-none focus:ring-2 focus:ring-orange-500/20"
      >
        {options.map(option => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>

      <ChevronDown className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
    </div>
  );
}

function SectionCard({
  icon,
  title,
  description,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="overflow-hidden rounded-3xl border bg-card shadow-sm">
      <div className="border-b p-5">
        <div className="flex items-start gap-3 sm:gap-4">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-orange-50 text-orange-600 sm:h-11 sm:w-11">
            {icon}
          </div>

          <div className="min-w-0 flex-1">
            <h2 className="max-w-full break-words text-lg font-extrabold leading-snug text-foreground sm:text-xl">
              {title}
            </h2>

            {description && (
              <p className="mt-2 max-w-full break-words text-sm leading-7 text-muted-foreground">
                {description}
              </p>
            )}
          </div>
        </div>
      </div>

      <div className="p-5">{children}</div>
    </section>
  );
}

export default function SettingsPage() {
  const [isChangePasswordOpen, setIsChangePasswordOpen] = useState(false);
  const { t, lang, setLang, dir } = useI18n();

  const languageOptions = [
    { value: 'ar', label: t.settings_arabic },
    { value: 'ku', label: t.settings_kurdish },
    { value: 'en', label: t.settings_english },
  ];

  const replyLanguageOptions = [
    { value: 'auto', label: t.settings_customerLanguage },
    { value: 'ar', label: t.settings_arabicOnly },
    { value: 'ku', label: t.settings_kurdishOnly },
    { value: 'en', label: t.settings_englishOnly },
  ];

  const themeOptions = [
    { value: 'light', label: t.settings_light },
    { value: 'dark', label: t.settings_dark },
    { value: 'auto', label: t.settings_auto },
  ];
  const { setTheme } = useTheme();
  const merchant = getCurrentMerchant();
  const merchantId = merchant?.id || '';
  const superQiQrInputRef = useRef<HTMLInputElement | null>(null);

  const [formData, setFormData] = useState<SettingsForm>(defaultForm);

  useEffect(() => {
    if (!merchant) return;

    const oldAreas = String(merchant.delivery_areas || '')
      .split(',')
      .map(area => area.trim())
      .filter(Boolean);

    const savedZones = Array.isArray(merchant.delivery_zones)
      ? (merchant.delivery_zones as DeliveryZone[])
      : [];

    const fallbackZones =
      savedZones.length > 0
        ? savedZones
        : oldAreas.length > 0
          ? oldAreas.map((area, index) => ({
              id: `zone-${index + 1}`,
              area,
              cost: String(merchant.delivery_cost ?? '0'),
            }))
          : [{ id: 'zone-1', area: '', cost: '0' }];

    setFormData({
      owner_name: merchant.owner_name || '',
      store_name: merchant.store_name || '',
      activity_type: merchant.activity_type || '',
      phone: merchant.phone || '',
      theme_preference: (merchant.theme_preference || 'auto') as ThemePreference,
      language: (merchant.language || 'ar') as SystemLanguage,
      cod_enabled: merchant.cod_enabled !== false,
      superqi_enabled: Boolean(merchant.superqi_enabled),
      superqi_account_name: merchant.superqi_account_name || '',
      superqi_qr: merchant.superqi_qr || '',
      delivery_zones: fallbackZones,
      delivery_notes: merchant.delivery_notes || '',
      auto_reply_enabled: merchant.auto_reply_enabled !== false,
      reply_language: merchant.reply_language || 'auto',
    });
  }, [merchantId]);

  if (!merchant) return null;

  const updateForm = <K extends keyof SettingsForm>(
    field: K,
    value: SettingsForm[K]
  ) => {
    setFormData(current => ({
      ...current,
      [field]: value,
    }));
  };

  const updateCurrentMerchant = (updates: Record<string, unknown>) => {
    const merchants = getMerchants();

    const updatedMerchants = merchants.map(item =>
      item.id === merchant.id
        ? {
            ...item,
            ...updates,
          }
        : item
    );

    saveMerchants(updatedMerchants);
  };

  const handleSuperQiQrUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';

    if (!file) return;

    if (!file.type.startsWith('image/')) {
      toast.error(t.settings_invalidQrImage);
      return;
    }

    const maxSizeInBytes = 2 * 1024 * 1024;

    if (file.size > maxSizeInBytes) {
      toast.error(t.settings_qrTooLarge);
      return;
    }

    const reader = new FileReader();

    reader.onload = () => {
      const result = String(reader.result || '');

      if (!result.startsWith('data:image/')) {
        toast.error(t.settings_invalidQrImage);
        return;
      }

      updateForm('superqi_qr', result);
      toast.success(t.settings_qrUploaded);
    };

    reader.onerror = () => {
      toast.error(t.settings_qrReadFailed);
    };

    reader.readAsDataURL(file);
  };

  const removeSuperQiQr = () => {
    updateForm('superqi_qr', '');
    toast.success(t.settings_qrRemoved);
  };

  const updateDeliveryZone = (
    id: string,
    field: keyof DeliveryZone,
    value: string
  ) => {
    setFormData(current => ({
      ...current,
      delivery_zones: current.delivery_zones.map(zone =>
        zone.id === id ? { ...zone, [field]: value } : zone
      ),
    }));
  };

  const addDeliveryZone = () => {
    setFormData(current => ({
      ...current,
      delivery_zones: [
        ...current.delivery_zones,
        { id: makeId('zone'), area: '', cost: '0' },
      ],
    }));
  };

  const removeDeliveryZone = (id: string) => {
    setFormData(current => {
      const nextZones = current.delivery_zones.filter(zone => zone.id !== id);

      return {
        ...current,
        delivery_zones:
          nextZones.length > 0
            ? nextZones
            : [{ id: makeId('zone'), area: '', cost: '0' }],
      };
    });
  };

  const handleSaveStoreInfo = (event: React.FormEvent) => {
    event.preventDefault();

    if (!formData.owner_name.trim()) {
      toast.error(t.settings_ownerRequired);
      return;
    }

    if (!formData.store_name.trim()) {
      toast.error(t.settings_storeRequired);
      return;
    }

    if (!formData.activity_type.trim()) {
      toast.error(t.settings_activityRequired);
      return;
    }

    updateCurrentMerchant({
      owner_name: formData.owner_name.trim(),
      store_name: formData.store_name.trim(),
      activity_type: formData.activity_type.trim(),
    });

    toast.success(t.settings_storeInfoSaved);
  };

  const handleSavePreferences = (event: React.FormEvent) => {
    event.preventDefault();

    updateCurrentMerchant({
      theme_preference: formData.theme_preference,
      language: formData.language,
    });

    setTheme(formData.theme_preference);

    if (formData.language !== lang) {
      setLang(formData.language);
    }

    toast.success(t.settings_preferencesSaved);
  };

  const handleSaveOperations = (event: React.FormEvent) => {
    event.preventDefault();

    const cleanZones = formData.delivery_zones
      .map(zone => ({
        ...zone,
        area: zone.area.trim(),
        cost: String(Number(zone.cost || 0)),
      }))
      .filter(zone => zone.area.length > 0);

    if (cleanZones.length === 0) {
      toast.error(t.settings_deliveryZoneRequired);
      return;
    }

    for (const zone of cleanZones) {
      const cost = Number(zone.cost);

      if (Number.isNaN(cost) || cost < 0) {
        toast.error(`${t.settings_invalidDeliveryCost}: ${zone.area}`);
        return;
      }
    }

    if (formData.superqi_enabled && !formData.superqi_qr) {
      toast.error(t.settings_actionFailed);
      return;
    }

    updateCurrentMerchant({
      cod_enabled: formData.cod_enabled,
      superqi_enabled: formData.superqi_enabled,
      superqi_account_name: formData.superqi_account_name.trim(),
      superqi_qr: formData.superqi_qr,
      delivery_zones: cleanZones,
      delivery_areas: cleanZones.map(zone => zone.area).join(', '),
      delivery_cost: cleanZones[0]?.cost || '0',
      delivery_notes: formData.delivery_notes.trim(),
      auto_reply_enabled: formData.auto_reply_enabled,
      reply_language: formData.reply_language,
    });

    setFormData(current => ({
      ...current,
      delivery_zones: cleanZones,
      superqi_account_name: current.superqi_account_name.trim(),
    }));

    toast.success(t.settings_operationsSaved);
  };

  return (
    <div className="min-h-screen bg-background p-4 pb-28" dir={dir}>
      <div className="mx-auto max-w-5xl space-y-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h1 className="text-3xl font-extrabold tracking-tight text-foreground">{t.settings_pageTitle}</h1>
            <p className="mt-1 text-sm leading-6 text-muted-foreground">{t.settings_pageDesc}</p>
          </div>

          <Badge
            variant="outline"
            className="rounded-full border-orange-200 bg-orange-50 px-3 py-1 text-orange-700"
          >
            <Settings className="ml-1 h-4 w-4" />{t.settings_brand}</Badge>
        </div>

        <div className="grid gap-5">
          <SectionCard
            icon={<Store className="h-5 w-5" />}
            title={t.settings_storeInfoTitle}
            description={t.settings_storeInfoDesc}
          >
            <form onSubmit={handleSaveStoreInfo} className="space-y-5">
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div>
                  <Label className="mb-1 block text-sm font-semibold">{t.settings_ownerName}</Label>
                  <Input
                    value={formData.owner_name}
                disabled
                    onChange={event => updateForm('owner_name', event.target.value)}
                    className="h-11 rounded-xl bg-muted text-muted-foreground"
                    required
                  />
                </div>

                <div>
                  <Label className="mb-1 block text-sm font-semibold">{t.settings_storeName}</Label>
                  <Input
                    value={formData.store_name}
                disabled
                    onChange={event => updateForm('store_name', event.target.value)}
                    className="h-11 rounded-xl bg-muted text-muted-foreground"
                    required
                  />
                </div>

                <div>
                  <Label className="mb-1 block text-sm font-semibold">{t.settings_activityType}</Label>
                  <Input
                    value={formData.activity_type}
                disabled
                    onChange={event =>
                      updateForm('activity_type', event.target.value)
                    }
                    placeholder={t.settings_activityTypePlaceholder}
                    className="h-11 rounded-xl bg-muted text-muted-foreground"
                    required
                  />
                </div>
              <div className="rounded-2xl border border-orange-200 bg-orange-50/70 p-4 text-sm leading-6 text-orange-900">{t.settings_lockedStoreInfo}</div>
              <Button type="button" variant="outline" className="h-11 w-full rounded-xl border-orange-200 bg-white font-bold text-orange-700 hover:bg-orange-50" onClick={() => toast.info(t.settings_requestSent)}>{t.settings_requestStoreInfoChange}</Button>

                <div>
                  <Label className="mb-1 block text-sm font-semibold">{t.settings_phone}</Label>
                  <div className="relative">
                    <Phone className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      value={formData.phone}
                      disabled
                      dir="ltr"
                      className="h-11 rounded-xl bg-muted pr-10 text-left"
                    />
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">{t.settings_phoneLockedInfo}</p>
                </div>
              </div>

              <div className="rounded-2xl border bg-muted/30 p-4 space-y-3">
              <div>
                <h3 className="min-w-0 break-words text-base font-extrabold leading-snug">{t.settings_accountSecurity}</h3>
                <p className="mt-1 text-sm leading-6 text-muted-foreground">{t.settings_accountSecurityDesc}</p>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <Button
                  type="button"
                  variant="outline"
                  className="h-12 rounded-xl bg-orange-500 px-5 text-base font-extrabold text-white shadow-md transition hover:bg-orange-600"
                  onClick={() => {
                    setIsChangePasswordOpen(true);
                  }}
                >{t.settings_changePassword}</Button>

                <Button
                  type="button"
                  variant="outline"
                  className="h-12 rounded-xl border border-blue-200 bg-blue-50 px-5 text-base font-extrabold text-blue-700 shadow-sm transition hover:bg-blue-100"
                  onClick={() => {
                    toast.success(t.settings_requestSent);
                  }}
                >{t.settings_requestPhoneChange}</Button>
              </div>

              <p className="text-xs leading-6 text-muted-foreground">{t.settings_securityNote}</p>
            </div>

            <div className="flex justify-end border-t pt-4">
                <Button
                  type="submit"
                  className="h-11 rounded-xl bg-orange-500 px-6 font-bold text-white hover:bg-orange-600"
                >
                  <Save className="ml-2 h-4 w-4" />
                  {t.settings_saveStoreInfo}
                </Button>
              </div>
            </form>
          </SectionCard>
      <ChangePasswordModal open={isChangePasswordOpen} onClose={() => setIsChangePasswordOpen(false)} phone={formData.phone} />

          <SectionCard
            icon={<Palette className="h-5 w-5" />}
            title={t.settings_preferencesTitle}
            description={t.settings_preferencesDesc}
          >
            <form onSubmit={handleSavePreferences} className="space-y-5">
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div>
                  <Label className="mb-1 block text-sm font-semibold">{t.settings_language}</Label>
                  <SelectField
                    value={formData.language}
                    onChange={value => updateForm('language', value as SystemLanguage)}
                    options={languageOptions}
                  />
                </div>

                <div>
                  <Label className="mb-1 block text-sm font-semibold">{t.settings_appearance}</Label>
                  <SelectField
                    value={formData.theme_preference}
                    onChange={value =>
                      updateForm('theme_preference', value as ThemePreference)
                    }
                    options={themeOptions}
                  />
                </div>
              </div>

              <div className="flex justify-end border-t pt-4">
                <Button
                  type="submit"
                  className="h-11 rounded-xl bg-orange-500 px-6 font-bold text-white hover:bg-orange-600"
                >
                  <Save className="ml-2 h-4 w-4" />
                  {t.settings_savePreferences}
                </Button>
              </div>
            </form>
          </SectionCard>

          <SectionCard
            icon={<CreditCard className="h-5 w-5" />}
            title={t.settings_operationsTitle}
          description={t.settings_operationsDesc}
          >
            <form onSubmit={handleSaveOperations} className="space-y-6">
              <div className="space-y-4">
                <h3 className="min-w-0 break-words text-lg font-extrabold leading-snug">{t.settings_superqiTitle}</h3>

                <div className="flex items-center justify-between gap-4 rounded-2xl border bg-muted/20 p-4">
                  <div>
                    <p className="break-words text-sm font-bold leading-6">{t.settings_codTitle}</p>
                    <p className="mt-1 break-words text-xs leading-6 text-muted-foreground">{t.settings_codDesc}</p>
                  </div>

                  <FawriToggle
                    checked={formData.cod_enabled}
                    onChange={checked => updateForm('cod_enabled', checked)}
                  />
                </div>

                <div className="rounded-2xl border bg-muted/20 p-4">
                  <div className="flex items-center justify-between gap-4">
                    <div>
                      <p className="break-words text-sm font-bold leading-6">{t.settings_superqiTitle}</p>
                      <p className="mt-1 break-words text-xs leading-6 text-muted-foreground">{t.settings_superqiDesc}</p>
                    </div>

                    <FawriToggle
                      checked={formData.superqi_enabled}
                      onChange={checked => updateForm('superqi_enabled', checked)}
                    />
                  </div>

                  {formData.superqi_enabled && (
                    <div className="mt-4 space-y-4">
                      <div>
                        <Label className="mb-1 block text-sm font-semibold">{t.settings_superqiAccountName}</Label>
                        <Input
                          value={formData.superqi_account_name}
                          onChange={event =>
                            updateForm('superqi_account_name', event.target.value)
                          }
                          placeholder={t.settings_superqiAccountPlaceholder}
                          className="h-11 rounded-xl"
                        />
                      </div>

                      <input
                        ref={superQiQrInputRef}
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={handleSuperQiQrUpload}
                      />

                      <div className="rounded-2xl border bg-background p-4">
                        <div className="mb-3 flex items-center justify-between gap-3">
                          <div>
                            <p className="break-words text-sm font-bold leading-6">{t.settings_superqiQrTitle}</p>
                            <p className="mt-1 break-words text-xs leading-6 text-muted-foreground">{t.settings_superqiQrDesc}</p>
                          </div>

                          <ImageIcon className="h-5 w-5 shrink-0 text-orange-600" />
                        </div>

                        {formData.superqi_qr ? (
                          <div className="space-y-3">
                            <div className="flex justify-center rounded-2xl bg-white p-4">
                              <img
                                src={formData.superqi_qr}
                                alt="SuperQi QR"
                                className="max-h-56 rounded-xl object-contain"
                              />
                            </div>

                            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                              <Button
                                type="button"
                                variant="outline"
                                onClick={() => superQiQrInputRef.current?.click()}
                  >
                    <Upload className="ml-2 h-4 w-4" />
              {formData.superqi_qr ? t.settings_changeQr : t.settings_uploadQr}
            </Button>

                              <Button
                                type="button"
                                variant="destructive"
                                onClick={removeSuperQiQr}
                                className="h-11 rounded-xl font-bold"
                              >
                                <X className="ml-2 h-4 w-4" />{t.settings_removeQr}</Button>
                            </div>
                          </div>
                        ) : (
                          <Button
                            type="button"
                            variant="outline"
                            onClick={() => superQiQrInputRef.current?.click()}
                            className="h-11 w-full rounded-xl font-bold"
                          >
                            <Upload className="ml-2 h-4 w-4" />{t.settings_uploadQr}</Button>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </div>

              <div className="space-y-4 border-t pt-5">
                <div className="flex min-w-0 flex-wrap items-center gap-2">
                  <Truck className="h-5 w-5 shrink-0 text-orange-600" />
                  <h3 className="min-w-0 break-words text-lg font-extrabold leading-snug">{t.settings_deliveryAreasTitle}</h3>
                </div>

                <div className="space-y-3">
                  {formData.delivery_zones.map((zone, index) => (
                    <div
                      key={zone.id}
                      className="rounded-2xl border bg-muted/20 p-4"
                    >
                      <div className="mb-3 flex items-center justify-between">
                        <p className="break-words text-sm font-bold leading-6">{t.settings_deliveryAreaPrefix}{index + 1}</p>

                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          onClick={() => removeDeliveryZone(zone.id)}
                          className="h-9 w-9 rounded-xl text-destructive hover:bg-destructive/10"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>

                      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                        <div>
                          <Label className="mb-1 block text-sm font-semibold">{t.settings_areaName}</Label>
                          <Input
                            value={zone.area}
                            onChange={event =>
                              updateDeliveryZone(zone.id, 'area', event.target.value)
                            }
                            placeholder={t.settings_areaPlaceholder}
                            className="h-11 rounded-xl"
                          />
                        </div>

                        <div>
                          <Label className="mb-1 block text-sm font-semibold">{t.settings_deliveryCost}</Label>
                          <Input
                            type="number"
                            dir="ltr"
                            value={zone.cost}
                            onChange={event =>
                              updateDeliveryZone(zone.id, 'cost', event.target.value)
                            }
                            placeholder={t.settings_deliveryCostPlaceholder}
                            className="h-11 rounded-xl"
                          />
                        </div>
                      </div>
                    </div>
                  ))}

                  <Button
                    type="button"
                    variant="outline"
                    onClick={addDeliveryZone}
                    className="h-11 w-full rounded-xl font-bold"
                  >
                    <Plus className="ml-2 h-4 w-4" />
                    {t.settings_addArea}
                  </Button>
                </div>

                <div>
                  <Label className="mb-1 block text-sm font-semibold">{t.settings_deliveryNotes}</Label>
                  <Textarea
                    value={formData.delivery_notes}
                    onChange={event =>
                      updateForm('delivery_notes', event.target.value)
                    }
                    placeholder={t.settings_deliveryNotesPlaceholder}
                    rows={3}
                    className="rounded-xl"
                  />
                </div>
              </div>

              <div className="space-y-4 border-t pt-5">
                <div className="flex min-w-0 flex-wrap items-center gap-2">
                  <Bot className="h-5 w-5 shrink-0 text-orange-600" />
                  <h3 className="min-w-0 break-words text-lg font-extrabold leading-snug">{t.settings_autoReplyTitle}</h3>
                </div>

                <div className="flex items-center justify-between gap-4 rounded-2xl border bg-muted/20 p-4">
                  <div>
                    <p className="break-words text-sm font-bold leading-6">{t.settings_autoReplyStatus}</p>
                    <p className="mt-1 break-words text-xs leading-6 text-muted-foreground">{t.settings_autoReplyDesc}</p>
                  </div>

                  <FawriToggle
                    checked={formData.auto_reply_enabled}
                    onChange={checked => updateForm('auto_reply_enabled', checked)}
                  />
                </div>

                <div>
                  <Label className="mb-1 block text-sm font-semibold">{t.settings_replyLanguage}</Label>
                  <SelectField
                    value={formData.reply_language}
                    onChange={value =>
                      updateForm('reply_language', value as ReplyLanguage)
                    }
                    options={replyLanguageOptions}
                  />
                </div>
              </div>

              <div className="flex justify-end border-t pt-4">
                <Button
                  type="submit"
                  className="h-11 rounded-xl bg-orange-500 px-6 font-bold text-white hover:bg-orange-600"
                >
                  <Save className="ml-2 h-4 w-4" />
                  {t.settings_saveOperations}
                </Button>
              </div>
            </form>
          </SectionCard>
        </div>
      </div>
    </div>
  );
}