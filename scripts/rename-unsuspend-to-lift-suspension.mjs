import fs from "node:fs";
import { execSync } from "node:child_process";

const adminPagePath = "artifacts/fawri/src/pages/AdminPage.tsx";
const translationsPath = "artifacts/fawri/src/lib/admin-translations.ts";
const selfPath = "scripts/rename-unsuspend-to-lift-suspension.mjs";
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

let adminPage = fs.readFileSync(adminPagePath, "utf8");

adminPage = replaceOnce(
  adminPage,
  "confirmation question helper",
  `  const isApproval = state.type === "approve";\n  const textAlignmentClass =`,
  `  const isApproval = state.type === "approve";\n  const confirmationQuestion =\n    state.type === "unsuspend"\n      ? adminText.confirmUnsuspendQuestion\n      : adminText.confirmActionQuestion;\n  const confirmButtonLabel =\n    state.type === "unsuspend"\n      ? adminText.confirmUnsuspendButton\n      : adminText.confirm;\n  const textAlignmentClass =`,
);

adminPage = replaceOnce(
  adminPage,
  "specific confirmation question",
  `{adminText.confirmActionQuestion}`,
  `{confirmationQuestion}`,
);

adminPage = replaceOnce(
  adminPage,
  "specific confirmation button",
  `{adminText.confirm}\n            </Button>`,
  `{confirmButtonLabel}\n            </Button>`,
);

fs.writeFileSync(adminPagePath, adminPage, "utf8");

let translations = fs.readFileSync(translationsPath, "utf8");

const replacements = [
  [
    '    confirmUnsuspendStore: "إلغاء الإيقاف",',
    '    confirmUnsuspendStore: "رفع إيقاف المتجر",\n    confirmUnsuspendQuestion:\n      "هل أنت متأكد من رفع إيقاف هذا المتجر وإعادته إلى حالة مقبول؟",\n    confirmUnsuspendButton: "رفع الإيقاف",',
    "Arabic unsuspend dialog",
  ],
  [
    '    logsActionUnsuspended: "إلغاء إيقاف",',
    '    logsActionUnsuspended: "رفع الإيقاف",',
    "Arabic log action",
  ],
  [
    '    actionUnsuspend: "إلغاء الإيقاف",',
    '    actionUnsuspend: "رفع الإيقاف",',
    "Arabic action button",
  ],
  [
    '    logMerchantUnsuspended: "تم إلغاء إيقاف المتجر",',
    '    logMerchantUnsuspended: "تم رفع إيقاف المتجر",',
    "Arabic log message",
  ],
  [
    '    toastMerchantUnsuspended: "تم إلغاء إيقاف {store}",',
    '    toastMerchantUnsuspended: "تم رفع إيقاف {store}",',
    "Arabic toast message",
  ],
  [
    '    confirmUnsuspendStore: "Remove suspension",',
    '    confirmUnsuspendStore: "Lift store suspension",\n    confirmUnsuspendQuestion:\n      "Are you sure you want to lift this store’s suspension and return it to Approved status?",\n    confirmUnsuspendButton: "Lift suspension",',
    "English unsuspend dialog",
  ],
  [
    '    logsActionUnsuspended: "Suspension removed",',
    '    logsActionUnsuspended: "Suspension lifted",',
    "English log action",
  ],
  [
    '    actionUnsuspend: "Remove suspension",',
    '    actionUnsuspend: "Lift suspension",',
    "English action button",
  ],
  [
    '    logMerchantUnsuspended: "Store suspension removed",',
    '    logMerchantUnsuspended: "Store suspension lifted",',
    "English log message",
  ],
  [
    '    toastMerchantUnsuspended:\n      "The suspension was removed from {store}.",',
    '    toastMerchantUnsuspended:\n      "The suspension was lifted from {store}.",',
    "English toast message",
  ],
  [
    '  confirmUnsuspendStore: "هەڵوەشاندنەوەی ڕاگرتن",',
    '  confirmUnsuspendStore: "لابردنی ڕاگرتنی فرۆشگا",\n  confirmUnsuspendQuestion:\n    "دڵنیایت لە لابردنی ڕاگرتنی ئەم فرۆشگایە و گەڕاندنەوەی بۆ دۆخی پەسەندکراو؟",\n  confirmUnsuspendButton: "لابردنی ڕاگرتن",',
    "Kurdish unsuspend dialog",
  ],
  [
    '  logsActionUnsuspended: "هەڵوەشاندنەوەی ڕاگرتن",',
    '  logsActionUnsuspended: "لابردنی ڕاگرتن",',
    "Kurdish log action",
  ],
  [
    '  actionUnsuspend: "هەڵوەشاندنەوەی ڕاگرتن",',
    '  actionUnsuspend: "لابردنی ڕاگرتن",',
    "Kurdish action button",
  ],
  [
    '  logMerchantUnsuspended: "ڕاگرتنی فرۆشگا هەڵوەشایەوە",',
    '  logMerchantUnsuspended: "ڕاگرتنی فرۆشگا لابرا",',
    "Kurdish log message",
  ],
  [
    '  toastMerchantUnsuspended: "ڕاگرتنی {store} هەڵوەشایەوە",',
    '  toastMerchantUnsuspended: "ڕاگرتنی {store} لابرا",',
    "Kurdish toast message",
  ],
];

for (const [before, after, label] of replacements) {
  translations = replaceOnce(translations, label, before, after);
}

fs.writeFileSync(translationsPath, translations, "utf8");

const finalAdminPage = fs.readFileSync(adminPagePath, "utf8");
const finalTranslations = fs.readFileSync(translationsPath, "utf8");

for (const marker of [
  "confirmUnsuspendQuestion",
  "confirmUnsuspendButton",
  "confirmationQuestion",
  "confirmButtonLabel",
]) {
  if (!finalAdminPage.includes(marker) && !finalTranslations.includes(marker)) {
    throw new Error(`Missing final marker: ${marker}`);
  }
}

if ((finalTranslations.match(/confirmUnsuspendQuestion:/g) ?? []).length !== 3) {
  throw new Error("Expected three confirmUnsuspendQuestion translations");
}
if ((finalTranslations.match(/confirmUnsuspendButton:/g) ?? []).length !== 3) {
  throw new Error("Expected three confirmUnsuspendButton translations");
}

run("pnpm run typecheck");
run("PORT=3000 BASE_PATH=/ pnpm --filter @workspace/fawri run build");

fs.rmSync(selfPath);
run("git diff --check");
run(`git add ${adminPagePath} ${translationsPath} ${selfPath}`);
run('git commit -m "Use lift suspension wording"');
run(`git push origin ${branch}`);

console.log("\nCompleted: lift suspension wording applied consistently in all three languages.");
