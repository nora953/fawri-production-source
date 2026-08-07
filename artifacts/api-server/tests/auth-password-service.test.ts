import assert from "node:assert/strict";
import crypto from "node:crypto";
import test from "node:test";
import {
  getPasswordValidationError,
  hashPassword,
  passwordNeedsRehash,
  verifyPassword,
} from "../src/services/authPasswordService";

test("new passwords use randomized scrypt and verify without deterministic hashes", () => {
  const first = hashPassword("SecurePass1");
  const second = hashPassword("SecurePass1");
  assert.match(first, /^sha256\$v2\$scrypt\$/);
  assert.notEqual(first, second);
  assert.equal(verifyPassword("SecurePass1", first), true);
  assert.equal(verifyPassword("WrongPass1", first), false);
  assert.equal(passwordNeedsRehash(first), false);
});

test("legacy SHA-256 and plaintext values remain verifiable only for migration", () => {
  const salt = process.env.FAWRI_PASSWORD_SALT || "fawri-local-dev-salt";
  const legacy = `sha256$${crypto.createHash("sha256").update(`${salt}:SecurePass1`).digest("hex")}`;
  assert.equal(verifyPassword("SecurePass1", legacy), true);
  assert.equal(passwordNeedsRehash(legacy), true);
  assert.equal(verifyPassword("SecurePass1", "SecurePass1"), true);
  assert.equal(passwordNeedsRehash("SecurePass1"), true);
});

test("password policy rejects weak, invalid, and oversized input", () => {
  assert.equal(getPasswordValidationError("short")?.code, "PASSWORD_TOO_SHORT");
  assert.equal(getPasswordValidationError("lowercase1")?.code, "PASSWORD_UPPERCASE_REQUIRED");
  assert.equal(getPasswordValidationError("NoNumberHere")?.code, "PASSWORD_NUMBER_REQUIRED");
  assert.equal(getPasswordValidationError("Secure Pass1")?.code, "INVALID_PASSWORD_CHARACTERS");
  assert.equal(getPasswordValidationError(`A1${"a".repeat(127)}`)?.code, "PASSWORD_TOO_LONG");
  assert.equal(getPasswordValidationError("SecurePass1"), null);
});
