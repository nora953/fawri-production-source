import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");
const source = fs.readFileSync(
  path.join(root, "src", "components", "InternationalPhoneField.tsx"),
  "utf8",
);

test("country calling code stays ASCII and LTR-isolated inside RTL country options", () => {
  assert.match(source, /data-fawri-preserve-digits="true"/);
  assert.match(source, /const LTR_ISOLATE = '\\u2066';/);
  assert.match(source, /const POP_DIRECTIONAL_ISOLATE = '\\u2069';/);
  assert.match(
    source,
    /formatCountryOptionLabel\(countryName, option\.callingCode\)/,
  );
});
