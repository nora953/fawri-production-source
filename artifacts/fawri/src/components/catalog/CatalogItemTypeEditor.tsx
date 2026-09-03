import { Bot, BriefcaseBusiness, Boxes, CalendarClock, MapPin, Package, SlidersHorizontal } from 'lucide-react';

import { Input } from '@/components/ui/input';
import type { Lang } from '@/lib/types';
import type { CatalogProductFormState } from '@/lib/catalogProductEditor';
import { CATALOG_ITEM_TYPE_COPY } from '@/lib/translations/features/catalog/catalogEditorCopy';
import type {
  CatalogItemType,
  CatalogServiceLocationChoice,
  CatalogServiceLocationMode,
  CatalogServicePriceType,
} from '@/lib/catalogUiApi';


function Toggle({ checked, onChange }: { checked: boolean; onChange: (value: boolean) => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={`relative h-7 w-12 shrink-0 rounded-full transition ${checked ? 'bg-orange-500' : 'bg-muted-foreground/30'}`}
    >
      <span className={`absolute top-1 h-5 w-5 rounded-full bg-white shadow transition ${checked ? 'end-1' : 'start-1'}`} />
    </button>
  );
}

function SettingRow({
  icon,
  title,
  hint,
  checked,
  onChange,
}: {
  icon: React.ReactNode;
  title: string;
  hint: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <div className="flex items-start justify-between gap-3 py-2 first:pt-0 last:pb-0">
      <div className="min-w-0">
        <div className="flex items-center gap-2 text-sm font-bold">{icon}{title}</div>
        <p className="mt-1 text-xs leading-5 text-muted-foreground">{hint}</p>
      </div>
      <Toggle checked={checked} onChange={onChange} />
    </div>
  );
}

