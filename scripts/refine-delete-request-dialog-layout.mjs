import fs from "node:fs";
import { execSync } from "node:child_process";

const sourcePath = "artifacts/fawri/src/components/DeleteMerchantDialog.tsx";
const selfPath = "scripts/refine-delete-request-dialog-layout.mjs";
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

let source = fs.readFileSync(sourcePath, "utf8");

source = replaceOnce(
  source,
  "alignment helper",
  `  const reasonLabel = (value: MerchantDeleteReason) =>\n    value === "retention_expired"\n      ? adminText.deletionReasonRetention\n      : adminText.deletionReasonPolicy;`,
  `  const reasonLabel = (value: MerchantDeleteReason) =>\n    value === "retention_expired"\n      ? adminText.deletionReasonRetention\n      : adminText.deletionReasonPolicy;\n\n  const textAlignmentClass =\n    adminText.dir === "rtl"\n      ? "!text-right sm:!text-right"\n      : "!text-left sm:!text-left";`,
);

source = replaceOnce(
  source,
  "dialog shell and header",
  `      <DialogContent className="max-w-md" dir={adminText.dir}>\n        <DialogHeader>\n          <DialogTitle className="flex items-center gap-2 text-destructive">`,
  `      <DialogContent\n        className={\`flex max-h-[90vh] w-full max-w-lg flex-col gap-4 overflow-hidden p-0 \${\n          adminText.dir === "rtl"\n            ? "[&>button]:left-4 [&>button]:right-auto"\n            : "[&>button]:right-4 [&>button]:left-auto"\n        }\`}\n        dir={adminText.dir}\n      >\n        <DialogHeader\n          className={\`w-full px-6 pb-0 pt-5 \${textAlignmentClass} \${\n            adminText.dir === "rtl" ? "pl-14" : "pr-14"\n          }\`}\n        >\n          <DialogTitle\n            className={\`flex w-full items-center gap-2 text-lg leading-6 text-destructive \${textAlignmentClass}\`}\n          >`,
);

source = replaceOnce(
  source,
  "scrollable body and merchant card",
  `        <div className="rounded-xl border bg-muted/40 p-4 text-sm">`,
  `        <div\n          className={\`min-h-0 flex-1 space-y-4 overflow-y-auto px-6 pb-2 \${textAlignmentClass}\`}\n        >\n          <div\n            className={\`rounded-xl border bg-muted/40 p-4 text-sm \${textAlignmentClass}\`}\n          >`,
);

source = replaceOnce(
  source,
  "merchant identity direction",
  `          <p className="mt-1 text-muted-foreground">\n            {merchant.owner_name} · {merchant.phone}\n          </p>\n        </div>`,
  `            <p className="font-bold">{merchant.store_name}</p>\n            <p className="mt-1 text-muted-foreground">\n              {merchant.owner_name}\n              <span className="mx-1">·</span>\n              <span dir="ltr">{merchant.phone}</span>\n            </p>\n          </div>`,
);

source = replaceOnce(
  source,
  "remove duplicated merchant name after wrapping",
  `          <p className="font-bold">{merchant.store_name}</p>\n            <p className="font-bold">{merchant.store_name}</p>`,
  `            <p className="font-bold">{merchant.store_name}</p>`,
);

source = replaceOnce(
  source,
  "reason step alignment",
  `        {step === "reason" && (\n          <div className="space-y-4">`,
  `          {step === "reason" && (\n            <div className={\`space-y-4 \${textAlignmentClass}\`}>`,
);

source = replaceOnce(
  source,
  "reason label alignment",
  `              <Label>{adminText.deletionReasonLabel}</Label>`,
  `              <Label className={\`block \${textAlignmentClass}\`}>\n                {adminText.deletionReasonLabel}\n              </Label>`,
);

source = replaceOnce(
  source,
  "policy option styling",
  `              <label className="flex cursor-pointer items-start gap-3 rounded-xl border p-3">`,
  `              <label\n                className={\`flex cursor-pointer items-start gap-3 rounded-xl border p-3 transition-colors \${\n                  reason === "policy_violation"\n                    ? "border-primary bg-primary/5"\n                    : "border-border hover:border-primary/40"\n                }\`}\n              >`,
);

source = replaceOnce(
  source,
  "policy radio styling",
  `                  className="mt-1"\n                />`,
  `                  className="mt-1 accent-primary"\n                />`,
);

source = replaceCount(
  source,
  "option text alignment",
  `                <span>\n                  <span className="block font-semibold">`,
  `                <span className={\`min-w-0 flex-1 \${textAlignmentClass}\`}>\n                  <span className="block font-semibold">`,
  2,
);

