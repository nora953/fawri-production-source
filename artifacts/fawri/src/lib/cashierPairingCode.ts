const ARABIC_INDIC_ZERO = 0x0660;
const EASTERN_ARABIC_INDIC_ZERO = 0x06f0;

function asciiDigit(digit: string, zero: number): string {
  return String(digit.charCodeAt(0) - zero);
}

/**
 * Pairing codes are an ASCII authority value. Arabic and Sorani keyboards can
 * still insert Arabic-Indic digits while typing or pasting, so normalize those
 * digits at the UI boundary and discard characters the pairing authority never
 * generates. Letter case is intentionally preserved because the code is
 * case-sensitive.
 */
export function normalizeCashierPairingCode(value: unknown): string {
  return String(value ?? '')
    .replace(/[٠-٩]/g, digit => asciiDigit(digit, ARABIC_INDIC_ZERO))
    .replace(/[۰-۹]/g, digit => asciiDigit(digit, EASTERN_ARABIC_INDIC_ZERO))
    .replace(/[^A-Za-z0-9_-]/g, '');
}
