import fs from "node:fs";

const file = "artifacts/fawri/src/pages/AdminPage.tsx";
let s = fs.readFileSync(file, "utf8");

const changes = [
  [
    `        className={\n          isApproval\n            ? \`max-w-md gap-4 \${\n                adminText.dir === "rtl"\n                  ? "[&>button]:left-4 [&>button]:right-auto"\n                  : "[&>button]:right-4 [&>button]:left-auto"\n              }\`\n            : "max-w-sm"\n        }`,
    `        className={\`\${isApproval ? "max-w-md gap-4" : "max-w-sm gap-4"} \${\n          adminText.dir === "rtl"\n            ? "[&>button]:left-4 [&>button]:right-auto"\n            : "[&>button]:right-4 [&>button]:left-auto"\n        }\`}`,
  ],
  [
    `        <DialogHeader className={textAlignmentClass}>`,
    `        <DialogHeader\n          className={\`w-full \${textAlignmentClass} \${\n            adminText.dir === "rtl" ? "pl-12" : "pr-12"\n          }\`}\n        >`,
  ],
  [
    `            className={\`\${isDestructive ? "text-destructive" : ""} \${\n              isApproval ? \`w-full text-lg leading-6 \${textAlignmentClass}\` : ""\n            }\`}`,
    `            className={\`w-full text-lg leading-6 \${textAlignmentClass} \${\n              isDestructive ? "text-destructive" : ""\n            }\`}`,
  ],
  [
    `          <div className="space-y-3">\n            <p className="text-sm text-muted-foreground">\n              {adminText.storeLabel}:{" "}\n              <span className="font-medium text-foreground">\n                {state.merchantName}\n              </span>\n            </p>`,
    `          <div className={\`space-y-3 \${textAlignmentClass}\`}>\n            <div className={\`rounded-xl border bg-muted/35 px-4 py-3 \${textAlignmentClass}\`}>\n              <p className="text-xs text-muted-foreground">{adminText.storeLabel}</p>\n              <p className="mt-1 text-sm font-semibold text-foreground">\n                {state.merchantName}\n              </p>\n            </div>`,
  ],
  [
    `              <div className="space-y-1.5">\n                <Label>{adminText.reasonRequired}</Label>\n\n                <Textarea\n                  value={reason}`,
    `              <div className={\`space-y-1.5 \${textAlignmentClass}\`}>\n                <Label className={\`block \${textAlignmentClass}\`}>\n                  {adminText.reasonRequired}\n                </Label>\n\n                <Textarea\n                  className={\`min-h-28 resize-none \${textAlignmentClass}\`}\n                  value={reason}`,
  ],
  [
    `          <DialogFooter className="flex gap-2 flex-row-reverse justify-start">`,
    `          <DialogFooter\n            className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end"\n            dir="ltr"\n          >`,
  ],
  [
    `            <Button variant="outline" onClick={onClose}>\n              {adminText.cancel}\n            </Button>`,
    `            <Button\n              variant="outline"\n              onClick={onClose}\n              className="h-auto min-h-10 w-full whitespace-normal px-4 py-2 sm:w-auto sm:min-w-20"\n            >\n              {adminText.cancel}\n            </Button>`,
  ],
];

for (const [before, after] of changes) {
  const count = s.split(before).length - 1;
  if (count !== 1) throw new Error(`Expected one match, found ${count}`);
  s = s.replace(before, after);
}

fs.writeFileSync(file, s);
console.log("Confirmation dialog layout updated.");
