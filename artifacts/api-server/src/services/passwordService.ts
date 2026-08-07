import crypto from "node:crypto";

const PASSWORD_SALT =
  process.env.FAWRI_PASSWORD_SALT || "fawri-local-dev-salt";
const SCRYPT_N = 16_384;
const SCRYPT_R = 8;
const SCRYPT_P = 1;
const SCRYPT_KEY_LENGTH = 64;
const PASSWORD_PREFIX = "sha256$v2$scrypt";

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

  if (password.length > 128) {
    return {
      code: "PASSWORD_TOO_LONG",
      message: "password must not exceed 128 characters",
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
  const salt = crypto.randomBytes(16).toString("base64url");
  const derived = crypto.scryptSync(
    password,
    `${PASSWORD_SALT}:${salt}`,
    SCRYPT_KEY_LENGTH,
    {
      N: SCRYPT_N,
      r: SCRYPT_R,
      p: SCRYPT_P,
      maxmem: 64 * 1024 * 1024,
    },
  );

  return [
    PASSWORD_PREFIX,
    SCRYPT_N,
    SCRYPT_R,
    SCRYPT_P,
    salt,
    derived.toString("base64url"),
  ].join("$");
}

export function verifyPassword(
  password: string,
  storedPassword: string,
): boolean {
  if (!storedPassword || password.length > 128) return false;

  if (storedPassword.startsWith(`${PASSWORD_PREFIX}$`)) {
    return verifyScryptPassword(password, storedPassword);
  }

  if (/^sha256\$[a-f0-9]{64}$/i.test(storedPassword)) {
    const expected = crypto
      .createHash("sha256")
      .update(`${PASSWORD_SALT}:${password}`)
      .digest("hex");
    return safeEqual(expected, storedPassword.slice("sha256$".length));
  }

  // Temporary compatibility boundary for old local/mock accounts.
  // Successful authentication must immediately replace this value with hashPassword().
  return safeEqual(password, storedPassword);
}

export function passwordNeedsRehash(storedPassword: string): boolean {
  return !storedPassword.startsWith(`${PASSWORD_PREFIX}$`);
}

function verifyScryptPassword(password: string, storedPassword: string): boolean {
  const parts = storedPassword.split("$");
  if (parts.length !== 8) return false;
  const [, version, algorithm, nValue, rValue, pValue, salt, encoded] = parts;
  if (version !== "v2" || algorithm !== "scrypt") return false;

  const N = Number(nValue);
  const r = Number(rValue);
  const p = Number(pValue);
  if (N !== SCRYPT_N || r !== SCRYPT_R || p !== SCRYPT_P) return false;
  if (!/^[A-Za-z0-9_-]{16,64}$/.test(salt || "")) return false;
  if (!/^[A-Za-z0-9_-]{64,128}$/.test(encoded || "")) return false;

  try {
    const expected = Buffer.from(encoded, "base64url");
    const actual = crypto.scryptSync(
      password,
      `${PASSWORD_SALT}:${salt}`,
      expected.length,
      { N, r, p, maxmem: 64 * 1024 * 1024 },
    );
    return expected.length === actual.length && crypto.timingSafeEqual(expected, actual);
  } catch {
    return false;
  }
}

function safeEqual(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return leftBuffer.length === rightBuffer.length && crypto.timingSafeEqual(leftBuffer, rightBuffer);
}
