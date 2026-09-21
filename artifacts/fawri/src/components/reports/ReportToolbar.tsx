import { useEffect, useMemo, useState } from 'react';
import { CalendarDays, ChevronDown, Download, Printer } from 'lucide-react';
import type { DateRange } from 'react-day-picker';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { useI18n } from '@/lib/i18n';
import type { Lang } from '@/lib/types';

export type ReportRangeKey = 'today' | '7d' | '30d' | 'all' | 'custom';
export type AppliedDateRange = { from: string; to: string };

type ToolbarCopy = {
  today: string;
  seven: string;
  thirty: string;
  all: string;
  customRange: string;
  chooseRange: string;
  rangePickerHint: string;
  apply: string;
  cancel: string;
  invalid: string;
  download: string;
  print: string;
  presets: string;
};

const COPY: Record<Lang, ToolbarCopy> = {
  ar: {
    today: 'اليوم',
    seven: '7 أيام',
    thirty: '30 يوم',
    all: 'الكل',
    customRange: 'فترة مخصصة',
    chooseRange: 'اختيار الفترة',
    rangePickerHint: 'اختر تاريخ البداية ثم تاريخ النهاية من التقويم.',
    apply: 'تطبيق',
    cancel: 'إلغاء',
    invalid: 'اختر تاريخ البداية والنهاية أولًا.',
    download: 'تحميل Excel',
    print: 'طباعة / حفظ PDF',
    presets: 'فترات سريعة',
  },
  ku: {
    today: 'ئەمڕۆ',
    seven: '7 ڕۆژ',
    thirty: '30 ڕۆژ',
    all: 'هەموو',
    customRange: 'ماوەی تایبەت',
    chooseRange: 'هەڵبژاردنی ماوە',
    rangePickerHint: 'لە ڕۆژژمێرەکە سەرەتا بەرواری دەستپێک و پاشان کۆتایی هەڵبژێرە.',
    apply: 'جێبەجێکردن',
    cancel: 'هەڵوەشاندنەوە',
    invalid: 'سەرەتا بەرواری دەستپێک و کۆتایی هەڵبژێرە.',
    download: 'داگرتنی Excel',
    print: 'چاپ / پاشەکەوتی PDF',
    presets: 'ماوە خێراکان',
  },
  en: {
    today: 'Today',
    seven: '7 days',
    thirty: '30 days',
    all: 'All',
    customRange: 'Custom range',
    chooseRange: 'Choose date range',
    rangePickerHint: 'Choose the start date, then the end date on the calendar.',
    apply: 'Apply',
    cancel: 'Cancel',
    invalid: 'Choose both a start and end date first.',
    download: 'Download Excel',
    print: 'Print / Save PDF',
    presets: 'Quick ranges',
  },
};

function localDateValue(daysBack: number): string {
  const date = new Date();
  date.setHours(12, 0, 0, 0);
  date.setDate(date.getDate() - daysBack);
  return dateToValue(date);
}

