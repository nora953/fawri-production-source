import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const component = fs.readFileSync(
  path.join(root, "src", "components", "EmergencyIncidentNoticeBanner.tsx"),
  "utf8",
);
const translations = fs.readFileSync(
  path.join(
    root,
    "src",
    "lib",
    "translations",
    "features",
    "components",
    "EmergencyIncidentNoticeBanner.ts",
  ),
  "utf8",
);

test("emergency merchant incident notice is compact by default and expands details on demand", () => {
  assert.match(component, /const \[detailsOpen, setDetailsOpen\] = useState\(false\);/);
  assert.match(component, /max-w-xl/);
  assert.doesNotMatch(component, /max-w-3xl/);
  assert.match(component, /\{detailsOpen && \(/);
  assert.match(component, /aria-expanded=\{detailsOpen\}/);
  assert.match(component, /text\.showDetails/);
  assert.match(component, /text\.hideDetails/);
  assert.match(translations, /summary:/);
  assert.match(translations, /showDetails:/);
  assert.match(translations, /hideDetails:/);
});

test("compact notice preserves the existing server-authoritative read acknowledgement contract", () => {
  assert.match(
    component,
    /\/api\/auth\/emergency-read-access\/notices\?unread=1&limit=1/,
  );
  assert.match(
    component,
    /`\/api\/auth\/emergency-read-access\/notices\/\$\{encodeURIComponent\(notice\.id\)\}\/read`/,
  );
  assert.match(component, /\{ method: 'PATCH' \}/);
  assert.doesNotMatch(component, /localStorage|sessionStorage/);
});
