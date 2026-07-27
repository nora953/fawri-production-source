import fs from "node:fs";
import { execSync } from "node:child_process";
import { pathToFileURL } from "node:url";

const migrationPath = "scripts/refine-desktop-merchant-identity-actions.mjs";
const selfPath = "scripts/repair-and-run-desktop-merchant-layout.mjs";
const branch = "feature/admin-permissions-v2";

function run(command) {
  console.log(`\n> ${command}`);
  execSync(command, { stdio: "inherit", shell: "/bin/bash" });
}

let source = fs.readFileSync(migrationPath, "utf8");

const replacements = [
  [
    'className={`${desktopActionButtonClass} bg-green-600 text-white hover:bg-green-700`}',
    'className={desktopActionButtonClass + " bg-green-600 text-white hover:bg-green-700"}',
  ],
  [
    'className={`${desktopActionButtonClass} border-destructive/40 text-destructive hover:bg-destructive/10 hover:text-destructive`}',
    'className={desktopActionButtonClass + " border-destructive/40 text-destructive hover:bg-destructive/10 hover:text-destructive"}',
  ],
];

for (const [before, after] of replacements) {
  const count = source.split(before).length - 1;
  if (count < 1) {
    throw new Error(`Expected migration syntax fragment was not found: ${before}`);
  }
  source = source.split(before).join(after);
}

fs.writeFileSync(migrationPath, source, "utf8");
run(`node --check ${migrationPath}`);

await import(`${pathToFileURL(process.cwd() + "/" + migrationPath).href}?repaired=${Date.now()}`);

fs.rmSync(selfPath);
run(`git add ${selfPath}`);
run('git commit -m "Remove desktop layout recovery runner"');
run(`git push origin ${branch}`);

console.log("\nCompleted: repaired the migration syntax, ran the full desktop merchant layout migration and validation, and removed both temporary scripts.");
