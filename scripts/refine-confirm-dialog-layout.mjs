import fs from "node:fs";
import { execSync } from "node:child_process";

const sourcePath = "artifacts/fawri/src/pages/AdminPage.tsx";
const selfPath = "scripts/refine-confirm-dialog-layout.mjs";
const branch = "feature/admin-permissions-v2";

function run(command) {
  console.log(`\n> ${command}`);
  execSync(command, { stdio: "inherit", shell: "/bin/bash" });
}

function replaceOnce(source, label, before, after) {
  const count = source.split(before).length - 1;
  if (count !== 1) {
    throw new Error(`${label}: expected one match inside ConfirmDialog, found ${count}`);
  }
  return source.replace(before, after);
}

let source = fs.readFileSync(sourcePath, "utf8");
const dialogStart = source.indexOf("function ConfirmDialog({");
const dialogEnd = source.indexOf("// ── Plan modal", dialogStart);
if (dialogStart === -1 || dialogEnd === -1) {
  throw new Error("Could not isolate ConfirmDialog section");
}

let dialog = source.slice(dialogStart, dialogEnd);

dialog = replaceOnce(
  dialog,
  "dialog content direction",
  `        className={\n          isApproval\n            ? \`max-w-md gap-4 \${\n                adminText.dir === "rtl"\n                  ? "[&>button]:left-4 [&>button]:right-auto"\n                  : "[&>button]:right-4 [&>button]:left-auto"\n              }\`\n            : "max-w-sm"\n        }`,
  `        className={\`\${isApproval ? "max-w-md gap-4" : "max-w-sm gap-4"} \${\n          adminText.dir === "rtl"\n            ? "[&>button]:left-4 [&>button]:right-auto"\n            : "[&>button]:right-4 [&>button]:left-auto"\n        }\`}`,
);

dialog = replaceOnce(
  dialog,
  "dialog header spacing",
  `        <DialogHeader className={textAlignmentClass}>\n          <DialogTitle\n            className={\`\${isDestructive ? "text-destructive" : ""} \${\n              isApproval ? \`w-full text-lg leading-6 \${textAlignmentClass}\` : ""\n            }\`}\n          >`,
  `        <DialogHeader\n          className={\`w-full \${textAlignmentClass} \${\n            adminText.dir === "rtl" ? "pl-12" : "pr-12"\n          }\`}\n        >\n          <DialogTitle\n            className={\`w-full text-lg leading-6 \${textAlignmentClass} \${\n              isDestructive ? "text-destructive" : ""\n            }\`}\n          >`,
);

dialog = replaceOnce(
  dialog,
  "merchant summary card",
  `        ) : (\n          <div className="space-y-3">\n            <p className="text-sm text-muted-foreground">\n              {adminText.storeLabel}:{" "}\n              <span className="font-medium text-foreground">\n                {state.merchantName}\n              </span>\n            </p>`,
  `        ) : (\n          <div className={\`space-y-3 \${textAlignmentClass}\`}>\n            <div className={\`rounded-xl border bg-muted/35 px-4 py-3 \${textAlignmentClass}\`}>\n              <p className="text-xs text-muted-foreground">\n                {adminText.storeLabel}\n              </p>\n              <p className="mt-1 text-sm font-semibold text-foreground">\n                {state.merchantName}\n              </p>\n            </div>`,
);

dialog = replaceOnce(
  dialog,
  "reason field layout",
  `              <div className="space-y-1.5">\n                <Label>{adminText.reasonRequired}</Label>\n\n                <Textarea\n                  value={reason}\n                  onChange={(event) => setReason(event.target.value)}\n                  placeholder={adminText.reasonPlaceholder}\n                  rows={3}\n                />`,
  `              <div className={\`space-y-1.5 \${textAlignmentClass}\`}>\n                <Label className={\`block \${textAlignmentClass}\`}>\n                  {adminText.reasonRequired}\n                </Label>\n\n                <Textarea\n                  className={\`min-h-28 resize-none \${textAlignmentClass}\`}\n                  value={reason}\n                  onChange={(event) => setReason(event.target.value)}\n                  placeholder={adminText.reasonPlaceholder}\n                  rows={4}\n                />`,
);

dialog = replaceOnce(
  dialog,
  "non-approval footer",
  `        ) : (\n          <DialogFooter className="flex gap-2 flex-row-reverse justify-start">\n            <Button\n              variant={isDestructive ? "destructive" : "default"}\n              disabled={needsReason && !reason.trim()}\n              onClick={() => onConfirm(reason)}\n            >\n              {adminText.confirm}\n            </Button>\n\n            <Button variant="outline" onClick={onClose}>\n              {adminText.cancel}\n            </Button>\n          </DialogFooter>`,
  `        ) : (\n          <DialogFooter\n            className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end"\n            dir="ltr"\n          >\n            <Button\n              variant="outline"\n              onClick={onClose}\n              className="h-auto min-h-10 w-full whitespace-normal px-4 py-2 sm:w-auto sm:min-w-20"\n            >\n              {adminText.cancel}\n            </Button>\n\n            <Button\n              variant={isDestructive ? "destructive" : "default"}\n              disabled={needsReason && !reason.trim()}\n              onClick={() => onConfirm(reason)}\n              className="h-auto min-h-10 w-full whitespace-normal px-4 py-2 sm:w-auto sm:min-w-24"\n            >\n              {adminText.confirm}\n            </Button>\n          </DialogFooter>`,
);

source = source.slice(0, dialogStart) + dialog + source.slice(dialogEnd);
fs.writeFileSync(sourcePath, source, "utf8");

const finalSource = fs.readFileSync(sourcePath, "utf8");
for (const marker of [
  'adminText.dir === "rtl" ? "pl-12" : "pr-12"',
  "rounded-xl border bg-muted/35 px-4 py-3",
  "min-h-28 resize-none",
  "flex flex-col-reverse gap-2 sm:flex-row sm:justify-end",
]) {
  if (!finalSource.includes(marker)) {
    throw new Error(`Missing final marker: ${marker}`);
  }
}

run("pnpm run typecheck");
run("PORT=3000 BASE_PATH=/ pnpm --filter @workspace/fawri run build");

fs.rmSync(selfPath);
run("git diff --check");
run(`git add ${sourcePath} ${selfPath}`);
run('git commit -m "Refine admin confirmation dialog layout"');
run(`git push origin ${branch}`);

console.log("\nCompleted: admin confirmation dialog refined, validated, committed, and pushed.");
