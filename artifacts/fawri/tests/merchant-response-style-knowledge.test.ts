import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("saved knowledge workspace exposes the merchant response style card", async () => {
  const pageSource = await readFile(
    new URL("../src/pages/dashboard/ServerSavedAnswersPage.tsx", import.meta.url),
    "utf8",
  );
  const cardSource = await readFile(
    new URL("../src/components/knowledge/MerchantResponseStyleCard.tsx", import.meta.url),
    "utf8",
  );

  assert.match(pageSource, /MerchantResponseStyleCard/);
  assert.match(cardSource, /\/api\/knowledge\/response-style/);
  assert.match(cardSource, /expectedVersion: current\.version/);
  assert.match(cardSource, /customInstructions: draft\.customInstructions/);
  assert.match(cardSource, /maxLength=\{800\}/);
  assert.doesNotMatch(cardSource, /localStorage|sessionStorage/);
});

test("response style copy exists in Arabic, Sorani, and English", async () => {
  const source = await readFile(
    new URL(
      "../src/lib/translations/features/pages/dashboard/ServerSavedAnswersPage.ts",
      import.meta.url,
    ),
    "utf8",
  );

  assert.match(source, /styleTitle: "أسلوب ردود فوري"/);
  assert.match(source, /styleTitle: "شێوازی وەڵامدانی فۆری"/);
  assert.match(source, /styleTitle: "Fawri response style"/);
  assert.match(source, /styleSafety/);
});
