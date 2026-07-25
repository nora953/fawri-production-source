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

function replaceOnce(label, before, after) {
  const first = dialog.indexOf(before);
  if (first === -1) throw new Error(`Could not find ${label}`);
  if (dialog.indexOf(before, first + before.length) !== -1) {
    throw new Error(`Found multiple matches for ${label}`);
  }
  dialog = dialog.slice(0, first) + after + dialog.slice(first + before.length);
}

replaceOnce(
  "dialog width and close-button placement",
  '          className="sm:max-w-lg"',
  '          className={\n            adminText.dir === "rtl"\n              ? "sm:max-w-lg [&>button]:left-4 [&>button]:right-auto"\n              : "sm:max-w-lg"\n          }',
);

replaceOnce(
  "form spacing",
  '            className="space-y-5"',
  '            className="space-y-4"',
);

const fieldSpacingMatches = dialog.match(/className="space-y-2"/g) || [];
if (fieldSpacingMatches.length !== 4) {
  throw new Error(`Expected 4 field groups, found ${fieldSpacingMatches.length}`);
}
dialog = dialog.replaceAll('className="space-y-2"', 'className="space-y-1.5"');

replaceOnce(
  "password visibility button position",
  '                  className="absolute end-1 top-1/2 h-8 w-8 -translate-y-1/2"',
  '                  className="absolute right-1 top-1/2 h-8 w-8 -translate-y-1/2"',
);

source = source.slice(0, startIndex) + dialog + source.slice(endIndex);
fs.writeFileSync(targetPath, source, "utf8");
console.log("Admin creation dialog layout refined without changing component sizes or typography.");
