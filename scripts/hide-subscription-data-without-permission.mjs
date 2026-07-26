import fs from "node:fs";
import { execSync } from "node:child_process";

const sourcePath = "artifacts/fawri/src/pages/AdminPage.tsx";
const selfPath = "scripts/hide-subscription-data-without-permission.mjs";
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
  "mobile plan visibility",
  `                              {sub && (\n                                <span className="text-[10px] text-muted-foreground capitalize">\n                                  {planNames[sub.plan_name as PlanKey] ?? sub.plan_name}\n                                </span>\n                              )}`,
  `                              {canManageSubscriptions && sub && (\n                                <span className="text-[10px] text-muted-foreground capitalize">\n                                  {planNames[sub.plan_name as PlanKey] ?? sub.plan_name}\n                                </span>\n                              )}`,
);

source = replaceOnce(
  source,
  "mobile replies visibility",
  `                          {sub && (\n                            <div className="bg-muted/50 rounded-md p-2 text-xs">`,
  `                          {canManageSubscriptions && sub && (\n                            <div className="bg-muted/50 rounded-md p-2 text-xs">`,
);

source = replaceOnce(
  source,
  "desktop subscription status visibility",
  `                              {sub && (\n                                <div>\n                                  <SubBadge`,
  `                              {canManageSubscriptions && sub && (\n                                <div>\n                                  <SubBadge`,
);

source = replaceOnce(
  source,
  "desktop conditional subscription header",
  `                        {[\n                          adminText.mainTableStoreOwner,\n                          adminText.mainTablePhoneActivity,\n                          adminText.mainTableStatus,\n                          adminText.mainTablePlanReplies,\n                          adminText.mainTableRegistered,\n                          adminText.mainTableActions,\n                        ].map((h) => (`,
  `                        {[\n                          adminText.mainTableStoreOwner,\n                          adminText.mainTablePhoneActivity,\n                          adminText.mainTableStatus,\n                          ...(canManageSubscriptions\n                            ? [adminText.mainTablePlanReplies]\n                            : []),\n                          adminText.mainTableRegistered,\n                          adminText.mainTableActions,\n                        ].map((h) => (`,
);

source = replaceOnce(
  source,
  "desktop conditional subscription cell open",
  `                            <td className="px-4 py-3">\n                              {sub ? (\n                                <div className="space-y-1">\n                                  <span className="text-xs font-medium capitalize">\n                                    {planNames[sub.plan_name as PlanKey] ?? sub.plan_name}\n                                  </span>`,
  `                            {canManageSubscriptions && (\n                              <td className="px-4 py-3">\n                                {sub ? (\n                                  <div className="space-y-1">\n                                    <span className="text-xs font-medium capitalize">\n                                      {planNames[sub.plan_name as PlanKey] ?? sub.plan_name}\n                                    </span>`,
);

source = replaceOnce(
  source,
  "desktop conditional subscription cell close",
  `                              ) : (\n                                <span className="text-xs text-muted-foreground">\n                                  —\n                                </span>\n                              )}\n                            </td>\n                            <td className="px-4 py-3 text-xs text-muted-foreground">`,
  `                                ) : (\n                                  <span className="text-xs text-muted-foreground">\n                                    —\n                                  </span>\n                                )}\n                              </td>\n                            )}\n                            <td className="px-4 py-3 text-xs text-muted-foreground">`,
);

fs.writeFileSync(sourcePath, source, "utf8");

const finalSource = fs.readFileSync(sourcePath, "utf8");
for (const marker of [
  "canManageSubscriptions && sub && (",
  "...(canManageSubscriptions",
  "{canManageSubscriptions && (",
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
run('git commit -m "Hide subscription data without permission"');
run(`git push origin ${branch}`);

console.log("\nCompleted: subscription data is hidden without manage_subscriptions, validated, committed, and pushed.");
