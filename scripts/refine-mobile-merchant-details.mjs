import fs from "node:fs";

const filePath = "artifacts/fawri/src/pages/AdminPage.tsx";
const source = fs.readFileSync(filePath, "utf8");

const sectionStartMarker =
  "// ── Details modal ──────────────────────────────────────────────────────────────";
const sectionEndMarker =
  "// ── Admin logs tab ─────────────────────────────────────────────────────────────";

const sectionStart = source.indexOf(sectionStartMarker);
const sectionEnd = source.indexOf(sectionEndMarker, sectionStart);

if (sectionStart === -1 || sectionEnd === -1 || sectionEnd <= sectionStart) {
  throw new Error("Could not isolate DetailsModal");
}

let detailsSection = source.slice(sectionStart, sectionEnd);

function replaceExact(label, before, after) {
  const matches = detailsSection.split(before).length - 1;
  if (matches !== 1) {
    throw new Error(`${label}: expected one match, found ${matches}`);
  }
  detailsSection = detailsSection.replace(before, after);
}

replaceExact(
  "tabs container",
  '<div className="mt-3 flex gap-0 border-b px-6">',
  '<div className="mt-3 grid grid-cols-4 border-b px-3 sm:px-6">',
);

replaceExact(
  "tab button",
  'className={`-mb-px whitespace-nowrap border-b-2 px-4 py-2 text-sm transition-colors ${',
  'className={`-mb-px min-w-0 whitespace-nowrap border-b-2 px-0.5 py-2 text-[9px] tracking-tight transition-colors sm:px-4 sm:text-sm sm:tracking-normal ${',
);

replaceExact(
  "channel card",
  'className={`flex min-h-28 flex-col justify-between gap-3 rounded-lg border p-3 ${textAlignmentClass}`}',
  'className={`flex min-h-28 flex-col justify-between gap-2 rounded-lg border p-2 sm:gap-3 sm:p-3 ${textAlignmentClass}`}',
);

replaceExact(
  "channel heading",
  '<div className="flex min-w-0 items-center gap-2">\n                    <Icon className="h-5 w-5 shrink-0 text-muted-foreground" />\n                    <p className="min-w-0 truncate text-sm font-medium">{label}</p>\n                  </div>',
  '<div className="flex min-h-10 min-w-0 items-start gap-1.5 sm:items-center sm:gap-2">\n                    <Icon className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground sm:mt-0 sm:h-5 sm:w-5" />\n                    <p className="min-w-0 break-words text-[11px] font-medium leading-4 sm:text-sm">\n                      {label}\n                    </p>\n                  </div>',
);

replaceExact(
  "channel select trigger",
  '<SelectTrigger className="h-9 w-full text-xs">',
  '<SelectTrigger className="h-auto min-h-9 w-full gap-1 px-2 py-1.5 text-[10px] [&>span]:whitespace-normal [&>span]:break-words [&>span]:text-center [&>span]:leading-4 sm:text-xs">',
);

replaceExact(
  "fixed channel status",
  '<span className="inline-flex h-9 w-full items-center justify-center rounded-md border bg-muted px-2 text-center text-xs font-medium text-muted-foreground">',
  '<span className="inline-flex min-h-9 w-full items-center justify-center rounded-md border bg-muted px-1.5 py-1.5 text-center text-[10px] font-medium leading-4 text-muted-foreground sm:px-2 sm:text-xs">',
);

const updatedSource =
  source.slice(0, sectionStart) + detailsSection + source.slice(sectionEnd);
fs.writeFileSync(filePath, updatedSource, "utf8");

const finalSource = fs.readFileSync(filePath, "utf8");
const finalStart = finalSource.indexOf(sectionStartMarker);
const finalEnd = finalSource.indexOf(sectionEndMarker, finalStart);
const finalDetails = finalSource.slice(finalStart, finalEnd);

for (const marker of [
  'grid grid-cols-4 border-b px-3 sm:px-6',
  'text-[9px] tracking-tight',
  'min-h-10 min-w-0 items-start',
  '[&>span]:whitespace-normal',
  'min-h-9 w-full items-center justify-center',
]) {
  if (!finalDetails.includes(marker)) {
    throw new Error(`Missing final marker: ${marker}`);
  }
}

for (const forbidden of [
  'min-w-0 truncate text-sm font-medium',
  '<SelectTrigger className="h-9 w-full text-xs">',
  'inline-flex h-9 w-full items-center justify-center',
]) {
  if (finalDetails.includes(forbidden)) {
    throw new Error(`Old mobile marker remains: ${forbidden}`);
  }
}

console.log("Merchant details mobile tabs and channel cards refined successfully.");
