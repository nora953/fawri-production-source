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
  "Arabic dialog header alignment",
  `          <DialogHeader\n            className={adminText.dir === "rtl" ? "text-right" : "text-left"}\n          >`,
  `          <DialogHeader\n            className={\n              language === "ar"\n                ? "text-right sm:!text-right"\n                : adminText.dir === "rtl"\n                  ? "text-right"\n                  : "text-left"\n            }\n          >`,
);

const fieldGroupBefore = '            <div className="space-y-1.5">';
const fieldGroupAfter =
  '            <div className={language === "ar" ? "space-y-2" : "space-y-1.5"}>';
const fieldGroupMatches = dialog.split(fieldGroupBefore).length - 1;
if (fieldGroupMatches !== 4) {
  throw new Error(`Expected 4 creation-dialog field groups, found ${fieldGroupMatches}`);
}
dialog = dialog.replaceAll(fieldGroupBefore, fieldGroupAfter);

const labelIds = [
  "administrator-owner-name",
  "administrator-phone",
  "administrator-password",
  "administrator-language",
];

for (const id of labelIds) {
  replaceOnce(
    `Arabic field label spacing for ${id}`,
    `<Label htmlFor="${id}">`,
    `<Label\n                htmlFor="${id}"\n                className={language === "ar" ? "block min-h-5 leading-5" : undefined}\n              >`,
  );
}

replaceOnce(
  "Arabic password visibility button position",
  '                  className="absolute right-1 top-1/2 h-8 w-8 -translate-y-1/2"',
  `                  className={\n                    language === "ar"\n                      ? "absolute right-3 top-1/2 h-8 w-8 -translate-y-1/2"\n                      : "absolute right-1 top-1/2 h-8 w-8 -translate-y-1/2"\n                  }`,
);

source = source.slice(0, startIndex) + dialog + source.slice(endIndex);
fs.writeFileSync(targetPath, source, "utf8");
console.log("Arabic assistant administrator dialog alignment and spacing refined.");