source = replaceOnce(
  source,
  "retention option styling",
  `                className={\`flex items-start gap-3 rounded-xl border p-3 \${\n                  retentionEligible\n                    ? "cursor-pointer"\n                    : "cursor-not-allowed opacity-50"\n                }\`}`,
  `                className={\`flex items-start gap-3 rounded-xl border p-3 transition-colors \${\n                  retentionEligible\n                    ? reason === "retention_expired"\n                      ? "cursor-pointer border-primary bg-primary/5"\n                      : "cursor-pointer border-border hover:border-primary/40"\n                    : "cursor-not-allowed border-border bg-muted/30 opacity-60"\n                }\`}`,
);

source = replaceOnce(
  source,
  "retention radio styling",
  `                  onChange={() => setReason("retention_expired")}\n                  className="mt-1"`,
  `                  onChange={() => setReason("retention_expired")}\n                  className="mt-1 accent-primary"`,
);

source = replaceOnce(
  source,
  "details field alignment",
  `            <div className="space-y-2">\n              <Label htmlFor="deletion-request-details">\n                {adminText.deletionDetailsLabel}\n              </Label>\n              <Textarea`,
  `            <div className={\`space-y-2 \${textAlignmentClass}\`}>\n              <Label\n                htmlFor="deletion-request-details"\n                className={\`block \${textAlignmentClass}\`}\n              >\n                {adminText.deletionDetailsLabel}\n              </Label>\n              <Textarea`,
);

source = replaceOnce(
  source,
  "details textarea layout",
  `                id="deletion-request-details"\n                value={details}`,
  `                id="deletion-request-details"\n                className={\`min-h-28 resize-none \${textAlignmentClass}\`}\n                value={details}`,
);

source = replaceOnce(
  source,
  "review step alignment",
  `        {step === "review" && deletionRequest && (\n          <div className="space-y-3 text-sm">`,
  `          {step === "review" && deletionRequest && (\n            <div className={\`space-y-3 text-sm \${textAlignmentClass}\`}>`,
);

source = replaceCount(
  source,
  "review cards alignment",
  `            <div className="rounded-xl border p-3">`,
  `            <div className={\`rounded-xl border p-3 \${textAlignmentClass}\`}>`,
  2,
);

source = replaceOnce(
  source,
  "password step alignment",
  `        {step === "password" && (\n          <div className="space-y-4">`,
  `          {step === "password" && (\n            <div className={\`space-y-4 \${textAlignmentClass}\`}>`,
);

source = replaceOnce(
  source,
  "password label alignment",
  `              <Label htmlFor="delete-owner-password">\n                {adminText.deletionOwnerPasswordLabel}\n              </Label>`,
  `              <Label\n                htmlFor="delete-owner-password"\n                className={\`block \${textAlignmentClass}\`}\n              >\n                {adminText.deletionOwnerPasswordLabel}\n              </Label>`,
);

source = replaceOnce(
  source,
  "password input direction",
  `                id="delete-owner-password"\n                type="password"`,
  `                id="delete-owner-password"\n                type="password"\n                dir="ltr"`,
);

source = replaceOnce(
  source,
  "final warning alignment",
  `        {step === "final" && (\n          <div className="rounded-xl border border-destructive/40 bg-destructive/10 p-4">`,
  `          {step === "final" && (\n            <div\n              className={\`rounded-xl border border-destructive/40 bg-destructive/10 p-4 \${textAlignmentClass}\`}\n            >`,
);

source = replaceOnce(
  source,
  "close scroll body and responsive footer",
  `        <DialogFooter className="flex-row-reverse gap-2 sm:justify-start">`,
  `        </div>\n\n        <DialogFooter\n          className="flex flex-col gap-2 border-t px-6 pb-5 pt-4 sm:flex-row-reverse sm:justify-start [&>button]:h-auto [&>button]:min-h-10 [&>button]:w-full [&>button]:whitespace-normal [&>button]:px-4 [&>button]:py-2 sm:[&>button]:w-auto"\n          dir="ltr"\n        >`,
);

fs.writeFileSync(sourcePath, source, "utf8");

const finalSource = fs.readFileSync(sourcePath, "utf8");
for (const marker of [
  "max-h-[90vh] w-full max-w-lg",
  'adminText.dir === "rtl" ? "pl-14" : "pr-14"',
  "min-h-0 flex-1 space-y-4 overflow-y-auto",
  "border-primary bg-primary/5",
  "min-h-28 resize-none",
  "border-t px-6 pb-5 pt-4",
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
run('git commit -m "Refine deletion request dialog layout"');
run(`git push origin ${branch}`);

console.log("\nCompleted: deletion request dialog refined without changing its approval workflow.");
