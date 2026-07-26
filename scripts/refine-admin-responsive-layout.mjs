import fs from "node:fs";
import { execSync } from "node:child_process";

const adminPagePath = "artifacts/fawri/src/pages/AdminPage.tsx";
const translationsPath = "artifacts/fawri/src/lib/admin-translations.ts";
const selfPath = "scripts/refine-admin-responsive-layout.mjs";
const branch = "feature/admin-permissions-v2";

function run(command) {
  console.log(`\n> ${command}`);
  execSync(command, { stdio: "inherit", shell: "/bin/bash" });
}

function replaceOnce(source, label, before, after) {
  const count = source.split(before).length - 1;
  if (count !== 1) {
    throw new Error(`${label}: expected one match, found ${count}`);
  }
  return source.replace(before, after);
}

function replaceCount(source, label, before, after, expected) {
  const count = source.split(before).length - 1;
  if (count !== expected) {
    throw new Error(`${label}: expected ${expected} matches, found ${count}`);
  }
  return source.split(before).join(after);
}

let adminPage = fs.readFileSync(adminPagePath, "utf8");

adminPage = replaceOnce(
  adminPage,
  "responsive header container",
  '<div className="flex items-center justify-between h-14 px-4 md:px-6 max-w-7xl mx-auto">',
  '<div className="mx-auto flex max-w-7xl flex-col gap-2 px-4 py-2 sm:min-h-14 sm:flex-row sm:items-center sm:justify-between md:px-6">',
);

adminPage = replaceOnce(
  adminPage,
  "responsive header title",
  '<span className="text-lg font-bold text-primary fowri-header-brand-font">',
  '<span className="text-base font-bold leading-tight text-primary fowri-header-brand-font sm:text-lg">',
);

adminPage = replaceOnce(
  adminPage,
  "responsive header controls",
  '<div className="flex items-center gap-3">',
  '<div className="flex w-full items-center justify-between gap-2 sm:w-auto sm:justify-end sm:gap-3">',
);

adminPage = replaceOnce(
  adminPage,
  "responsive main tabs",
  '<div className="flex overflow-x-auto border-b no-scrollbar -mx-4 px-4 md:mx-0 md:px-0">',
  '<div className="-mx-4 grid grid-cols-2 gap-x-2 border-b px-4 sm:grid-cols-3 md:mx-0 md:grid-cols-4 md:px-0 lg:flex lg:overflow-x-auto">',
);

adminPage = replaceOnce(
  adminPage,
  "responsive tab buttons",
  'className={`px-4 py-2.5 text-sm font-medium whitespace-nowrap border-b-2 -mb-px transition-colors ${tab === t.id ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"}`}',
  'className={`w-full min-w-0 px-2 py-2.5 text-xs font-medium whitespace-normal leading-4 border-b-2 -mb-px transition-colors lg:w-auto lg:whitespace-nowrap lg:px-4 lg:text-sm ${tab === t.id ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"}`}',
);

adminPage = replaceOnce(
  adminPage,
  "responsive filters wrapper",
  '<div className="flex gap-2 flex-wrap">',
  '<div className="grid grid-cols-2 gap-2">',
);

adminPage = replaceOnce(
  adminPage,
  "responsive search width",
  '<div className="relative flex-1 min-w-44">',
  '<div className="relative col-span-2">',
);

adminPage = replaceCount(
  adminPage,
  "responsive filter widths",
  '<SelectTrigger className="w-36">',
  '<SelectTrigger className="w-full">',
  2,
);

adminPage = replaceOnce(
  adminPage,
  "tablet merchant cards",
  '<div className="md:hidden space-y-3">',
  '<div className="grid gap-3 md:grid-cols-2 lg:hidden">',
);

adminPage = replaceOnce(
  adminPage,
  "desktop merchant table breakpoint",
  '<div className="hidden md:block rounded-lg border overflow-hidden">',
  '<div className="hidden lg:block rounded-lg border overflow-hidden">',
);

adminPage = replaceOnce(
  adminPage,
  "mobile replies direction",
  `                                <span className="font-medium">\n                                  {sub.replies_used.toLocaleString(locale)} /{" "}\n                                  {sub.reply_limit.toLocaleString(locale)} ({pct}%)\n                                </span>`,
  `                                <span\n                                  className="font-medium tabular-nums"\n                                  dir="ltr"\n                                >\n                                  {sub.replies_used.toLocaleString(locale)} /{" "}\n                                  {sub.reply_limit.toLocaleString(locale)} ({pct}%)\n                                </span>`,
);

