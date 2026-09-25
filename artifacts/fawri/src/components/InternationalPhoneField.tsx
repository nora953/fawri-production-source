import React, { useMemo } from 'react';
import { Input } from '@/components/ui/input';
import {
  MERCHANT_REGION_BY_COUNTRY,
  MERCHANT_REGION_OPTIONS,
} from '@/lib/merchantRegions';
import type { Lang } from '@/lib/types';

type InternationalPhoneFieldProps = {
  lang: Lang;
  countryCode: string;
  phoneInput: string;
  countryLabel: string;
  phoneLabel: string;
  phonePlaceholder: string;
  onCountryChange: (countryCode: string) => void;
  onPhoneInputChange: (value: string) => void;
  onPhoneBlur?: () => void;
  phoneError?: string;
  countryTestId?: string;
  phoneTestId?: string;
};

function countryDisplayNames(lang: Lang): Intl.DisplayNames | null {
  try {
    return new Intl.DisplayNames([lang], { type: 'region' });
  } catch {
    try {
      return new Intl.DisplayNames(['en'], { type: 'region' });
    } catch {
      return null;
    }
  }
}

export default function InternationalPhoneField({
  lang,
  countryCode,
  phoneInput,
  countryLabel,
  phoneLabel,
  phonePlaceholder,
  onCountryChange,
  onPhoneInputChange,
  onPhoneBlur,
  phoneError,
  countryTestId = 'select-country',
  phoneTestId = 'input-phone',
}: InternationalPhoneFieldProps) {
  const displayNames = useMemo(() => countryDisplayNames(lang), [lang]);
  const selected = MERCHANT_REGION_BY_COUNTRY.get(countryCode)
    || MERCHANT_REGION_BY_COUNTRY.get('IQ')
    || MERCHANT_REGION_OPTIONS[0];

  return (
    <div className="grid gap-4 sm:grid-cols-2" data-fawri-international-phone="true">
      <div className="space-y-2">
        <label htmlFor={countryTestId} className="block text-sm font-medium leading-5">
          {countryLabel}
        </label>
        <select
          id={countryTestId}
          value={countryCode}
          onChange={event => onCountryChange(event.target.value)}
          className="h-12 w-full rounded-xl border border-input bg-background px-3 text-sm shadow-sm outline-none focus:ring-2 focus:ring-ring"
          data-testid={countryTestId}
        >
          {MERCHANT_REGION_OPTIONS.map(option => (
            <option key={option.countryCode} value={option.countryCode}>
              {displayNames?.of(option.countryCode) || option.countryCode} ({option.callingCode})
            </option>
          ))}
        </select>
      </div>

      <div className="space-y-2">
        <label htmlFor={phoneTestId} className="block text-sm font-medium leading-5">
          {phoneLabel}
        </label>
        <div
          className={`flex h-12 overflow-hidden rounded-xl border bg-background shadow-sm focus-within:ring-2 focus-within:ring-ring ${
            phoneError ? 'border-red-500 focus-within:ring-red-500' : 'border-input'
          }`}
          dir="ltr"
        >
          <span
            className="flex min-w-[4.75rem] items-center justify-center border-r bg-muted/40 px-3 text-sm font-bold tabular-nums"
            data-fawri-preserve-digits="true"
          >
            {selected?.callingCode || '+'}
          </span>
          <Input
            id={phoneTestId}
            type="tel"
            dir="ltr"
            inputMode="tel"
            autoComplete="tel-national"
            value={phoneInput}
            onChange={event => onPhoneInputChange(event.target.value)}
            onBlur={onPhoneBlur}
            placeholder={phonePlaceholder}
            aria-invalid={!!phoneError}
            className="h-full flex-1 rounded-none border-0 shadow-none focus-visible:ring-0"
            data-testid={phoneTestId}
          />
        </div>
        {phoneError ? (
          <p
            className="rounded-lg border border-red-100 bg-red-50 px-3 py-2 text-sm font-medium text-red-700"
            role="alert"
          >
            {phoneError}
          </p>
        ) : null}
      </div>
    </div>
  );
}
