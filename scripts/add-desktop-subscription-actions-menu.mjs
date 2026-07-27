import fs from "node:fs";
import { execSync } from "node:child_process";

const pagePath = "artifacts/fawri/src/pages/AdminPage.tsx";
const selfPath = "scripts/add-desktop-subscription-actions-menu.mjs";
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

page = replaceOnce(
  page,
  "desktop subscription actions",
  `                <Button variant="outline" size="sm" className="h-7 px-2 text-xs" onClick={onAddReplies}>\n                  <Plus className={\`h-3 w-3 \${compactIconSpacingClass}\`} />\n                  {adminText.actionAddShort}\n                </Button>`,
  `                <Button variant="outline" size="sm" className="h-7 px-2 text-xs" onClick={onAddReplies}>\n                  <Plus className={\`h-3 w-3 \${compactIconSpacingClass}\`} />\n                  {adminText.actionAddShort}\n                </Button>\n\n                <DropdownMenu>\n                  <DropdownMenuTrigger asChild>\n                    <Button\n                      variant="outline"\n                      size="sm"\n                      className="h-7 w-7 shrink-0 p-0"\n                      aria-label={adminText.mainTableActions}\n                    >\n                      <MoreVertical className="h-3.5 w-3.5" />\n                    </Button>\n                  </DropdownMenuTrigger>\n\n                  <DropdownMenuContent align="end" className="w-52">\n                    <DropdownMenuItem\n                      onClick={onDeductReplies}\n                      className="text-destructive focus:text-destructive"\n                    >\n                      <Minus className={\`h-3.5 w-3.5 \${iconSpacingClass}\`} />\n                      {adminText.actionDeductReplies}\n                    </DropdownMenuItem>\n\n                    <DropdownMenuSeparator />\n\n                    <DropdownMenuItem onClick={onToggleAutoReply}>\n                      {sub.auto_reply_enabled ? (\n                        <>\n                          <PowerOff className={\`h-3.5 w-3.5 \${iconSpacingClass}\`} />\n                          {adminText.actionDisableAutoReplies}\n                        </>\n                      ) : (\n                        <>\n                          <Power className={\`h-3.5 w-3.5 \${iconSpacingClass}\`} />\n                          {adminText.actionEnableAutoReplies}\n                        </>\n                      )}\n                    </DropdownMenuItem>\n                  </DropdownMenuContent>\n                </DropdownMenu>`,
);

fs.writeFileSync(pagePath, page, "utf8");

const updated = fs.readFileSync(pagePath, "utf8");
for (const marker of [
  'aria-label={adminText.mainTableActions}',
  '{adminText.actionDeductReplies}',
  '{adminText.actionDisableAutoReplies}',
  '{adminText.actionEnableAutoReplies}',
]) {
  if (!updated.includes(marker)) {
    throw new Error(`Missing expected desktop actions marker: ${marker}`);
  }
}

run("pnpm run typecheck");
run("PORT=3000 BASE_PATH=/ pnpm --filter @workspace/fawri run build");
run("pnpm --filter @workspace/api-server run test:admin-permissions");
run("pnpm --filter @workspace/api-server run test:merchant-session");

fs.rmSync(selfPath);
run("git diff --check");
run(`git add ${pagePath} ${selfPath}`);
run('git commit -m "Add desktop subscription actions menu"');
run(`git push origin ${branch}`);

console.log("\nCompleted: desktop subscription actions now include deduct replies and auto-reply toggle in a compact overflow menu.");
