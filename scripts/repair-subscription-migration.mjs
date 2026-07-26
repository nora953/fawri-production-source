import fs from "node:fs";
import { execSync } from "node:child_process";

const target = "scripts/move-subscriptions-to-server.mjs";
const self = "scripts/repair-subscription-migration.mjs";
const branch = "feature/admin-permissions-v2";

function run(command) {
  console.log(`\n> ${command}`);
  execSync(command, { stdio: "inherit", shell: "/bin/bash" });
}

let source = fs.readFileSync(target, "utf8");
const before = '    const migrationKey = `fawri_subscriptions_migrated_v1_${currentAdmin.id}`;';
const after = '    const migrationKey = "fawri_subscriptions_migrated_v1_" + currentAdmin.id;';
const count = source.split(before).length - 1;

if (count !== 1) {
  throw new Error(`Expected one migration-key syntax match, found ${count}`);
}

source = source.replace(before, after);
fs.writeFileSync(target, source, "utf8");

run(`node --check ${target}`);
run(`node ${target}`);

fs.rmSync(self);
run(`git add ${self}`);
run('git commit -m "Remove subscription migration repair helper"');
run(`git push origin ${branch}`);

console.log("\nCompleted: syntax repaired and server-authoritative subscription migration executed.");
