import fs from "node:fs";
import { execSync } from "node:child_process";

const sourcePath = "artifacts/fawri/src/pages/AdminPage.tsx";
const selfPath = "scripts/localize-approved-admin-log-details.mjs";
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
  "approved audit log localization",
  `      case "approved":\n        return plan\n          ? formatAdminMessage(adminText.logMerchantApproved, {\n              plan,\n            })\n          : log.details;`,
  `      case "approved":\n        return adminText.logMerchantApproved;`,
);

fs.writeFileSync(sourcePath, source, "utf8");

const finalSource = fs.readFileSync(sourcePath, "utf8");
const approvedCaseStart = finalSource.indexOf('      case "approved":');
const approvedCaseEnd = finalSource.indexOf('      case "rejected":', approvedCaseStart);
if (approvedCaseStart === -1 || approvedCaseEnd === -1) {
  throw new Error("Could not verify approved audit log formatter");
}

const approvedCase = finalSource.slice(approvedCaseStart, approvedCaseEnd);
if (!approvedCase.includes("return adminText.logMerchantApproved;")) {
  throw new Error("Approved audit log does not use the localized message");
}
if (approvedCase.includes("log.details")) {
  throw new Error("Approved audit log still falls back to raw server details");
}

run("pnpm run typecheck");
run("PORT=3000 BASE_PATH=/ pnpm --filter @workspace/fawri run build");

fs.rmSync(selfPath);
run("git diff --check");
run(`git add ${sourcePath} ${selfPath}`);
run('git commit -m "Localize approved merchant audit logs"');
run(`git push origin ${branch}`);

console.log("\nCompleted: approved merchant audit logs no longer expose raw English server details.");