export function CatalogItemTypeEditor({
  lang,
  form,
  onChange,
}: {
  lang: Lang;
  form: CatalogProductFormState;
  onChange: (patch: Partial<CatalogProductFormState>) => void;
}) {
  const copy = CATALOG_ITEM_TYPE_COPY[lang] || CATALOG_ITEM_TYPE_COPY.en;
  const concreteServiceLocations: Array<{ value: CatalogServiceLocationChoice; label: string }> = [
    { value: 'merchant', label: copy.locationMerchant },
    { value: 'customer', label: copy.locationCustomer },
    { value: 'online', label: copy.locationOnline },
  ];

  const chooseServiceLocationMode = (mode: CatalogServiceLocationMode) => {
    if (mode !== 'flexible') {
      onChange({ service_location_mode: mode, service_location_modes: [mode] });
      return;
    }
    const current = (form.service_location_modes || []).filter(choice =>
      concreteServiceLocations.some(location => location.value === choice),
    );
    const next = [...new Set(current)];
    if (next.length < 2) {
      const preferred: CatalogServiceLocationChoice = form.service_location_mode !== 'flexible'
        ? form.service_location_mode
        : 'merchant';
      if (!next.includes(preferred)) next.push(preferred);
      const fallback = concreteServiceLocations.find(location => !next.includes(location.value));
      if (fallback) next.push(fallback.value);
    }
    onChange({ service_location_mode: 'flexible', service_location_modes: next });
  };

  const toggleServiceLocation = (choice: CatalogServiceLocationChoice) => {
    const current = (form.service_location_modes || []).filter(item =>
      concreteServiceLocations.some(location => location.value === item),
    );
    if (current.includes(choice)) {
      if (current.length <= 2) return;
      onChange({ service_location_mode: 'flexible', service_location_modes: current.filter(item => item !== choice) });
      return;
    }
    onChange({ service_location_mode: 'flexible', service_location_modes: [...current, choice] });
  };

  const chooseType = (itemType: CatalogItemType) => {
    if (itemType === form.item_type) return;
    if (itemType === 'service') {
      onChange({
        item_type: 'service',
        status: form.status === 'low_stock' ? 'available' : form.status,
      });
      return;
    }
    onChange({ item_type: 'product' });
  };

  const serviceDetails = form.item_type === 'service' ? (
    <div
      data-catalog-service-details="true"
      data-service-price-type={form.service_price_type}
      className={lang === 'ar'
        ? 'w-full min-w-0 space-y-4 rounded-2xl border bg-muted/10 p-4'
        : 'space-y-4 rounded-xl border bg-background p-4'}
    >
      <div>
        <div className="flex items-center gap-2 text-sm font-bold"><CalendarClock className="h-4 w-4" />{copy.serviceDetails}</div>
        <p className="mt-1 text-xs leading-5 text-muted-foreground">{copy.serviceDetailsHint}</p>
      </div>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <label className="space-y-1 text-sm font-semibold">
          <span>{copy.duration}</span>
          <Input type="number" min={1} max={1440} dir="ltr" value={form.service_duration_minutes} onChange={event => onChange({ service_duration_minutes: event.target.value })} placeholder="60" className="h-10 rounded-xl" />
          <span className="block text-xs font-normal text-muted-foreground">{copy.durationHint}</span>
        </label>
        <label className="space-y-1 text-sm font-semibold">
          <span>{copy.buffer}</span>
          <Input type="number" min={0} max={480} dir="ltr" value={form.service_buffer_minutes} onChange={event => onChange({ service_buffer_minutes: event.target.value })} placeholder="0" className="h-10 rounded-xl" />
          <span className="block text-xs font-normal text-muted-foreground">{copy.bufferHint}</span>
        </label>
        <label className="space-y-1 text-sm font-semibold">
          <span>{copy.priceType}</span>
          <select value={form.service_price_type} onChange={event => onChange({ service_price_type: event.target.value as CatalogServicePriceType })} className="h-10 w-full rounded-xl border border-input bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-orange-500/20">
            <option value="fixed">{copy.priceFixed}</option>
            <option value="from">{copy.priceFrom}</option>
            <option value="free">{copy.priceFree}</option>
            <option value="custom">{copy.priceCustom}</option>
          </select>
        </label>
        <div className="space-y-1 text-sm font-semibold">
          <span className="flex items-center gap-2"><MapPin className="h-4 w-4" />{copy.location}</span>
          <select value={form.service_location_mode} onChange={event => chooseServiceLocationMode(event.target.value as CatalogServiceLocationMode)} className="h-10 w-full rounded-xl border border-input bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-orange-500/20">
            <option value="merchant">{copy.locationMerchant}</option>
            <option value="customer">{copy.locationCustomer}</option>
            <option value="online">{copy.locationOnline}</option>
            <option value="flexible">{copy.locationFlexible}</option>
          </select>
          {form.service_location_mode === 'flexible' && (
            <div className="space-y-2 rounded-xl border bg-background p-2.5">
              <p className="text-xs font-normal leading-5 text-muted-foreground">{copy.locationFlexibleHint}</p>
              <div className="flex flex-wrap gap-2">
                {concreteServiceLocations.map(location => {
                  const selected = (form.service_location_modes || []).includes(location.value);
                  return (
                    <button
                      key={location.value}
                      type="button"
                      aria-pressed={selected}
                      onClick={() => toggleServiceLocation(location.value)}
                      className={`rounded-lg border px-3 py-2 text-xs font-semibold transition ${selected ? 'border-orange-400 bg-orange-50 text-orange-800' : 'bg-background text-muted-foreground hover:bg-muted/40'}`}
                    >
                      {location.label}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="flex items-start justify-between gap-4 rounded-xl border bg-background p-3">
        <div>
          <p className="text-sm font-bold">{copy.bookingRequired}</p>
          <p className="mt-1 max-w-xl text-xs leading-5 text-muted-foreground">{copy.bookingRequiredHint}</p>
        </div>
        <Toggle checked={form.service_booking_required} onChange={service_booking_required => onChange({ service_booking_required })} />
      </div>
    </div>
  ) : null;

  return (
    <>
      <div data-catalog-item-type-editor="true" className="w-full min-w-0 space-y-3 rounded-2xl border bg-muted/10 p-4">
        <div>
          <p className="text-sm font-bold">{copy.chooseType}</p>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">{copy.chooseTypeHint}</p>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <button
            type="button"
            aria-pressed={form.item_type === 'product'}
            onClick={() => chooseType('product')}
            className={`h-full rounded-2xl border p-3 text-start transition ${form.item_type === 'product' ? 'border-orange-400 bg-orange-50 ring-2 ring-orange-500/10' : 'bg-background hover:bg-muted/30'}`}
          >
            <div className="flex items-center gap-2 font-bold"><Package className="h-5 w-5" />{copy.product}</div>
            <p className="mt-1.5 text-xs leading-5 text-muted-foreground">{copy.productHint}</p>
          </button>

          <button
            type="button"
            aria-pressed={form.item_type === 'service'}
            onClick={() => chooseType('service')}
            className={`h-full rounded-2xl border p-3 text-start transition ${form.item_type === 'service' ? 'border-orange-400 bg-orange-50 ring-2 ring-orange-500/10' : 'bg-background hover:bg-muted/30'}`}
          >
            <div className="flex items-center gap-2 font-bold"><BriefcaseBusiness className="h-5 w-5" />{copy.service}</div>
            <p className="mt-1.5 text-xs leading-5 text-muted-foreground">{copy.serviceHint}</p>
          </button>

          <div className="h-full rounded-2xl border bg-background p-3 sm:col-span-2 lg:col-span-1">
            <div className="flex items-center gap-2 text-sm font-bold"><SlidersHorizontal className="h-4 w-4" />{copy.itemSettings}</div>
            <p className="mt-1 text-xs text-muted-foreground">{copy.itemSettingsHint}</p>
            <div className="mt-2 divide-y">
              {form.item_type === 'product' && (
                <SettingRow
                  icon={<Boxes className="h-4 w-4" />}
                  title={copy.trackInventory}
                  hint={copy.trackInventoryHint}
                  checked={form.track_inventory}
                  onChange={track_inventory => onChange({ track_inventory })}
                />
              )}
              <SettingRow
                icon={<Bot className="h-4 w-4" />}
                title={copy.fawriReplies}
                hint={copy.fawriRepliesHint}
                checked={form.allow_fawri_reply}
                onChange={allow_fawri_reply => onChange({ allow_fawri_reply })}
              />
            </div>
          </div>
        </div>

        {lang !== 'ar' && serviceDetails}
      </div>

      {lang === 'ar' && serviceDetails}
    </>
  );
}

export default CatalogItemTypeEditor;
