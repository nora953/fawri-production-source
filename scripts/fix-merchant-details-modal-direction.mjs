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
  throw new Error("Could not isolate the merchant details modal section");
}

let detailsSection = source.slice(sectionStart, sectionEnd);

function replaceOnce(label, before, after) {
  if (detailsSection.includes(after)) return;
  const first = detailsSection.indexOf(before);
  if (first === -1) throw new Error(`Could not find ${label}`);
  if (detailsSection.indexOf(before, first + before.length) !== -1) {
    throw new Error(`Found multiple matches for ${label} inside DetailsModal`);
  }
  detailsSection =
    detailsSection.slice(0, first) +
    after +
    detailsSection.slice(first + before.length);
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

const updatedSource =
  source.slice(0, sectionStart) + detailsSection + source.slice(sectionEnd);
fs.writeFileSync(filePath, updatedSource, "utf8");

const finalSource = fs.readFileSync(filePath, "utf8");
const finalSectionStart = finalSource.indexOf(sectionStartMarker);
const finalSectionEnd = finalSource.indexOf(sectionEndMarker, finalSectionStart);
const finalDetailsSection = finalSource.slice(finalSectionStart, finalSectionEnd);

for (const marker of [
  `planNames[sub.plan_name as PlanKey] ?? sub.plan_name,`,
  `[&>button]:left-4 [&>button]:right-auto`,
  `<DialogTitle className={\`w-full text-base \${textAlignmentClass}\`}>`,
]) {
  if (!finalDetailsSection.includes(marker)) {
    throw new Error(`Missing marker in DetailsModal: ${marker}`);
  }
}

if (finalDetailsSection.includes(`PLANS[sub.plan_name as PlanKey]?.label`)) {
  throw new Error("Duplicate English plan label remains in DetailsModal");
}

console.log("Merchant details modal direction and localized plan name fixed.");
