import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

function source(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

const supportPage = source(
  "artifacts/fawri/src/pages/dashboard/SupportPage.tsx",
);
const privateSupportImage = source(
  "artifacts/fawri/src/components/support/PrivateSupportImage.tsx",
);

test("merchant support gives the conversation more viewport and horizontal space", () => {
  assert.match(supportPage, /max-w-7xl/);
  assert.match(supportPage, /md:h-\[calc\(100dvh-5rem\)\]/);
  assert.match(supportPage, /lg:grid-cols-\[260px_minmax\(0,1fr\)\]/);
  assert.match(supportPage, /flex min-h-0 min-w-0 flex-col/);
});

test("private support image renders as a compact clickable preview", () => {
  assert.match(privateSupportImage, /block w-fit max-w-full/);
  assert.match(privateSupportImage, /max-h-48 w-auto max-w-full object-contain sm:max-w-80/);
  assert.match(privateSupportImage, /window\.open\(objectUrl, '_blank', 'noopener,noreferrer'\)/);
});

test("private support image keeps authenticated no-store loading", () => {
  assert.match(privateSupportImage, /credentials: 'same-origin'/);
  assert.match(privateSupportImage, /cache: 'no-store'/);
  assert.match(privateSupportImage, /URL\.createObjectURL\(blob\)/);
  assert.match(privateSupportImage, /URL\.revokeObjectURL\(currentObjectUrl\)/);
});
