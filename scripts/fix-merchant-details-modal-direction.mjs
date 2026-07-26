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
  "details modal text alignment",
  `  const locale = lang === "en" ? "en-US" : "ar-IQ";\n\n  const planNames: Record<PlanKey, string> = {`,
  `  const locale = lang === "en" ? "en-US" : "ar-IQ";\n  const textAlignmentClass =\n    adminText.dir === "rtl"\n      ? "!text-right sm:!text-right"\n      : "!text-left sm:!text-left";\n\n  const planNames: Record<PlanKey, string> = {`,
);

replaceOnce(
  "localized subscription plan name",
  `        [\n          adminText.detailsPlan,\n          \`\${planNames[sub.plan_name as PlanKey] ?? sub.plan_name} — \${\n            PLANS[sub.plan_name as PlanKey]?.label ?? ""\n          }\`,\n        ],`,
  `        [\n          adminText.detailsPlan,\n          planNames[sub.plan_name as PlanKey] ?? sub.plan_name,\n        ],`,
);

replaceOnce(
  "details modal directional content",
  `      <DialogContent\n        className="flex max-h-[90vh] w-full max-w-2xl flex-col p-0"\n        dir={adminText.dir}\n      >\n        <DialogHeader className="px-6 pb-0 pt-5">\n          <DialogTitle className="text-base">`,
  `      <DialogContent\n        className={\`flex max-h-[90vh] w-full max-w-2xl flex-col p-0 \${\n          adminText.dir === "rtl"\n            ? "[&>button]:left-4 [&>button]:right-auto"\n            : "[&>button]:right-4 [&>button]:left-auto"\n        }\`}\n        dir={adminText.dir}\n      >\n        <DialogHeader className={\`px-6 pb-0 pt-5 \${textAlignmentClass}\`}>\n          <DialogTitle className={\`w-full text-base \${textAlignmentClass}\`}>`,
);

fs.writeFileSync(filePath, source, "utf8");

const finalSource = fs.readFileSync(filePath, "utf8");
for (const marker of [
  `planNames[sub.plan_name as PlanKey] ?? sub.plan_name,`,
  `[&>button]:left-4 [&>button]:right-auto`,
  `<DialogTitle className={\`w-full text-base \${textAlignmentClass}\`}>`,
]) {
  if (!finalSource.includes(marker)) throw new Error(`Missing marker: ${marker}`);
}

if (finalSource.includes(`PLANS[sub.plan_name as PlanKey]?.label`)) {
  throw new Error("Duplicate English plan label remains in details modal");
}

console.log("Merchant details modal direction and localized plan name fixed.");
