import crypto from "node:crypto";

const PASSWORD_SALT =
  process.env.FAWRI_PASSWORD_SALT || "fawri-local-dev-salt";

export type PasswordValidationError = {
  code: string;
  message: string;
};

export function getPasswordValidationError(
  password: string,
): PasswordValidationError | null {
  if (!password) {
    return {
      code: "PASSWORD_REQUIRED",
      message: "password is required",
    };
  }

  if (password.length < 8) {
    return {
      code: "PASSWORD_TOO_SHORT",
      message: "password must be at least 8 characters",
    };
  }

  if (!/^[A-Za-z0-9@#$%&!_-]+$/.test(password)) {
    return {
      code: "INVALID_PASSWORD_CHARACTERS",
      message:
        "password may contain only English letters, numbers, and @ # $ % & ! _ -",
    };
  }

  if (!/[A-Z]/.test(password)) {
    return {
      code: "PASSWORD_UPPERCASE_REQUIRED",
      message: "password must contain at least one uppercase English letter",
    };
  }

  if (!/[0-9]/.test(password)) {
    return {
      code: "PASSWORD_NUMBER_REQUIRED",
      message: "password must contain at least one number",
    };
  }

  return null;
}

export function hashPassword(password: string): string {
  return `sha256$${crypto
    .createHash("sha256")
    .update(`${PASSWORD_SALT}:${password}`)
    .digest("hex")}`;
}

export function verifyPassword(
  password: string,
  storedPassword: string,
): boolean {
  if (!storedPassword) return false;

  if (storedPassword.startsWith("sha256$")) {
    return hashPassword(password) === storedPassword;
  }

  // Compatibility with old local/mock accounts saved as plain text.
  return password === storedPassword;
}
