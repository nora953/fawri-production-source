import fs from "node:fs";
import { execSync } from "node:child_process";

const authPath = "artifacts/api-server/src/routes/auth.ts";
const testPath = "artifacts/api-server/tests/admin-permissions.integration.test.mjs";
const typesPath = "artifacts/fawri/src/lib/types.ts";
const translationsPath = "artifacts/fawri/src/lib/admin-translations.ts";
const adminPagePath = "artifacts/fawri/src/pages/AdminPage.tsx";
const selfPath = "scripts/add-admin-log-executor-identity.mjs";
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

let auth = fs.readFileSync(authPath, "utf8");

auth = replaceOnce(
  auth,
  "backend admin log identity type",
  `type AdminLogRecord = {\n  id: string;\n  admin_phone: string;`,
  `type AdminLogRecord = {\n  id: string;\n  admin_id?: string;\n  admin_name?: string;\n  admin_phone: string;\n  admin_role?: AdminRole;`,
);

auth = replaceOnce(
  auth,
  "backend append identity snapshot",
  `  const log: AdminLogRecord = {\n    id: makeId("admin-log"),\n    admin_phone: admin.phone,`,
  `  const log: AdminLogRecord = {\n    id: makeId("admin-log"),\n    admin_id: admin.id,\n    admin_name: admin.owner_name,\n    admin_phone: admin.phone,\n    admin_role: admin.admin_role,`,
);

auth = replaceOnce(
  auth,
  "legacy migration identity extraction",
  `    const actionType = String(record.action_type || "").trim();\n    const createdAt = String(record.created_at || "").trim();`,
  `    const actionType = String(record.action_type || "").trim();\n    const createdAt = String(record.created_at || "").trim();\n    const adminId = String(record.admin_id || "").trim();\n    const adminName = String(record.admin_name || "").trim();\n    const adminRole = isAdminRole(record.admin_role)\n      ? record.admin_role\n      : undefined;`,
);

auth = replaceOnce(
  auth,
  "legacy migration identity preservation",
  `    db.admin_logs.push({\n      id,\n      admin_phone: String(record.admin_phone || owner.phone).trim(),`,
  `    db.admin_logs.push({\n      id,\n      ...(adminId ? { admin_id: adminId } : {}),\n      ...(adminName ? { admin_name: adminName } : {}),\n      admin_phone: String(record.admin_phone || owner.phone).trim(),\n      ...(adminRole ? { admin_role: adminRole } : {}),`,
);

fs.writeFileSync(authPath, auth, "utf8");

let types = fs.readFileSync(typesPath, "utf8");
types = replaceOnce(
  types,
  "frontend admin log identity type",
  `export interface AdminLog {\n  id: string;\n  admin_phone: string;`,
  `export interface AdminLog {\n  id: string;\n  admin_id?: string;\n  admin_name?: string;\n  admin_phone: string;\n  admin_role?: AdminRole;`,
);
fs.writeFileSync(typesPath, types, "utf8");

let translations = fs.readFileSync(translationsPath, "utf8");
for (const [label, before, after] of [
  [
    "Arabic executor labels",
    `    logsReasonLabel: "السبب",`,
    `    logsReasonLabel: "السبب",\n    logsPerformedByLabel: "نفّذ بواسطة",\n    logsSystemOwner: "مالك النظام",`,
  ],
  [
    "English executor labels",
    `    logsReasonLabel: "Reason",`,
    `    logsReasonLabel: "Reason",\n    logsPerformedByLabel: "Performed by",\n    logsSystemOwner: "System owner",`,
  ],
  [
    "Kurdish executor labels",
    `  logsReasonLabel: "هۆکار",`,
    `  logsReasonLabel: "هۆکار",\n  logsPerformedByLabel: "جێبەجێکراوە لەلایەن",\n  logsSystemOwner: "خاوەنی سیستەم",`,
  ],
]) {
  translations = replaceOnce(translations, label, before, after);
}
fs.writeFileSync(translationsPath, translations, "utf8");

let adminPage = fs.readFileSync(adminPagePath, "utf8");
adminPage = replaceOnce(
  adminPage,
  "render executor identity",
  `                  {log.reason && (\n                    <p className="mt-1 text-xs text-orange-600 dark:text-orange-400">\n                      {adminText.logsReasonLabel}:{" "}\n                      {log.reason}\n                    </p>\n                  )}\n                </div>`,
  `                  {log.reason && (\n                    <p className="mt-1 text-xs text-orange-600 dark:text-orange-400">\n                      {adminText.logsReasonLabel}:{" "}\n                      {log.reason}\n                    </p>\n                  )}\n\n                  {(log.admin_role === "owner_admin" ||\n                    log.admin_name ||\n                    log.admin_phone) && (\n                    <p className="mt-2 flex flex-wrap items-center gap-x-1 text-xs font-medium text-foreground">\n                      <span>{adminText.logsPerformedByLabel}:</span>\n                      {log.admin_role === "owner_admin" ? (\n                        <span>{adminText.logsSystemOwner}</span>\n                      ) : (\n                        <>\n                          {log.admin_name && <span>{log.admin_name}</span>}\n                          {log.admin_name && log.admin_phone && (\n                            <span aria-hidden="true">—</span>\n                          )}\n                          {log.admin_phone && (\n                            <span dir="ltr" className="tabular-nums">\n                              {log.admin_phone}\n                            </span>\n                          )}\n                        </>\n                      )}\n                    </p>\n                  )}\n                </div>`,
);
fs.writeFileSync(adminPagePath, adminPage, "utf8");

