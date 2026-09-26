const EASTERN_ARABIC_DIGITS = '٠١٢٣٤٥٦٧٨٩';
const PERSIAN_DIGITS = '۰۱۲۳۴۵۶۷۸۹';

function asciiDigits(value: string): string {
  return value
    .normalize('NFKC')
    .replace(/[٠-٩]/g, digit => String(EASTERN_ARABIC_DIGITS.indexOf(digit)))
    .replace(/[۰-۹]/g, digit => String(PERSIAN_DIGITS.indexOf(digit)));
}

export function isE164Phone(value: string): boolean {
  return /^\+[1-9]\d{7,14}$/.test(value);
}

export function normalizeInternationalPhoneInput(
  value: string,
  callingCode?: string,
): string {
  const raw = asciiDigits(value.trim());
  if (!raw) return '';

  if (raw.startsWith('+')) {
    const canonical = '+' + raw.slice(1).replace(/\D/g, '');
    return canonical;
  }

  const localDigits = raw.replace(/\D/g, '');
  if (!localDigits) return '';

  if (!callingCode) {
    if (/^07\d{9}$/.test(localDigits)) {
      return '+964' + localDigits.slice(1);
    }
    return '+' + localDigits;
  }

  const prefix = '+' + callingCode.replace(/\D/g, '');
  // Fawri accepts national numbers with a familiar trunk zero and strips one
  // leading zero before composing E.164. Users can always paste a full +E.164
  // number to bypass national-number normalization.
  const nationalSignificantNumber = localDigits.replace(/^0/, '');
  return prefix + nationalSignificantNumber;
}

export function validateInternationalPhone(
  value: string,
  callingCode?: string,
): boolean {
  return isE164Phone(normalizeInternationalPhoneInput(value, callingCode));
}
