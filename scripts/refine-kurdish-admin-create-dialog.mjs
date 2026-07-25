import fs from "node:fs";

const targetPath = "artifacts/fawri/src/components/admin/AdministratorsTab.tsx";
let source = fs.readFileSync(targetPath, "utf8");

const dialogStartMarker =
  "      <Dialog open={isCreateDialogOpen} onOpenChange={handleCreateDialogChange}>";
const nextDialogMarker =
  "\n\n      <Dialog\n        open={permissionDialogOpen}";

const startIndex = source.indexOf(dialogStartMarker);
const endIndex = source.indexOf(nextDialogMarker, startIndex);

if (startIndex === -1 || endIndex === -1) {
  throw new Error("Could not locate the assistant administrator creation dialog");
}

let dialog = source.slice(startIndex, endIndex);

function replaceCounted(label, before, after, expectedCount) {
  const actualCount = dialog.split(before).length - 1;
  if (actualCount !== expectedCount) {
    throw new Error(`Expected ${expectedCount} matches for ${label}, found ${actualCount}`);
  }
  dialog = dialog.replaceAll(before, after);
}

replaceCounted(
  "Kurdish RTL header alignment",
  '              language === "ar"\n                ? "text-right sm:!text-right"',
  '              language === "ar" || language === "ku"\n                ? "text-right sm:!text-right"',
  1,
);

replaceCounted(
  "Kurdish field spacing",
  'className={language === "ar" ? "space-y-2" : "space-y-1.5"}',
  'className={language === "ar" || language === "ku" ? "space-y-2" : "space-y-1.5"}',
  4,
);

replaceCounted(
  "Kurdish field label spacing",
  'className={language === "ar" ? "block min-h-5 leading-5" : undefined}',
  'className={language === "ar" || language === "ku" ? "block min-h-5 leading-5" : undefined}',
  4,
);

replaceCounted(
  "Kurdish password eye placement",
  '{language === "ar" ? (',
  '{language === "ar" || language === "ku" ? (',
  1,
);

source = source.slice(0, startIndex) + dialog + source.slice(endIndex);
fs.writeFileSync(targetPath, source, "utf8");
console.log("Kurdish assistant administrator dialog now matches the approved RTL spacing and password-eye placement.");
