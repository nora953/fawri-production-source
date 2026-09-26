import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const source = fs.readFileSync(
  path.resolve(here, "..", "src", "pages", "SignupPage.tsx"),
  "utf8",
);

test("signup submit stays disabled until every required field is valid", () => {
  assert.match(source, /const isFormReady =/);
  for (const contract of [
    "formData.owner_name.trim()",
    "formData.store_name.trim()",
    "formData.country_code",
    "validateInternationalPhone(formData.phone, selectedRegion?.callingCode)",
    "formData.currency_code",
    "formData.activity_type",
    "!isOther || !!formData.custom_activity.trim()",
    "validatePassword(formData.password)",
    "formData.password === formData.confirm_password",
    "formData.agree_terms",
    "formData.confirm_legal",
  ]) {
    assert.ok(source.includes(contract), `missing readiness contract: ${contract}`);
  }
  assert.match(source, /disabled=\{loading \|\| !isFormReady\}/);
  assert.match(source, /aria-disabled=\{loading \|\| !isFormReady\}/);
  assert.match(source, /disabled:opacity-40/);
  assert.match(source, /disabled:cursor-not-allowed/);
});

test("server-side submit validation remains in place", () => {
  assert.match(source, /if \(!formData\.owner_name\.trim\(\)\)/);
  assert.match(source, /if \(!validateInternationalPhone\(/);
  assert.match(source, /if \(!validatePassword\(formData\.password\)\)/);
  assert.match(source, /if \(!formData\.agree_terms \|\| !formData\.confirm_legal\)/);
});
