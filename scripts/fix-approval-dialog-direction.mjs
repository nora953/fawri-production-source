import fs from "node:fs";

const filePath = "artifacts/fawri/src/pages/AdminPage.tsx";
let source = fs.readFileSync(filePath, "utf8");

function replaceOnce(label, before, after) {
  if (source.includes(after)) return;
  const first = source.indexOf(before);
  if (first === -1) throw new Error(`Could not find ${label}`);
  if (source.indexOf(before, first + before.length) !== -1) {
    throw new Error(`Found multiple matches for ${label}`);
  }
  source = source.slice(0, first) + after + source.slice(first + before.length);
}

replaceOnce(
  "dialog text direction classes",
  `  const textAlignmentClass =\n    adminText.dir === "rtl" ? "text-right" : "text-left";`,
  `  const textAlignmentClass =\n    adminText.dir === "rtl"\n      ? "!text-right sm:!text-right"\n      : "!text-left sm:!text-left";`,
);

replaceOnce(
  "approval dialog content direction classes",
  `      <DialogContent\n        className={isApproval ? "max-w-md gap-4" : "max-w-sm"}\n        dir={adminText.dir}\n      >`,
  `      <DialogContent\n        className={\n          isApproval\n            ? \`max-w-md gap-4 \${\n                adminText.dir === "rtl"\n                  ? "[&>button]:left-4 [&>button]:right-auto"\n                  : "[&>button]:right-4 [&>button]:left-auto"\n              }\`\n            : "max-w-sm"\n        }\n        dir={adminText.dir}\n      >`,
);

replaceOnce(
  "approval dialog title width and alignment",
  `            className={\`\${isDestructive ? "text-destructive" : ""} \${\n              isApproval ? "text-lg leading-6" : ""\n            }\`}`,
  `            className={\`\${isDestructive ? "text-destructive" : ""} \${\n              isApproval ? \`w-full text-lg leading-6 \${textAlignmentClass}\` : ""\n            }\`}`,
);

fs.writeFileSync(filePath, source, "utf8");
console.log("Approval dialog direction fixed.");
