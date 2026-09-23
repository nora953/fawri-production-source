import type { Lang } from '@/lib/types';

export type ReportToolbarCopy = {
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

export const REPORT_TOOLBAR_COPY: Record<Lang, ReportToolbarCopy> = {
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
    invalid: 'اختر تاريخًا من التقويم أولًا.',
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
    invalid: 'سەرەتا بەروارێک لە ڕۆژژمێرەکە هەڵبژێرە.',
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
    invalid: 'Choose a date on the calendar first.',
    download: 'Download Excel',
    print: 'Print / Save PDF',
    presets: 'Quick ranges',
  },
};

export const REPORT_TOOLBAR_RANGE_JOINERS = {
  ar: { from: 'من', to: 'إلى' },
  ku: { from: 'لە', to: 'تا' },
} as const;

export const REPORT_TOOLBAR_CALENDAR_NAV_COPY = {
  ar: { next: 'الشهر التالي', previous: 'الشهر السابق' },
  ku: { next: 'مانگی داهاتوو', previous: 'مانگی پێشوو' },
} as const;

export const REPORT_TOOLBAR_SORANI_MONTHS = [
  'کانوونی دووەم',
  'شوبات',
  'ئازار',
  'نیسان',
  'ئایار',
  'حوزەیران',
  'تەممووز',
  'ئاب',
  'ئەیلوول',
  'تشرینی یەکەم',
  'تشرینی دووەم',
  'کانوونی یەکەم',
] as const;

export const REPORT_TOOLBAR_SORANI_WEEKDAYS = [
  'یەک',
  'دوو',
  'سێ',
  'چوار',
  'پێنج',
  'هەینی',
  'شەممە',
] as const;