adminPage = replaceOnce(
  adminPage,
  "desktop replies direction",
  `                                  <p className="text-xs text-muted-foreground">\n                                    {sub.replies_used.toLocaleString(locale)} /{" "}\n                                    {sub.reply_limit.toLocaleString(locale)} ({pct}%)\n                                  </p>`,
  `                                  <p\n                                    className="text-xs tabular-nums text-muted-foreground"\n                                    dir="ltr"\n                                  >\n                                    {sub.replies_used.toLocaleString(locale)} /{" "}\n                                    {sub.reply_limit.toLocaleString(locale)} ({pct}%)\n                                  </p>`,
);

adminPage = replaceOnce(
  adminPage,
  "English singular results count",
  `            <p className="text-xs text-muted-foreground">\n              {formatAdminMessage(adminText.mainResultsCount, {\n                count: filteredMerchants.length,\n              })}\n            </p>`,
  `            <p className="text-xs text-muted-foreground">\n              {formatAdminMessage(\n                lang === "en" && filteredMerchants.length === 1\n                  ? adminText.mainResultCountSingular\n                  : adminText.mainResultsCount,\n                { count: filteredMerchants.length },\n              )}\n            </p>`,
);

fs.writeFileSync(adminPagePath, adminPage, "utf8");

let translations = fs.readFileSync(translationsPath, "utf8");
if (translations.includes("mainResultCountSingular:")) {
  throw new Error("mainResultCountSingular already exists");
}

const occurrences = [];
let cursor = 0;
while (true) {
  const index = translations.indexOf("mainResultsCount:", cursor);
  if (index === -1) break;
  occurrences.push(index);
  cursor = index + 1;
}

if (occurrences.length !== 3) {
  throw new Error(`Expected 3 mainResultsCount properties, found ${occurrences.length}`);
}

const singularValues = [
  '"نتيجة واحدة"',
  '"1 ئەنجام"',
  '"1 result"',
];

for (let i = occurrences.length - 1; i >= 0; i -= 1) {
  const propertyStart = occurrences[i];
  const lineStart = translations.lastIndexOf("\n", propertyStart) + 1;
  const indent = translations.slice(lineStart, propertyStart);
  let lineEnd = translations.indexOf("\n", propertyStart);
  if (lineEnd === -1) lineEnd = translations.length;

  while (!translations.slice(propertyStart, lineEnd).trimEnd().endsWith(",")) {
    const nextLineEnd = translations.indexOf("\n", lineEnd + 1);
    if (nextLineEnd === -1) {
      lineEnd = translations.length;
      break;
    }
    lineEnd = nextLineEnd;
  }

  translations =
    translations.slice(0, lineEnd) +
    `\n${indent}mainResultCountSingular: ${singularValues[i]},` +
    translations.slice(lineEnd);
}

fs.writeFileSync(translationsPath, translations, "utf8");

const finalAdminPage = fs.readFileSync(adminPagePath, "utf8");
for (const marker of [
  "sm:min-h-14 sm:flex-row",
  "grid-cols-2 gap-x-2 border-b",
  "md:grid-cols-2 lg:hidden",
  "hidden lg:block rounded-lg border",
  "relative col-span-2",
  'dir="ltr"',
  "mainResultCountSingular",
]) {
  if (!finalAdminPage.includes(marker)) {
    throw new Error(`Missing AdminPage marker: ${marker}`);
  }
}

const finalTranslations = fs.readFileSync(translationsPath, "utf8");
if ((finalTranslations.match(/mainResultCountSingular:/g) ?? []).length !== 3) {
  throw new Error("Translation singular result keys were not added three times");
}

run("pnpm run typecheck");
run("PORT=3000 BASE_PATH=/ pnpm --filter @workspace/fawri run build");

fs.rmSync(selfPath);
run("git diff --check");
run(`git add ${adminPagePath} ${translationsPath} ${selfPath}`);
run('git commit -m "Refine admin responsive layout"');
run(`git push origin ${branch}`);

console.log("\nCompleted: admin responsive layout refined, validated, committed, and pushed.");
