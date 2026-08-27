function normalizeDigits(value: string): string {
  return value
    .replace(/[٠-٩]/g, digit => String('٠١٢٣٤٥٦٧٨٩'.indexOf(digit)))
    .replace(/[۰-۹]/g, digit => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(digit)));
}

function onlyDigits(value: string, maxLength: number): string {
  return normalizeDigits(value).replace(/\D/g, '').slice(0, maxLength);
}

export function formatDateInputMask(value: string): string {
  const digits = onlyDigits(value, 8);
  if (digits.length <= 4) return digits;
  if (digits.length <= 6) return `${digits.slice(0, 4)}/${digits.slice(4)}`;
  return `${digits.slice(0, 4)}/${digits.slice(4, 6)}/${digits.slice(6)}`;
}

export function formatTimeInputMask(value: string): string {
  const digits = onlyDigits(value, 4);
  if (digits.length <= 2) return digits;
  return `${digits.slice(0, 2)}:${digits.slice(2)}`;
}

export function formatKnownDateTimeInput(
  value: string,
  placeholder: string | undefined,
): string {
  if (placeholder === 'YYYY/MM/DD') return formatDateInputMask(value);
  if (placeholder === 'HH:mm') return formatTimeInputMask(value);
  return value;
}
