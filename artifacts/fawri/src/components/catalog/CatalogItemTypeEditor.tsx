import { BriefcaseBusiness, Boxes, CalendarClock, MapPin, Package } from 'lucide-react';

import { Input } from '@/components/ui/input';
import type { Lang } from '@/lib/types';
import type { CatalogProductFormState } from '@/lib/catalogProductEditor';
import type {
  CatalogItemType,
  CatalogServiceLocationMode,
  CatalogServicePriceType,
} from '@/lib/catalogUiApi';

type Copy = {
  chooseType: string;
  chooseTypeHint: string;
  product: string;
  productHint: string;
  service: string;
  serviceHint: string;
  trackInventory: string;
  trackInventoryHint: string;
  serviceDetails: string;
  serviceDetailsHint: string;
  duration: string;
  durationHint: string;
  buffer: string;
  bufferHint: string;
  bookingRequired: string;
  bookingRequiredHint: string;
  priceType: string;
  priceFixed: string;
  priceFrom: string;
  priceFree: string;
  priceCustom: string;
  location: string;
  locationMerchant: string;
  locationCustomer: string;
  locationOnline: string;
  locationFlexible: string;
};

const COPY: Record<Lang, Copy> = {
  ar: {
    chooseType: 'نوع العنصر',
    chooseTypeHint: 'اختر ما إذا كنت تضيف منتجًا يباع بالمخزون أو خدمة يقدمها نشاطك.',
    product: 'منتج',
    productHint: 'سلعة يمكن بيعها وتتبع مخزونها وباركودها ومتغيراتها.',
    service: 'خدمة',
    serviceHint: 'خدمة يمكن لفوري شرحها والمساعدة في طلبها أو حجزها.',
    trackInventory: 'تتبع المخزون',
    trackInventoryHint: 'فعّلها عندما تريد أن يعتمد توفر المنتج على مخزون فوري أو الكاشير المرتبط.',
    serviceDetails: 'تفاصيل الخدمة',
    serviceDetailsHint: 'هذه المعلومات تساعد فوري على إعطاء العميل تفاصيل دقيقة عن الخدمة.',
    duration: 'مدة الخدمة بالدقائق',
    durationHint: 'اختياري، من دقيقة واحدة إلى 24 ساعة.',
    buffer: 'وقت فاصل بعد الخدمة (دقيقة)',
    bufferHint: 'اختياري، ويستخدم لاحقًا عند إدارة الحجوزات.',
    bookingRequired: 'تحتاج إلى حجز',
    bookingRequiredHint: 'فعّلها إذا كان العميل يحتاج إلى طلب موعد أو حجز الخدمة مسبقًا.',
    priceType: 'طريقة عرض السعر',
    priceFixed: 'سعر ثابت',
    priceFrom: 'يبدأ من',
    priceFree: 'مجاني',
    priceCustom: 'حسب الطلب',
    location: 'مكان تقديم الخدمة',
    locationMerchant: 'في موقع التاجر',
    locationCustomer: 'عند العميل',
    locationOnline: 'أونلاين',
    locationFlexible: 'مرن / أكثر من خيار',
  },
  ku: {
    chooseType: 'جۆری بابەت',
    chooseTypeHint: 'دیاری بکە بەرهەمێکی کۆگاییە یان خزمەتگوزارییەکە.',
    product: 'بەرهەم',
    productHint: 'کاڵایەک بۆ فرۆشتن و بەدواداچوونی کۆگا و بارکۆد و جۆراوجۆری.',
    service: 'خزمەتگوزاری',
    serviceHint: 'خزمەتگوزارییەک کە فەوری دەتوانێت ڕوونی بکاتەوە و بۆ داواکاری یان حجز یارمەتی بدات.',
    trackInventory: 'بەدواداچوونی کۆگا',
    trackInventoryHint: 'چالاکی بکە ئەگەر بەردەستبوون دەبێت بە کۆگای فەوری یان POS پەیوەست بێت.',
    serviceDetails: 'وردەکاریی خزمەتگوزاری',
    serviceDetailsHint: 'ئەم زانیارییانە یارمەتی فەوری دەدەن وەڵامی ورد بدات.',
    duration: 'ماوەی خزمەتگوزاری بە خولەک',
    durationHint: 'ئارەزوومەندانە، لە 1 خولەک تا 24 کاتژمێر.',
    buffer: 'ماوەی نێوان دوای خزمەتگوزاری (خولەک)',
    bufferHint: 'ئارەزوومەندانە، دواتر لە حجزەکان بەکاردێت.',
    bookingRequired: 'پێویستی بە حجز هەیە',
    bookingRequiredHint: 'ئەگەر کڕیار پێویستی بە کات یان حجز پێشتر هەیە چالاکی بکە.',
    priceType: 'شێوازی نیشاندانی نرخ',
    priceFixed: 'نرخی جێگیر',
    priceFrom: 'دەستپێدەکات لە',
    priceFree: 'بەخۆڕایی',
    priceCustom: 'بەپێی داواکاری',
    location: 'شوێنی خزمەتگوزاری',
    locationMerchant: 'لە شوێنی بازرگان',
    locationCustomer: 'لە شوێنی کڕیار',
    locationOnline: 'ئۆنلاین',
    locationFlexible: 'نەرم / چەند هەڵبژاردە',
  },
  en: {
    chooseType: 'Item type',
    chooseTypeHint: 'Choose whether this is an inventory product or a service your business provides.',
    product: 'Product',
    productHint: 'A sellable item with optional inventory, barcode, and variants.',
    service: 'Service',
    serviceHint: 'A service Fawri can explain and help customers request or book.',
    trackInventory: 'Track inventory',
    trackInventoryHint: 'Enable when product availability should follow Fawri or connected POS inventory.',
    serviceDetails: 'Service details',
    serviceDetailsHint: 'These facts help Fawri answer service questions accurately.',
    duration: 'Service duration (minutes)',
    durationHint: 'Optional, from 1 minute up to 24 hours.',
    buffer: 'Buffer after service (minutes)',
    bufferHint: 'Optional and ready for future booking availability.',
    bookingRequired: 'Booking required',
    bookingRequiredHint: 'Enable when customers should request an appointment or booking first.',
    priceType: 'Price display',
    priceFixed: 'Fixed price',
    priceFrom: 'Starts from',
    priceFree: 'Free',
    priceCustom: 'Custom / on request',
    location: 'Service location',
    locationMerchant: 'Merchant location',
    locationCustomer: 'Customer location',
    locationOnline: 'Online',
    locationFlexible: 'Flexible / multiple options',
  },
};

