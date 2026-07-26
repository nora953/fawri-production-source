import fs from "node:fs";
import { execSync } from "node:child_process";

const sourcePath = "artifacts/fawri/src/pages/AdminPage.tsx";
const selfPath = "scripts/style-admin-tabs-as-buttons.mjs";
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

let source = fs.readFileSync(sourcePath, "utf8");

source = replaceOnce(
  source,
  "admin tabs wrapper",
  '<div className="-mx-4 grid grid-cols-2 gap-x-2 border-b px-4 sm:grid-cols-3 md:mx-0 md:grid-cols-4 md:px-0 lg:flex lg:overflow-x-auto">',
  '<div className="-mx-4 grid grid-cols-2 gap-2 px-4 sm:grid-cols-3 md:mx-0 md:grid-cols-4 md:px-0 lg:flex lg:flex-wrap">',
);

source = replaceOnce(
  source,
  "admin tab button styling",
  'className={`w-full min-w-0 px-2 py-2.5 text-xs font-medium whitespace-normal leading-4 border-b-2 -mb-px transition-colors lg:w-auto lg:whitespace-nowrap lg:px-4 lg:text-sm ${tab === t.id ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"}`}',
  'className={`flex min-h-11 w-full min-w-0 items-center justify-center rounded-xl border px-3 py-2 text-xs font-medium whitespace-normal leading-4 transition-colors lg:w-auto lg:min-w-28 lg:whitespace-nowrap lg:px-4 lg:text-sm ${tab === t.id ? "border-primary bg-primary/10 text-primary shadow-sm" : "border-border bg-card text-muted-foreground hover:border-primary/40 hover:bg-muted/40 hover:text-foreground"}`}',
);

source = replaceOnce(
  source,
  "admin tab count badge",
  `                  <span\n                    className={\`text-xs px-1.5 py-0.5 rounded-full \${\n                      adminText.dir === "rtl" ? "mr-1.5" : "ml-1.5"\n                    } \${\n                      tab === t.id ? "bg-primary/15" : "bg-muted"\n                    }\`}\n                  >`,
  `                  <span\n                    className={\`inline-flex min-w-5 items-center justify-center rounded-full px-1.5 py-0.5 text-[10px] font-semibold \${\n                      adminText.dir === "rtl" ? "mr-1.5" : "ml-1.5"\n                    } \${\n                      tab === t.id\n                        ? "bg-primary text-primary-foreground"\n                        : "bg-muted text-muted-foreground"\n                    }\`}\n                  >`,
);

fs.writeFileSync(sourcePath, source, "utf8");

const finalSource = fs.readFileSync(sourcePath, "utf8");
for (const marker of [
  "grid-cols-2 gap-2 px-4",
  "rounded-xl border px-3 py-2",
  "bg-primary/10 text-primary shadow-sm",
  "inline-flex min-w-5 items-center justify-center rounded-full",
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
run('git commit -m "Style admin tabs as navigation buttons"');
run(`git push origin ${branch}`);

console.log("\nCompleted: admin navigation tabs styled as framed buttons, validated, committed, and pushed.");
