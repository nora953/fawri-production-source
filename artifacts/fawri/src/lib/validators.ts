const EASTERN_ARABIC_DIGITS = '٠١٢٣٤٥٦٧٨٩';
const PERSIAN_DIGITS = '۰۱۲۳۴۵۶۷۸۹';

export const normalizePhoneNumber = (phone: string) =>
  phone
    .trim()
    .replace(/[٠-٩]/g, digit => String(EASTERN_ARABIC_DIGITS.indexOf(digit)))
    .replace(/[۰-۹]/g, digit => String(PERSIAN_DIGITS.indexOf(digit)))
    .replace(/\s+/g, '');

export const validatePhone = (phone: string) => {
  const normalizedPhone = normalizePhoneNumber(phone);
  return /^07\d{9}$/.test(normalizedPhone);
};

export const validatePassword = (pass: string) => {
  return (
    pass.length >= 8 &&
    /[A-Z]/.test(pass) &&
    /[0-9]/.test(pass) &&
    /^[A-Za-z0-9@#$%&!_-]+$/.test(pass)
  );
};