export function CatalogItemTypeEditor({
  lang,
  form,
  onChange,
}: {
  lang: Lang;
  form: CatalogProductFormState;
  onChange: (patch: Partial<CatalogProductFormState>) => void;
}) {
  const copy = COPY[lang] || COPY.en;

  const chooseType = (itemType: CatalogItemType) => {
    if (itemType === 'service') {
      onChange({
        item_type: 'service',
        track_inventory: false,
        quantity: '0',
        variants: [],
        sku: '',
        barcode: '',
        weight_kg: '',
        length_cm: '',
        width_cm: '',
        height_cm: '',
      });
      return;
    }
    onChange({ item_type: 'product', track_inventory: true });
  };

  return (
    <div className="space-y-4 rounded-2xl border bg-muted/10 p-4">
      <div>
        <p className="text-sm font-bold">{copy.chooseType}</p>
        <p className="mt-1 text-xs leading-5 text-muted-foreground">{copy.chooseTypeHint}</p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <button
          type="button"
          aria-pressed={form.item_type === 'product'}
          onClick={() => chooseType('product')}
          className={`rounded-2xl border p-4 text-start transition ${
            form.item_type === 'product'
              ? 'border-orange-400 bg-orange-50 ring-2 ring-orange-500/10'
              : 'bg-background hover:bg-muted/30'
          }`}
        >
          <div className="flex items-center gap-2 font-bold">
            <Package className="h-5 w-5" />
            {copy.product}
          </div>
          <p className="mt-2 text-xs leading-5 text-muted-foreground">{copy.productHint}</p>
        </button>

        <button
          type="button"
          aria-pressed={form.item_type === 'service'}
          onClick={() => chooseType('service')}
          className={`rounded-2xl border p-4 text-start transition ${
            form.item_type === 'service'
              ? 'border-orange-400 bg-orange-50 ring-2 ring-orange-500/10'
              : 'bg-background hover:bg-muted/30'
          }`}
        >
          <div className="flex items-center gap-2 font-bold">
            <BriefcaseBusiness className="h-5 w-5" />
            {copy.service}
          </div>
          <p className="mt-2 text-xs leading-5 text-muted-foreground">{copy.serviceHint}</p>
        </button>
      </div>

      {form.item_type === 'product' ? (
        <div className="flex items-start justify-between gap-4 rounded-xl border bg-background p-3">
          <div>
            <div className="flex items-center gap-2 text-sm font-bold">
              <Boxes className="h-4 w-4" />
              {copy.trackInventory}
            </div>
            <p className="mt-1 max-w-xl text-xs leading-5 text-muted-foreground">
              {copy.trackInventoryHint}
            </p>
          </div>
          <input
            type="checkbox"
            checked={form.track_inventory}
            onChange={event =>
              onChange({
                track_inventory: event.target.checked,
                ...(!event.target.checked ? { quantity: '0' } : {}),
              })
            }
            className="mt-1 h-5 w-5 accent-orange-500"
          />
        </div>
      ) : (
        <div className="space-y-4 rounded-xl border bg-background p-4">
          <div>
            <div className="flex items-center gap-2 text-sm font-bold">
              <CalendarClock className="h-4 w-4" />
              {copy.serviceDetails}
            </div>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">
              {copy.serviceDetailsHint}
            </p>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <label className="space-y-1 text-sm font-semibold">
              <span>{copy.duration}</span>
              <Input
                type="number"
                min={1}
                max={1440}
                dir="ltr"
                value={form.service_duration_minutes}
                onChange={event => onChange({ service_duration_minutes: event.target.value })}
                placeholder="60"
                className="h-10 rounded-xl"
              />
              <span className="block text-xs font-normal text-muted-foreground">
                {copy.durationHint}
              </span>
            </label>

            <label className="space-y-1 text-sm font-semibold">
              <span>{copy.buffer}</span>
              <Input
                type="number"
                min={0}
                max={480}
                dir="ltr"
                value={form.service_buffer_minutes}
                onChange={event => onChange({ service_buffer_minutes: event.target.value })}
                placeholder="0"
                className="h-10 rounded-xl"
              />
              <span className="block text-xs font-normal text-muted-foreground">
                {copy.bufferHint}
              </span>
            </label>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <label className="space-y-1 text-sm font-semibold">
              <span>{copy.priceType}</span>
              <select
                value={form.service_price_type}
                onChange={event =>
                  onChange({ service_price_type: event.target.value as CatalogServicePriceType })
                }
                className="h-10 w-full rounded-xl border border-input bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-orange-500/20"
              >
                <option value="fixed">{copy.priceFixed}</option>
                <option value="from">{copy.priceFrom}</option>
                <option value="free">{copy.priceFree}</option>
                <option value="custom">{copy.priceCustom}</option>
              </select>
            </label>

            <label className="space-y-1 text-sm font-semibold">
              <span className="flex items-center gap-2">
                <MapPin className="h-4 w-4" />
                {copy.location}
              </span>
              <select
                value={form.service_location_mode}
                onChange={event =>
                  onChange({
                    service_location_mode: event.target.value as CatalogServiceLocationMode,
                  })
                }
                className="h-10 w-full rounded-xl border border-input bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-orange-500/20"
              >
                <option value="merchant">{copy.locationMerchant}</option>
                <option value="customer">{copy.locationCustomer}</option>
                <option value="online">{copy.locationOnline}</option>
                <option value="flexible">{copy.locationFlexible}</option>
              </select>
            </label>
          </div>

          <label className="flex items-start justify-between gap-4 rounded-xl border bg-muted/10 p-3">
            <div>
              <p className="text-sm font-bold">{copy.bookingRequired}</p>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">
                {copy.bookingRequiredHint}
              </p>
            </div>
            <input
              type="checkbox"
              checked={form.service_booking_required}
              onChange={event => onChange({ service_booking_required: event.target.checked })}
              className="mt-1 h-5 w-5 accent-orange-500"
            />
          </label>
        </div>
      )}
    </div>
  );
}
