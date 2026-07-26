import fs from "node:fs";
import { execFileSync, execSync } from "node:child_process";

const branch = "feature/admin-permissions-v2";
const target = "scripts/move-subscriptions-to-server.mjs";
const cleanupPaths = [
  "scripts/repair-subscription-migration.mjs",
  "scripts/finalize-subscription-server-migration.mjs",
];
const self = "scripts/recover-and-run-subscription-migration.mjs";
const restorePaths = [
  "artifacts/api-server/src/routes/auth.ts",
  "artifacts/api-server/tests/admin-permissions.integration.test.mjs",
  "artifacts/fawri/src/pages/AdminPage.tsx",
  "artifacts/fawri/src/lib/store.ts",
  "artifacts/fawri/src/lib/admin-translations.ts",
  target,
];

function run(command) {
  console.log(`\n> ${command}`);
  execSync(command, { stdio: "inherit", shell: "/bin/bash" });
}

function replaceRequired(source, label, before, after) {
  const count = source.split(before).length - 1;
  if (count !== 1) {
    throw new Error(`${label}: expected one match, found ${count}`);
  }
  return source.replace(before, after);
}

console.log("Restoring only the source files partially modified by the failed migration runs...");
for (const path of restorePaths) {
  const committed = execFileSync("git", ["show", `HEAD:${path}`], {
    encoding: "utf8",
  });
  fs.writeFileSync(path, committed, "utf8");
}

let source = fs.readFileSync(target, "utf8");
source = replaceRequired(
  source,
  "migration key syntax",
  '    const migrationKey = `fawri_subscriptions_migrated_v1_${currentAdmin.id}`;',
  '    const migrationKey = "fawri_subscriptions_migrated_v1_" + currentAdmin.id;',
);
source = replaceRequired(
  source,
  "English translation source marker",
  '    `    noSubscriptionError: "No subscription found",`,',
  '    `    noSubscriptionError: "No subscription found.",`,',
);
source = replaceRequired(
  source,
  "English translation output marker",
  '    `    noSubscriptionError: "No subscription found",\\n    subscriptionOperationError:',
  '    `    noSubscriptionError: "No subscription found.",\\n    subscriptionOperationError:',
);
source = replaceRequired(
  source,
  "Kurdish translation source marker",
  '    `  noSubscriptionError: "هیچ بەشدارییەک نییە",`,',
  '    `  noSubscriptionError: "هیچ بەشدارییەکی چالاک نەدۆزرایەوە",`,',
);
source = replaceRequired(
  source,
  "Kurdish translation output marker",
  '    `  noSubscriptionError: "هیچ بەشدارییەک نییە",\\n  subscriptionOperationError:',
  '    `  noSubscriptionError: "هیچ بەشدارییەکی چالاک نەدۆزرایەوە",\\n  subscriptionOperationError:',
);
fs.writeFileSync(target, source, "utf8");

run(`node --check ${target}`);
run(`node ${target}`);

for (const path of cleanupPaths) {
  if (fs.existsSync(path)) fs.rmSync(path);
}
fs.rmSync(self);
run(`git add ${cleanupPaths.join(" ")} ${self}`);
run('git commit -m "Remove subscription migration recovery helpers"');
run(`git push origin ${branch}`);

console.log("\nCompleted: clean subscription migration executed, validated, committed, and temporary recovery helpers removed.");
