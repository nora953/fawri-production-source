import fs from "node:fs";
import { execSync } from "node:child_process";

const pagePath = "artifacts/fawri/src/pages/AdminPage.tsx";
const translationsPath = "artifacts/fawri/src/lib/admin-translations.ts";
const selfPath = "scripts/refine-admin-header-brand-and-identity.mjs";
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

let page = fs.readFileSync(pagePath, "utf8");
let translations = fs.readFileSync(translationsPath, "utf8");

page = replaceOnce(
  page,
  "admin header layout",
  `      {/* Header */}\n      <header className="sticky top-0 z-40 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">\n        <div className="mx-auto flex max-w-7xl flex-col gap-2 px-4 py-2 sm:min-h-14 sm:flex-row sm:items-center sm:justify-between md:px-6">\n          <span className="text-base font-bold leading-tight text-primary fowri-header-brand-font sm:text-lg">\n            {adminText.mainAdminTitle}\n          </span>\n          <div className="flex w-full items-center justify-between gap-2 sm:w-auto sm:justify-end sm:gap-3">\n            <span className="text-sm text-muted-foreground hidden sm:block">\n              {currentAdmin?.phone}\n            </span>\n            <div className="flex items-center border rounded-md overflow-hidden text-xs font-medium">\n              {(["ar", "ku", "en"] as const).map((l) => (\n                <button\n                  key={l}\n                  onClick={() => setLang(l)}\n                  className={\`px-2 py-1 transition-colors \${\n                    lang === l\n                      ? "bg-primary text-white"\n                      : "text-muted-foreground hover:text-foreground"\n                  }\`}\n                >\n                  {l === "ar" ? adminText.langAr : l === "ku" ? adminText.langKu : adminText.langEn}\n                </button>\n              ))}\n            </div>\n            <Button\n              variant="outline"\n              size="sm"\n              onClick={() => {\n                clearSession();\n                setLocation("/");\n              }}\n            >\n              <LogOut\n                className={\`w-4 h-4 \${\n                  adminText.dir === "rtl" ? "ml-1.5" : "mr-1.5"\n                }\`}\n              />\n              {adminText.mainLogout}\n            </Button>\n          </div>\n        </div>\n      </header>`,
  `      {/* Header */}\n      <header className="sticky top-0 z-40 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">\n        <div className="mx-auto max-w-7xl px-4 py-2 md:px-6">\n          <div className="relative flex min-h-11 items-center justify-between gap-3">\n            <div className="flex min-w-0 shrink-0 items-center gap-2">\n              <img\n                src="/fawri-logo.svg"\n                alt=""\n                aria-hidden="true"\n                className="h-9 w-auto shrink-0 object-contain sm:h-10"\n                loading="eager"\n                draggable={false}\n              />\n              <span className="truncate text-base font-bold leading-tight text-foreground sm:text-lg">\n                {adminText.mainAdminTitle}\n              </span>\n            </div>\n\n            {currentAdmin && (\n              <div className="absolute left-1/2 hidden -translate-x-1/2 items-center gap-2 rounded-full border bg-card/90 px-3 py-1.5 text-sm shadow-sm md:flex">\n                <span className="max-w-44 truncate font-semibold text-foreground">\n                  {currentAdmin.owner_name}\n                </span>\n                <span className="h-4 w-px bg-border" aria-hidden="true" />\n                <span className="font-medium tabular-nums text-muted-foreground" dir="ltr">\n                  {currentAdmin.phone}\n                </span>\n              </div>\n            )}\n\n            <div className="flex shrink-0 items-center gap-2 sm:gap-3">\n              <div className="flex items-center overflow-hidden rounded-md border text-xs font-medium">\n                {(["ar", "ku", "en"] as const).map((l) => (\n                  <button\n                    key={l}\n                    onClick={() => setLang(l)}\n                    className={\`px-2 py-1 transition-colors \${\n                      lang === l\n                        ? "bg-primary text-white"\n                        : "text-muted-foreground hover:text-foreground"\n                    }\`}\n                  >\n                    {l === "ar" ? adminText.langAr : l === "ku" ? adminText.langKu : adminText.langEn}\n                  </button>\n                ))}\n              </div>\n              <Button\n                variant="outline"\n                size="sm"\n                onClick={() => {\n                  clearSession();\n                  setLocation("/");\n                }}\n              >\n                <LogOut\n                  className={\`h-4 w-4 \${\n                    adminText.dir === "rtl" ? "ml-1.5" : "mr-1.5"\n                  }\`}\n                />\n                <span className="hidden sm:inline">{adminText.mainLogout}</span>\n              </Button>\n            </div>\n          </div>\n\n          {currentAdmin && (\n            <div className="mt-2 flex justify-center md:hidden">\n              <div className="inline-flex max-w-full items-center gap-2 rounded-full border bg-card/90 px-3 py-1.5 text-xs shadow-sm">\n                <span className="max-w-40 truncate font-semibold text-foreground">\n                  {currentAdmin.owner_name}\n                </span>\n                <span className="h-3.5 w-px bg-border" aria-hidden="true" />\n                <span className="font-medium tabular-nums text-muted-foreground" dir="ltr">\n                  {currentAdmin.phone}\n                </span>\n              </div>\n            </div>\n          )}\n        </div>\n      </header>`,
);

translations = replaceOnce(
  translations,
  "Arabic admin header title",
  `    mainAdminTitle: "لوحة إدارة فوري",`,
  `    mainAdminTitle: "لوحة الإدارة",`,
);

translations = replaceOnce(
  translations,
  "English admin header title",
  `    mainAdminTitle: "Fawri Admin Panel",`,
  `    mainAdminTitle: "Admin Panel",`,
);

translations = replaceOnce(
  translations,
  "Kurdish admin header title",
  `  mainAdminTitle: "پانێلی بەڕێوەبردنی فوری",`,
  `  mainAdminTitle: "پانێلی بەڕێوەبردن",`,
);

fs.writeFileSync(pagePath, page, "utf8");
fs.writeFileSync(translationsPath, translations, "utf8");

for (const [path, markers] of [
  [pagePath, [
    'src="/fawri-logo.svg"',
    "currentAdmin.owner_name",
    "currentAdmin.phone",
    "absolute left-1/2 hidden -translate-x-1/2",
    "mt-2 flex justify-center md:hidden",
  ]],
  [translationsPath, [
    'mainAdminTitle: "لوحة الإدارة"',
    'mainAdminTitle: "Admin Panel"',
    'mainAdminTitle: "پانێلی بەڕێوەبردن"',
  ]],
]) {
  const source = fs.readFileSync(path, "utf8");
  for (const marker of markers) {
    if (!source.includes(marker)) {
      throw new Error(`${path}: missing expected marker ${marker}`);
    }
  }
}

run("pnpm run typecheck");
run("PORT=3000 BASE_PATH=/ pnpm --filter @workspace/fawri run build");
run("pnpm --filter @workspace/api-server run test:admin-permissions");
run("pnpm --filter @workspace/api-server run test:merchant-session");

fs.rmSync(selfPath);
run("git diff --check");
run(`git add ${pagePath} ${translationsPath} ${selfPath}`);
run('git commit -m "Refine admin header branding and identity"');
run(`git push origin ${branch}`);

console.log("\nCompleted: the admin header now uses the landing-page Fawri logo, a shorter localized admin title, and a centered administrator name and phone across responsive layouts.");
