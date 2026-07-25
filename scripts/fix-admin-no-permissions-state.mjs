import fs from "node:fs";

const adminPagePath = "artifacts/fawri/src/pages/AdminPage.tsx";
const translationsPath = "artifacts/fawri/src/lib/admin-translations.ts";
const testPath = "artifacts/api-server/tests/admin-permissions.integration.test.mjs";

function replaceOnce(source, label, before, after) {
  const first = source.indexOf(before);
  if (first === -1) throw new Error(`Could not find ${label}`);
  if (source.indexOf(before, first + before.length) !== -1) {
    throw new Error(`Found multiple matches for ${label}`);
  }
  return source.slice(0, first) + after + source.slice(first + before.length);
}

let adminPage = fs.readFileSync(adminPagePath, "utf8");
adminPage = replaceOnce(
  adminPage,
  "admin tabs opening",
  `        {/* Tabs */}
        <div className="flex overflow-x-auto border-b no-scrollbar -mx-4 px-4 md:mx-0 md:px-0">`,
  `        {/* Tabs */}
        {TABS.length > 0 && (
          <div className="flex overflow-x-auto border-b no-scrollbar -mx-4 px-4 md:mx-0 md:px-0">`,
);
adminPage = replaceOnce(
  adminPage,
  "admin tabs closing and content branch",
  `        </div>

        {tab === "logs" ? (`,
  `          </div>
        )}

        {!currentAdmin ? null : TABS.length === 0 ? (
          <Card className="mx-auto w-full max-w-lg">
            <CardContent className="px-6 py-12 text-center">
              <p className="font-semibold text-foreground">
                {adminText.mainNoPermissionsTitle}
              </p>
              <p className="mt-2 text-sm text-muted-foreground">
                {adminText.mainNoPermissionsDescription}
              </p>
            </CardContent>
          </Card>
        ) : tab === "logs" ? (`,
);
fs.writeFileSync(adminPagePath, adminPage, "utf8");

let translations = fs.readFileSync(translationsPath, "utf8");
translations = replaceOnce(
  translations,
  "Arabic no-permissions translations",
  `    mainResultsCount: "{count} نتيجة",
    mainNoStores: "لا توجد متاجر",`,
  `    mainResultsCount: "{count} نتيجة",
    mainNoStores: "لا توجد متاجر",
    mainNoPermissionsTitle: "لا توجد صلاحيات ممنوحة لهذا الحساب.",
    mainNoPermissionsDescription: "تواصل مع مالك النظام.",`,
);
translations = replaceOnce(
  translations,
  "English no-permissions translations",
  `    mainResultsCount: "{count} results",
    mainNoStores: "No stores found",`,
  `    mainResultsCount: "{count} results",
    mainNoStores: "No stores found",
    mainNoPermissionsTitle: "No permissions have been granted to this account.",
    mainNoPermissionsDescription: "Contact the system owner.",`,
);
translations = replaceOnce(
  translations,
  "Kurdish no-permissions translations",
  `  mainResultsCount: "{count} ئەنجام",
  mainNoStores: "هیچ فرۆشگایەک نەدۆزرایەوە",`,
  `  mainResultsCount: "{count} ئەنجام",
  mainNoStores: "هیچ فرۆشگایەک نەدۆزرایەوە",
  mainNoPermissionsTitle: "هیچ دەسەڵاتێک بەم هەژمارە نەدراوە.",
  mainNoPermissionsDescription: "پەیوەندی بە خاوەنی سیستەمەوە بکە.",`,
);
fs.writeFileSync(translationsPath, translations, "utf8");

let testSource = fs.readFileSync(testPath, "utf8");
testSource = replaceOnce(
  testSource,
  "zero-permission API assertion",
  `  const revokedMerchantList = await fetch(\`${baseUrl}/api/auth/merchants\`, {
    headers: assistantHeaders,
  });
  assert.equal(revokedMerchantList.status, 403);
});`,
  `  const revokedMerchantList = await fetch(\`${baseUrl}/api/auth/merchants\`, {
    headers: assistantHeaders,
  });
  assert.equal(revokedMerchantList.status, 403);

  const clearPermissions = await json(await fetch(
    \`${baseUrl}/api/auth/admins/assistant-admin/permissions\`,
    {
      method: "PATCH",
      headers: { ...ownerHeaders, "Content-Type": "application/json" },
      body: JSON.stringify({ permissions: [] }),
    },
  ));
  assert.equal(clearPermissions.response.status, 200);
  assert.deepEqual(clearPermissions.body.admin.permissions, []);

  const noPermissionAssistant = await json(await fetch(\`${baseUrl}/api/auth/admin/me\`, {
    headers: assistantHeaders,
  }));
  assert.equal(noPermissionAssistant.response.status, 200);
  assert.deepEqual(noPermissionAssistant.body.admin.permissions, []);

  const noPermissionMerchantList = await fetch(\`${baseUrl}/api/auth/merchants\`, {
    headers: assistantHeaders,
  });
  assert.equal(noPermissionMerchantList.status, 403);
});`,
);
fs.writeFileSync(testPath, testSource, "utf8");

console.log("Admin no-permissions UI and explicit API denial test applied.");