function dateToValue(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function displayDateDayFirst(value: string): string {
  const [year, month, day] = value.split('-');
  if (!year || !month || !day) return '';
  return `${day}/${month}/${year}`;
}

function startOfLocalDay(daysBack: number): Date {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  date.setDate(date.getDate() - daysBack);
  return date;
}

function localDateStart(value: string): Date {
  const [year, month, day] = value.split('-').map(Number);
  return new Date(year, month - 1, day, 0, 0, 0, 0);
}

function localDateEndExclusive(value: string): Date {
  const date = localDateStart(value);
  date.setDate(date.getDate() + 1);
  return date;
}

function presetDateRange(range: Exclude<ReportRangeKey, 'custom'>): DateRange | undefined {
  if (range === 'all') return undefined;
  const to = localDateStart(localDateValue(0));
  if (range === 'today') return { from: to, to };
  if (range === '7d') return { from: localDateStart(localDateValue(6)), to };
  return { from: localDateStart(localDateValue(29)), to };
}

function customDateRange(value?: AppliedDateRange | null): DateRange | undefined {
  if (!value) return undefined;
  return {
    from: localDateStart(value.from),
    to: localDateStart(value.to),
  };
}

function activeRangeSummary(
  range: ReportRangeKey,
  custom: AppliedDateRange | null | undefined,
  copy: ToolbarCopy,
): { title: string; detail: string } {
  if (range === 'all') return { title: copy.all, detail: '' };
  if (range === 'custom' && custom) {
    return {
      title: copy.customRange,
      detail: `${displayDateDayFirst(custom.from)} – ${displayDateDayFirst(custom.to)}`,
    };
  }

  const label =
    range === 'today'
      ? copy.today
      : range === '7d'
        ? copy.seven
        : range === '30d'
          ? copy.thirty
          : copy.customRange;
  const dates =
    range === 'today'
      ? [localDateValue(0), localDateValue(0)]
      : range === '7d'
        ? [localDateValue(6), localDateValue(0)]
        : [localDateValue(29), localDateValue(0)];
  return {
    title: label,
    detail:
      dates[0] === dates[1]
        ? displayDateDayFirst(dates[0])
        : `${displayDateDayFirst(dates[0])} – ${displayDateDayFirst(dates[1])}`,
  };
}

export function reportRangeQuery(
  range: ReportRangeKey,
  custom?: AppliedDateRange | null,
): string {
  const params = new URLSearchParams();
  if (range === 'today') params.set('from', startOfLocalDay(0).toISOString());
  if (range === '7d') params.set('from', startOfLocalDay(6).toISOString());
  if (range === '30d') params.set('from', startOfLocalDay(29).toISOString());
  if (range === 'custom' && custom) {
    params.set('from', localDateStart(custom.from).toISOString());
    params.set('to', localDateEndExclusive(custom.to).toISOString());
  }
  const query = params.toString();
  return query ? `?${query}` : '';
}

export function ReportToolbar({
  range,
  customRange,
  onRangeChange,
  onCustomApply,
  onDownload,
  onPrint,
  exportDisabled = false,
}: {
  range: ReportRangeKey;
  customRange?: AppliedDateRange | null;
  onRangeChange: (value: Exclude<ReportRangeKey, 'custom'>) => void;
  onCustomApply: (value: AppliedDateRange) => void;
  onDownload: () => void | Promise<void>;
  onPrint: () => void;
  exportDisabled?: boolean;
}) {
  const { lang, dir } = useI18n();
  const copy = COPY[lang] || COPY.en;
  const [open, setOpen] = useState(false);
  const [draftKind, setDraftKind] = useState<ReportRangeKey>(range);
  const [draftRange, setDraftRange] = useState<DateRange | undefined>(
    range === 'custom' ? customDateRange(customRange) : presetDateRange(range),
  );
  const [error, setError] = useState('');
  const [desktopCalendar, setDesktopCalendar] = useState(() =>
    typeof window !== 'undefined' ? window.matchMedia('(min-width: 768px)').matches : true,
  );

  useEffect(() => {
    const query = window.matchMedia('(min-width: 768px)');
    const update = () => setDesktopCalendar(query.matches);
    update();
    query.addEventListener('change', update);
    return () => query.removeEventListener('change', update);
  }, []);

  const presets = useMemo<Array<[Exclude<ReportRangeKey, 'custom'>, string]>>(
    () => [
      ['today', copy.today],
      ['7d', copy.seven],
      ['30d', copy.thirty],
      ['all', copy.all],
    ],
    [copy],
  );

  const activeSummary = activeRangeSummary(range, customRange, copy);

  const syncDraftFromApplied = () => {
    setDraftKind(range);
    setDraftRange(range === 'custom' ? customDateRange(customRange) : presetDateRange(range));
    setError('');
  };

  const choosePreset = (next: Exclude<ReportRangeKey, 'custom'>) => {
    setDraftKind(next);
    setDraftRange(presetDateRange(next));
    setError('');
  };

  const chooseCalendarRange = (next: DateRange | undefined) => {
    setDraftKind('custom');
    setDraftRange(next);
    setError('');
  };

  const applyDraft = () => {
    if (draftKind !== 'custom') {
      onRangeChange(draftKind);
      setOpen(false);
      return;
    }
    if (!draftRange?.from || !draftRange.to) {
      setError(copy.invalid);
      return;
    }
    onCustomApply({
      from: dateToValue(draftRange.from),
      to: dateToValue(draftRange.to),
    });
    setOpen(false);
  };

  return (
    <div
      className="report-no-print flex flex-wrap items-center justify-between gap-3 rounded-2xl border bg-card p-3 shadow-sm"
      dir={dir}
    >
      <Popover
        open={open}
        onOpenChange={nextOpen => {
          if (nextOpen) syncDraftFromApplied();
          setOpen(nextOpen);
        }}
      >
        <PopoverTrigger asChild>
          <button
            type="button"
            className="flex min-w-[250px] max-w-full items-center gap-3 rounded-xl border bg-background px-4 py-2.5 text-start transition hover:bg-accent sm:min-w-[320px]"
            aria-label={copy.chooseRange}
          >
            <CalendarDays className="h-5 w-5 shrink-0 text-muted-foreground" />
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-bold text-foreground">{activeSummary.title}</span>
              {activeSummary.detail ? (
                <span dir="ltr" className="mt-0.5 block truncate text-xs tabular-nums text-muted-foreground">
                  {activeSummary.detail}
                </span>
              ) : null}
            </span>
            <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
          </button>
        </PopoverTrigger>

        <PopoverContent
          align={dir === 'rtl' ? 'end' : 'start'}
          sideOffset={8}
          className="w-auto max-w-[calc(100vw-1.5rem)] overflow-hidden p-0"
          dir={dir}
        >
          <div className="grid md:grid-cols-[150px_auto]">
            <aside className="border-b bg-muted/20 p-3 md:border-b-0 md:border-e">
              <p className="mb-2 px-2 text-xs font-bold text-muted-foreground">{copy.presets}</p>
              <div className="grid grid-cols-2 gap-1 md:grid-cols-1">
                {presets.map(([key, label]) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => choosePreset(key)}
                    className={`rounded-lg px-3 py-2 text-start text-sm font-semibold transition ${
                      draftKind === key
                        ? 'bg-primary text-primary-foreground'
                        : 'hover:bg-accent'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </aside>

            <div className="min-w-0 p-3">
              <div className="mb-2">
                <p className="text-sm font-bold">{copy.customRange}</p>
                <p className="mt-0.5 text-xs text-muted-foreground">{copy.rangePickerHint}</p>
              </div>
              <Calendar
                mode="range"
                selected={draftRange}
                onSelect={chooseCalendarRange}
                numberOfMonths={desktopCalendar ? 2 : 1}
                defaultMonth={draftRange?.from || new Date()}
                disabled={{ after: new Date() }}
                showOutsideDays={false}
                className="max-w-full"
              />
              {draftKind === 'custom' && draftRange?.from ? (
                <p dir="ltr" className="mt-2 text-center text-xs tabular-nums text-muted-foreground">
                  {displayDateDayFirst(dateToValue(draftRange.from))}
                  {' – '}
                  {draftRange.to ? displayDateDayFirst(dateToValue(draftRange.to)) : '…'}
                </p>
              ) : null}
              {error ? <p className="mt-2 text-xs font-semibold text-destructive">{error}</p> : null}
            </div>
          </div>

          <div className="flex items-center justify-end gap-2 border-t bg-muted/10 p-3">
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="rounded-lg border bg-background px-4 py-2 text-sm font-bold hover:bg-accent"
            >
              {copy.cancel}
            </button>
            <button
              type="button"
              onClick={applyDraft}
              className="rounded-lg bg-primary px-4 py-2 text-sm font-bold text-primary-foreground hover:bg-primary/90"
            >
              {copy.apply}
            </button>
          </div>
        </PopoverContent>
      </Popover>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={exportDisabled}
          onClick={() => void onDownload()}
          className="inline-flex h-10 items-center gap-2 rounded-xl border bg-background px-4 text-sm font-bold hover:bg-accent disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Download className="h-4 w-4" />
          {copy.download}
        </button>
        <button
          type="button"
          disabled={exportDisabled}
          onClick={onPrint}
          className="inline-flex h-10 items-center gap-2 rounded-xl border bg-background px-4 text-sm font-bold hover:bg-accent disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Printer className="h-4 w-4" />
          {copy.print}
        </button>
      </div>
    </div>
  );
}
