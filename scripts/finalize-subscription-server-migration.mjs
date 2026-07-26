import fs from "node:fs";
import { execSync } from "node:child_process";

const target = "scripts/move-subscriptions-to-server.mjs";
const obsoleteHelper = "scripts/repair-subscription-migration.mjs";
const self = "scripts/finalize-subscription-server-migration.mjs";
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

let source = fs.readFileSync(target, "utf8");

source = replaceOnce(
  source,
  "migration key syntax",
  '    const migrationKey = `fawri_subscriptions_migrated_v1_${currentAdmin.id}`;',
  '    const migrationKey = "fawri_subscriptions_migrated_v1_" + currentAdmin.id;',
);
source = replaceOnce(
  source,
  "English no-subscription marker",
  '    noSubscriptionError: "No subscription found",',
  '    noSubscriptionError: "No subscription found.",',
);
source = replaceOnce(
  source,
  "Kurdish no-subscription marker",
  '  noSubscriptionError: "هیچ بەشدارییەک نییە",',
  '  noSubscriptionError: "هیچ بەشدارییەکی چالاک نەدۆزرایەوە",',
);

fs.writeFileSync(target, source, "utf8");

run(`node --check ${target}`);
run(`node ${target}`);

if (fs.existsSync(obsoleteHelper)) fs.rmSync(obsoleteHelper);
fs.rmSync(self);
run(`git add ${obsoleteHelper} ${self}`);
run('git commit -m "Remove subscription migration helpers"');
run(`git push origin ${branch}`);

console.log("\nCompleted: server-authoritative subscription migration finished and temporary helpers were removed.");
