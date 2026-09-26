import {
  normalizeInternationalPhoneInput,
  validateInternationalPhone,
} from './internationalPhone';

export const normalizePhoneNumber = (phone: string) =>
  normalizeInternationalPhoneInput(phone);

export const validatePhone = (phone: string) =>
  validateInternationalPhone(phone);

export const validatePassword = (pass: string) => {
  return (
    pass.length >= 8 &&
    /[A-Z]/.test(pass) &&
    /[0-9]/.test(pass) &&
    /^[A-Za-z0-9@#$%&!_-]+$/.test(pass)
  );
};
