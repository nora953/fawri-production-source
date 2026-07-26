import fs from "node:fs";
import { execSync } from "node:child_process";

const sourcePath = "artifacts/fawri/src/pages/AdminPage.tsx";
const selfPath = "scripts/refresh-merchants-after-status-change.mjs";
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
const actionsStart = source.indexOf("  // ── Actions");
const actionsEnd = source.indexOf("  const doResetReplies", actionsStart);
if (actionsStart === -1 || actionsEnd === -1) {
  throw new Error("Could not isolate merchant status actions");
}

let actions = source.slice(actionsStart, actionsEnd);

actions = replaceOnce(
  actions,
  "reject refresh",
  `      updateMerchant(merchantId, apiMerchant);\n      logAction(\n        "rejected",`,
  `      updateMerchant(merchantId, apiMerchant);\n      await refreshMerchantsFromApi();\n      logAction(\n        "rejected",`,
);

actions = replaceOnce(
  actions,
  "suspend refresh",
  `      updateMerchant(merchantId, apiMerchant);\n      updateSub(merchantId, { status: "suspended", auto_reply_enabled: false });\n      logAction(`,
  `      updateMerchant(merchantId, apiMerchant);\n      updateSub(merchantId, { status: "suspended", auto_reply_enabled: false });\n      await refreshMerchantsFromApi();\n      logAction(`,
);

actions = replaceOnce(
  actions,
  "lift suspension refresh",
  `      updateMerchant(merchantId, apiMerchant);\n      updateSub(merchantId, { status: "active", auto_reply_enabled: true });\n      logAction("unsuspended", m, adminText.logMerchantUnsuspended);`,
  `      updateMerchant(merchantId, apiMerchant);\n      updateSub(merchantId, { status: "active", auto_reply_enabled: true });\n      await refreshMerchantsFromApi();\n      logAction("unsuspended", m, adminText.logMerchantUnsuspended);`,
);

actions = replaceOnce(
  actions,
  "restore pending refresh",
  `      updateMerchant(merchantId, apiMerchant);\n      logAction("restore_pending", m, adminText.logMerchantRestored);`,
  `      updateMerchant(merchantId, apiMerchant);\n      await refreshMerchantsFromApi();\n      logAction("restore_pending", m, adminText.logMerchantRestored);`,
);

source = source.slice(0, actionsStart) + actions + source.slice(actionsEnd);
fs.writeFileSync(sourcePath, source, "utf8");

const finalSource = fs.readFileSync(sourcePath, "utf8");
const finalActions = finalSource.slice(
  finalSource.indexOf("  // ── Actions"),
  finalSource.indexOf("  const doResetReplies", finalSource.indexOf("  // ── Actions")),
);

const refreshCount = (finalActions.match(/await refreshMerchantsFromApi\(\);/g) ?? []).length;
if (refreshCount !== 5) {
  throw new Error(`Expected five status refresh calls including approval, found ${refreshCount}`);
}

for (const functionName of [
  "doApprove",
  "doReject",
  "doSuspend",
  "doUnsuspend",
  "doRestorePending",
]) {
  const functionStart = finalActions.indexOf(`const ${functionName}`);
  if (functionStart === -1) throw new Error(`Missing ${functionName}`);
  const functionEnd = finalActions.indexOf("\n  };", functionStart);
  const functionBody = finalActions.slice(functionStart, functionEnd);
  if (!functionBody.includes("await refreshMerchantsFromApi();")) {
    throw new Error(`${functionName} does not refresh merchants before success`);
  }
  const refreshIndex = functionBody.indexOf("await refreshMerchantsFromApi();");
  const toastIndex = functionBody.indexOf("toast.success(");
  if (toastIndex === -1 || refreshIndex > toastIndex) {
    throw new Error(`${functionName} refresh must happen before success toast`);
  }
}

run("pnpm run typecheck");
run("PORT=3000 BASE_PATH=/ pnpm --filter @workspace/fawri run build");

fs.rmSync(selfPath);
run("git diff --check");
run(`git add ${sourcePath} ${selfPath}`);
run('git commit -m "Refresh merchants after status changes"');
run(`git push origin ${branch}`);

console.log("\nCompleted: all merchant status changes now refresh the server list before success feedback.");
