import React, { useMemo } from 'react';
import { Input } from '@/components/ui/input';
import { limitInternationalPhoneInput } from '@/lib/internationalPhone';
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
  equalColumns?: boolean;
};

const LTR_ISOLATE = '\u2066';
const POP_DIRECTIONAL_ISOLATE = '\u2069';

export function formatCountryOptionLabel(
  countryName: string,
  callingCode: string,
): string {
  return `${countryName} (${LTR_ISOLATE}${callingCode}${POP_DIRECTIONAL_ISOLATE})`;
}

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
  equalColumns = false,
}: InternationalPhoneFieldProps) {
  const displayNames = useMemo(() => countryDisplayNames(lang), [lang]);
  const phoneErrorId = `${phoneTestId}-error`;\n  const selected = MERCHANT_REGION_BY_COUNTRY.get(countryCode)
    || MERCHANT_REGION_BY_COUNTRY.get('IQ')
    || MERCHANT_REGION_OPTIONS[0];

  return (
    <div
      className={`grid gap-4 ${
        equalColumns
          ? 'sm:grid-cols-2'
          : 'sm:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]'
      }`}
      data-fawri-international-phone="true"
    >
      <div className="space-y-2">
        <label htmlFor={countryTestId} className="block text-sm font-medium leading-5">
          {countryLabel}
        </label>
        <select
          id={countryTestId}
          value={countryCode}
          onChange={event => onCountryChange(event.target.value)}
          className="h-12 w-full appearance-none rounded-xl border border-input bg-background bg-[length:14px_14px] bg-no-repeat text-sm shadow-sm outline-none focus:ring-2 focus:ring-ring rtl:bg-[position:left_0.65rem_center] rtl:pl-8 rtl:pr-3 rtl:text-right ltr:bg-[position:right_0.65rem_center] ltr:pl-3 ltr:pr-8 ltr:text-left"
          data-testid={countryTestId}
          style={{
            backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='14' height='14' viewBox='0 0 24 24' fill='none' stroke='%230f172a' stroke-width='2.2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E")`,
          }}
        >
          {MERCHANT_REGION_OPTIONS.map(option => {
            const countryName = displayNames?.of(option.countryCode) || option.countryCode;
            return (
              <option
                key={option.countryCode}
                value={option.countryCode}
                data-fawri-preserve-digits="true"
              >
                {formatCountryOptionLabel(countryName, option.callingCode)}
              </option>
            );
          })}
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
            onChange={event =>
              onPhoneInputChange(
                limitInternationalPhoneInput(event.target.value),
              )
            }
            onBlur={onPhoneBlur}
            placeholder={phonePlaceholder}
            aria-invalid={!!phoneError}
            className={`h-full min-w-0 flex-1 rounded-none border-0 shadow-none focus-visible:ring-0 ${
              phoneInput.replace(/\\D/g, '').length >= 13
                ? 'text-xs tracking-tight'
                : 'text-sm'
            }`}
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