let test = fs.readFileSync(testPath, "utf8");
test = replaceOnce(
  test,
  "audit identity integration assertions",
  `  const statusUpdate = await fetch(\`${"${baseUrl}"}/api/auth/merchants/merchant-a/status\`, {\n    method: "PATCH",\n    headers: { ...assistantHeaders, "Content-Type": "application/json" },\n    body: JSON.stringify({ status: "suspended", reason: "test" }),\n  });\n  assert.equal(statusUpdate.status, 200);\n\n  const forbiddenAdmins = await fetch`,
  `  const statusUpdate = await fetch(\`${"${baseUrl}"}/api/auth/merchants/merchant-a/status\`, {\n    method: "PATCH",\n    headers: { ...assistantHeaders, "Content-Type": "application/json" },\n    body: JSON.stringify({ status: "suspended", reason: "test" }),\n  });\n  assert.equal(statusUpdate.status, 200);\n\n  const assistantSubscriptionLog = await json(await fetch(\n    \`${"${baseUrl}"}/api/auth/admin/logs\`,\n    {\n      method: "POST",\n      headers: { ...assistantHeaders, "Content-Type": "application/json" },\n      body: JSON.stringify({\n        action_type: "plan_changed",\n        merchant_id: "merchant-a",\n        details: "subscription audit identity test",\n        meta: { plan: "silver" },\n      }),\n    },\n  ));\n  assert.equal(assistantSubscriptionLog.response.status, 201);\n  assert.equal(assistantSubscriptionLog.body.log.admin_id, "assistant-admin");\n  assert.equal(assistantSubscriptionLog.body.log.admin_name, "Assistant");\n  assert.equal(assistantSubscriptionLog.body.log.admin_phone, "07222222222");\n  assert.equal(assistantSubscriptionLog.body.log.admin_role, "assistant_admin");\n\n  const ownerUnsuspend = await fetch(\n    \`${"${baseUrl}"}/api/auth/merchants/merchant-a/status\`,\n    {\n      method: "PATCH",\n      headers: { ...ownerHeaders, "Content-Type": "application/json" },\n      body: JSON.stringify({ status: "approved" }),\n    },\n  );\n  assert.equal(ownerUnsuspend.status, 200);\n\n  const auditLogs = await json(await fetch(\n    \`${"${baseUrl}"}/api/auth/admin/logs\`,\n    { headers: ownerHeaders },\n  ));\n  assert.equal(auditLogs.response.status, 200);\n\n  const ownerAuditLog = auditLogs.body.logs.find(\n    (log) => log.action_type === "unsuspended",\n  );\n  assert.equal(ownerAuditLog.admin_id, "owner-admin");\n  assert.equal(ownerAuditLog.admin_name, "Owner");\n  assert.equal(ownerAuditLog.admin_phone, "07111111111");\n  assert.equal(ownerAuditLog.admin_role, "owner_admin");\n\n  const assistantAuditLog = auditLogs.body.logs.find(\n    (log) => log.action_type === "suspended",\n  );\n  assert.equal(assistantAuditLog.admin_id, "assistant-admin");\n  assert.equal(assistantAuditLog.admin_name, "Assistant");\n  assert.equal(assistantAuditLog.admin_phone, "07222222222");\n  assert.equal(assistantAuditLog.admin_role, "assistant_admin");\n\n  const forbiddenAdmins = await fetch`,
);
fs.writeFileSync(testPath, test, "utf8");

const finalAuth = fs.readFileSync(authPath, "utf8");
const finalTypes = fs.readFileSync(typesPath, "utf8");
const finalTranslations = fs.readFileSync(translationsPath, "utf8");
const finalAdminPage = fs.readFileSync(adminPagePath, "utf8");
const finalTest = fs.readFileSync(testPath, "utf8");

for (const [label, source, marker] of [
  ["backend admin identity", finalAuth, "admin_name: admin.owner_name"],
  ["frontend admin identity type", finalTypes, "admin_role?: AdminRole"],
  ["Arabic executor label", finalTranslations, 'logsSystemOwner: "مالك النظام"'],
  ["executor UI", finalAdminPage, "adminText.logsPerformedByLabel"],
  ["integration test", finalTest, "assistantSubscriptionLog.body.log.admin_role"],
]) {
  if (!source.includes(marker)) throw new Error(`Missing ${label} marker`);
}

run("pnpm run typecheck");
run("PORT=3000 BASE_PATH=/ pnpm --filter @workspace/fawri run build");
run("pnpm --filter @workspace/api-server run test:admin-permissions");

fs.rmSync(selfPath);
run("git diff --check");
run(`git add ${authPath} ${testPath} ${typesPath} ${translationsPath} ${adminPagePath} ${selfPath}`);
run('git commit -m "Show admin executor identity in logs"');
run(`git push origin ${branch}`);

console.log("\nCompleted: admin audit logs now store and display the authenticated executor identity.");
