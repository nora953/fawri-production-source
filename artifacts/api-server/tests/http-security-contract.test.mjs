import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const current = path.dirname(fileURLToPath(import.meta.url));
const appPath = path.resolve(current, "../src/app.ts");

test("HTTP surface installs defense-in-depth security headers and explicit CORS origin policy", () => {
  const source = fs.readFileSync(appPath, "utf8");

  for (const header of [
    "Content-Security-Policy",
    "Strict-Transport-Security",
    "X-Content-Type-Options",
    "X-Frame-Options",
    "Referrer-Policy",
    "Permissions-Policy",
  ]) {
    assert.equal(source.includes(header), true, `${header} header contract is missing`);
  }

  assert.match(source, /cors\(\{[\s\S]*origin:\s*corsOriginAllowed[\s\S]*credentials:\s*true/);
  assert.doesNotMatch(source, /app\.use\(cors\(\)\)/);
  assert.match(source, /FAWRI_ALLOWED_ORIGINS/);
  assert.match(source, /Cache-Control", "no-store"/);
});
