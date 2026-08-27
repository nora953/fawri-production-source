function normalizeDigits(value: string): string {
  return value
    .replace(/[٠-٩]/g, digit => String('٠١٢٣٤٥٦٧٨٩'.indexOf(digit)))
    .replace(/[۰-۹]/g, digit => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(digit)));
}

function onlyDigits(value: string, maxLength: number): string {
  return normalizeDigits(value).replace(/\D/g, '').slice(0, maxLength);
}

function isDatePlaceholder(placeholder: string | undefined): boolean {
  return placeholder === 'YYYY/MM/DD' || placeholder === 'DD/MM/YYYY';
}

export function normalizeDecimalTextInput(value: string): string {
  return normalizeDigits(value).replace(/[%٪]/g, '').replace(/\s+/g, '');
}

export function formatDateInputMask(value: string): string {
  const digits = onlyDigits(value, 8);
  if (digits.length <= 2) return digits;
  if (digits.length <= 4) return `${digits.slice(0, 2)}/${digits.slice(2)}`;
  return `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4)}`;
}

export function formatTimeInputMask(value: string): string {
  const digits = onlyDigits(value, 4);
  if (digits.length <= 2) return digits;
  return `${digits.slice(0, 2)}:${digits.slice(2)}`;
}

export function dateInputValueForDisplay(value: string): string {
  const normalized = normalizeDigits(value).trim();
  const canonical = /^(\d{4})\/(\d{2})\/(\d{2})$/.exec(normalized);
  if (canonical) return `${canonical[3]}/${canonical[2]}/${canonical[1]}`;
  return formatDateInputMask(normalized);
}

export function dateInputValueForAuthority(value: string): string {
  const display = formatDateInputMask(value);
  const complete = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(display);
  if (!complete) return display;
  return `${complete[3]}/${complete[2]}/${complete[1]}`;
}

export function placeholderForDisplay(placeholder: string | undefined): string | undefined {
  return isDatePlaceholder(placeholder) ? 'DD/MM/YYYY' : placeholder;
}

export function formatKnownDateTimeInput(
  value: string,
  placeholder: string | undefined,
): string {
  if (isDatePlaceholder(placeholder)) return formatDateInputMask(value);
  if (placeholder === 'HH:mm') return formatTimeInputMask(value);
  return value;
}

export function valueForKnownDateTimeInputDisplay(
  value: string,
  placeholder: string | undefined,
): string {
  if (isDatePlaceholder(placeholder)) return dateInputValueForDisplay(value);
  if (placeholder === 'HH:mm') return formatTimeInputMask(value);
  return value;
}

export function valueForKnownDateTimeInputAuthority(
  value: string,
  placeholder: string | undefined,
): string {
  if (isDatePlaceholder(placeholder)) return dateInputValueForAuthority(value);
  if (placeholder === 'HH:mm') return formatTimeInputMask(value);
  return value;
}
