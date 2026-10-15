import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

for (const component of ["dialog.tsx", "sheet.tsx"]) {
  test(`${component} uses the localized close label for assistive technology`, () => {
    const source = fs.readFileSync(
      new URL(`../src/components/ui/${component}`, import.meta.url),
      "utf8",
    );

    assert.match(source, /useI18n\(\)/);
    assert.match(source, /<span className="sr-only">\{t\.close\}<\/span>/);
    assert.doesNotMatch(source, /<span className="sr-only">Close<\/span>/);
  });
}
