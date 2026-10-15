import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const arabic = fs.readFileSync(
  new URL("../src/lib/translations/ar.ts", import.meta.url),
  "utf8",
);

const adminArabic = fs.readFileSync(
  new URL("../src/lib/admin-translations.ts", import.meta.url),
  "utf8",
);

test("Arabic system UI stays region-neutral and avoids Iraqi-only defaults", () => {
  const forbidden = [
    "السيرفر",
    "الزبون",
    "الزبائن",
    "توصيل بغداد شكد",
    "التوصيل داخل بغداد",
    "جاهز تخلي",
  ];

  for (const term of forbidden) {
    assert.equal(
      (arabic + adminArabic).includes(term),
      false,
      `Arabic UI dictionary must not contain region-specific/default wording: ${term}`,
    );
  }
});
