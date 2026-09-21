import { useMemo, useState } from 'react';
import { Download, Printer } from 'lucide-react';
import { useI18n } from '@/lib/i18n';
import type { Lang } from '@/lib/types';

export type ReportRangeKey = 'today' | '7d' | '30d' | 'all' | 'custom';
export type AppliedDateRange = { from: string; to: string };

type ToolbarCopy = {
  today: string;
  seven: string;
  thirty: string;
  all: string;
  from: string;
  to: string;
  apply: string;
  invalid: string;
  download: string;
  print: string;
};

const COPY: Record<Lang, ToolbarCopy> = {
  ar: {
    today: 'اليوم',
    seven: '7 أيام',
    thirty: '30 يوم',
    all: 'الكل',
    from: 'من',
    to: 'إلى',
    apply: 'تطبيق الفترة',
    invalid: 'اختر تاريخ البداية والنهاية، ويجب ألا يكون تاريخ البداية بعد النهاية.',
    download: 'تحميل Excel',
    print: 'طباعة / حفظ PDF',
  },
  ku: {
    today: 'ئەمڕۆ',
    seven: '7 ڕۆژ',
    thirty: '30 ڕۆژ',
    all: 'هەموو',
    from: 'لە',
    to: 'بۆ',
    apply: 'جێبەجێکردنی ماوە',
    invalid: 'بەرواری دەستپێک و کۆتایی هەڵبژێرە و دەستپێک نابێت دوای کۆتایی بێت.',
    download: 'داگرتنی Excel',
    print: 'چاپ / پاشەکەوتی PDF',
  },
  en: {
    today: 'Today',
    seven: '7 days',
    thirty: '30 days',
    all: 'All',
    from: 'From',
    to: 'To',
    apply: 'Apply range',
    invalid: 'Choose both start and end dates, and keep the start date on or before the end date.',
    download: 'Download Excel',
    print: 'Print / Save PDF',
  },
};

function localDateValue(daysBack: number): string {
  const date = new Date();
  date.setHours(12, 0, 0, 0);
  date.setDate(date.getDate() - daysBack);
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
  onRangeChange,
  onCustomApply,
  onDownload,
  onPrint,
  exportDisabled = false,
}: {
  range: ReportRangeKey;
  onRangeChange: (value: Exclude<ReportRangeKey, 'custom'>) => void;
  onCustomApply: (value: AppliedDateRange) => void;
  onDownload: () => void | Promise<void>;
  onPrint: () => void;
  exportDisabled?: boolean;
}) {
  const { lang, dir } = useI18n();
  const copy = COPY[lang] || COPY.en;
  const [from, setFrom] = useState(() => localDateValue(6));
  const [to, setTo] = useState(() => localDateValue(0));
  const [error, setError] = useState('');

  const presets = useMemo<Array<[Exclude<ReportRangeKey, 'custom'>, string]>>(
    () => [
      ['today', copy.today],
      ['7d', copy.seven],
      ['30d', copy.thirty],
      ['all', copy.all],
    ],
    [copy],
  );

  const applyCustom = () => {
    if (!from || !to || from > to) {
      setError(copy.invalid);
      return;
    }
    setError('');
    onCustomApply({ from, to });
  };

  return (
    <div className="report-no-print space-y-3 rounded-2xl border bg-card p-3 shadow-sm" dir={dir}>
      <div className="flex flex-wrap items-center gap-2">
        {presets.map(([key, label]) => (
          <button
            key={key}
            type="button"
            onClick={() => {
              setError('');
              onRangeChange(key);
            }}
            className={`rounded-xl px-4 py-2 text-sm font-bold transition ${
              range === key
                ? 'bg-primary text-primary-foreground'
                : 'text-muted-foreground hover:bg-accent'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="flex flex-wrap items-end gap-2">
        <label className="min-w-[150px] flex-1 text-xs font-semibold text-muted-foreground sm:flex-none">
          {copy.from}
          <span className="relative mt-1 flex h-10 w-full items-center rounded-lg border bg-background px-3 text-sm font-normal text-foreground focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2">
            <span dir="ltr" className="pointer-events-none tabular-nums">
              {displayDateDayFirst(from)}
            </span>
            <input
              type="date"
              value={from}
              max={to || undefined}
              onChange={event => setFrom(event.target.value)}
              aria-label={copy.from}
              className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
            />
          </span>
        </label>
        <label className="min-w-[150px] flex-1 text-xs font-semibold text-muted-foreground sm:flex-none">
          {copy.to}
          <span className="relative mt-1 flex h-10 w-full items-center rounded-lg border bg-background px-3 text-sm font-normal text-foreground focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2">
            <span dir="ltr" className="pointer-events-none tabular-nums">
              {displayDateDayFirst(to)}
            </span>
            <input
              type="date"
              value={to}
              min={from || undefined}
              onChange={event => setTo(event.target.value)}
              aria-label={copy.to}
              className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
            />
          </span>
        </label>
        <button
          type="button"
          onClick={applyCustom}
          className={`h-10 rounded-xl px-4 text-sm font-bold transition ${
            range === 'custom'
              ? 'bg-primary text-primary-foreground'
              : 'border bg-background hover:bg-accent'
          }`}
        >
          {copy.apply}
        </button>

        <div className="ms-auto flex flex-wrap gap-2">
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

      {error ? <p className="text-xs font-semibold text-destructive">{error}</p> : null}
    </div>
  );
}
