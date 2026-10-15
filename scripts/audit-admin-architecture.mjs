import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const pagesDir = path.join(root, "artifacts/fawri/src/pages");

function walk(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    return entry.isDirectory() ? walk(full) : [full];
  });
}

function relative(file) {
  return path.relative(root, file).replaceAll(path.sep, "/");
}

function requireFile(relativePath) {
  const file = path.join(root, relativePath);
  if (!fs.existsSync(file)) throw new Error(`Missing canonical admin file: ${relativePath}`);
  return fs.readFileSync(file, "utf8");
}

const canonicalWorkspace = "artifacts/fawri/src/pages/AdminEarlyWarningWorkspacePage.tsx";
const canonicalProviderCosts = "artifacts/fawri/src/pages/ProviderCostSettings.tsx";
const canonicalEntry = "artifacts/fawri/src/pages/AdminEarlyWarningPage.tsx";
const canonicalCss = "artifacts/fawri/src/pages/adminEarlyWarning.css";
const workspaceCopy = "artifacts/fawri/src/lib/translations/features/pages/AdminEarlyWarningWorkspace.ts";
const providerCostCopy = "artifacts/fawri/src/lib/translations/features/pages/ProviderCostSettings.ts";

const workspaceSource = requireFile(canonicalWorkspace);
const providerCostSource = requireFile(canonicalProviderCosts);
const entrySource = requireFile(canonicalEntry);
const cssSource = requireFile(canonicalCss);
const workspaceCopySource = requireFile(workspaceCopy);
const providerCostCopySource = requireFile(providerCostCopy);

const legacyFiles = [
  "artifacts/fawri/src/pages/AdminEarlyWarningWorkspacePageV2.tsx",
  "artifacts/fawri/src/pages/AdminEarlyWarningWorkspacePageFinal.tsx",
  "artifacts/fawri/src/pages/ProviderCostSettingsV2.tsx",
  "artifacts/fawri/src/pages/adminEarlyWarningFinal.css",
];
for (const legacy of legacyFiles) {
  if (fs.existsSync(path.join(root, legacy))) throw new Error(`Legacy admin implementation still exists: ${legacy}`);
}

if (!workspaceSource.includes("ADMIN_EARLY_WARNING_WORKSPACE_COPY")) {
  throw new Error("Early-warning workspace is not using its canonical copy authority");
}
if (!providerCostSource.includes("PROVIDER_COST_SETTINGS_TEXT") || !providerCostSource.includes("PROVIDER_COST_METER_LABELS")) {
  throw new Error("Provider-cost settings is not using its canonical copy authority");
}
if (!workspaceSource.includes("data-provider-cost-settings-launcher")) {
  throw new Error("Stable provider-cost launcher hook is missing from the early-warning workspace");
}
if (!providerCostSource.includes("[data-provider-cost-settings-launcher]")) {
  throw new Error("Provider-cost settings still depends on visible translated text to find its launcher");
}
if (!providerCostSource.includes("provider-cost-settings-modal")) {
  throw new Error("Stable provider-cost modal styling hook is missing");
}
if (entrySource.includes("MutationObserver") || entrySource.includes("isolateYearMonthText")) {
  throw new Error("Early-warning entry still contains transitional DOM mutation logic");
}
if (cssSource.includes("body > div.fixed") || cssSource.includes("section.max-w-6xl[dir]")) {
  throw new Error("Early-warning CSS still contains brittle portal DOM selectors");
}

for (const [name, source] of [[workspaceCopy, workspaceCopySource], [providerCostCopy, providerCostCopySource]]) {
  for (const lang of ["ar:", "ku:", "en:"]) {
    if (!source.includes(lang)) throw new Error(`${name} is missing ${lang.slice(0, 2)} copy`);
  }
}

const adminUiFiles = walk(pagesDir).filter((file) => {
  const rel = relative(file);
  const base = path.basename(file);
  return /\.(tsx|ts)$/.test(base) && (rel.includes("/pages/admin/") || /^Admin.*\.(tsx|ts)$/.test(base) || base === "ProviderCostSettings.tsx");
});

const versionedAdminFiles = adminUiFiles.filter((file) => /(?:V\d+|Final)\.(?:tsx|ts)$/.test(path.basename(file)));
if (versionedAdminFiles.length > 0) {
  throw new Error(`Version-suffixed admin implementations found:\n${versionedAdminFiles.map(relative).join("\n")}`);
}

const localDictionaryPattern = /(?:const|let|var)\s+[A-Z0-9_]*(?:TEXT|COPY|TRANSLATIONS)[A-Z0-9_]*\s*(?::[^=]+)?=\s*\{[\s\S]{0,300}?\b(?:ar|ku|en)\s*:/m;
const localDictionaryFiles = adminUiFiles.filter((file) => localDictionaryPattern.test(fs.readFileSync(file, "utf8")));
if (localDictionaryFiles.length > 0) {
  throw new Error(`Page-local multilingual dictionaries found:\n${localDictionaryFiles.map(relative).join("\n")}`);
}

const hardcodedRtlFiles = adminUiFiles.filter((file) => /[\u0600-\u06FF]/u.test(fs.readFileSync(file, "utf8")));
if (hardcodedRtlFiles.length > 0) {
  throw new Error(`Arabic/Kurdish UI copy remains inside admin page/controller files:\n${hardcodedRtlFiles.map(relative).join("\n")}`);
}

console.log(`Admin architecture audit PASS (${adminUiFiles.length} admin UI files checked).`);
