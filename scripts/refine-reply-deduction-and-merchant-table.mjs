import fs from "node:fs";
import { execSync } from "node:child_process";

const pagePath = "artifacts/fawri/src/pages/AdminPage.tsx";
const translationsPath = "artifacts/fawri/src/lib/admin-translations.ts";
const authPath = "artifacts/api-server/src/routes/auth.ts";
const testPath = "artifacts/api-server/tests/admin-permissions.integration.test.mjs";
const selfPath = "scripts/refine-reply-deduction-and-merchant-table.mjs";
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

function replaceRegexOnce(source, label, pattern, replacement) {
  const matches = source.match(new RegExp(pattern.source, pattern.flags.includes("g") ? pattern.flags : `${pattern.flags}g`));
  const count = matches?.length ?? 0;
  if (count !== 1) {
    throw new Error(`${label}: expected one regex match, found ${count}`);
  }
  return source.replace(pattern, replacement);
}

let page = fs.readFileSync(pagePath, "utf8");
let translations = fs.readFileSync(translationsPath, "utf8");
let auth = fs.readFileSync(authPath, "utf8");
let test = fs.readFileSync(testPath, "utf8");

page = replaceOnce(
  page,
  "usage percentage helper",
  `// ── Confirm dialog ─────────────────────────────────────────────────────────────`,
  `function formatUsagePercentage(used: number, limit: number, locale: string): string {\n  if (limit <= 0 || used <= 0) return "0%";\n\n  const percentage = (used / limit) * 100;\n  if (percentage < 0.1) return "<0.1%";\n\n  return \`${"${percentage.toLocaleString(locale, { maximumFractionDigits: 2 })}"}%\`;\n}\n\n// ── Confirm dialog ─────────────────────────────────────────────────────────────`,
);

const repliesModalReplacement = `interface RepliesModalState {\n  merchantId: string;\n  merchantName: string;\n  mode: "add" | "deduct";\n  currentUsed?: number;\n  currentRemaining?: number;\n  limit?: number;\n}\n\nfunction RepliesModal({\n  state,\n  onConfirm,\n  onClose,\n}: {\n  state: RepliesModalState;\n  onConfirm: (amount: number) => void;\n  onClose: () => void;\n}) {\n  const [amount, setAmount] = useState("");\n  const { lang } = useI18n();\n  const adminText = getAdminText(lang);\n  const locale = lang === "en" ? "en-US" : "ar-IQ";\n  const textAlignmentClass =\n    adminText.dir === "rtl"\n      ? "!text-right sm:!text-right"\n      : "!text-left sm:!text-left";\n\n  const currentUsed = state.currentUsed ?? 0;\n  const limit = state.limit ?? 0;\n  const currentRemaining =\n    state.currentRemaining ?? Math.max(0, limit - currentUsed);\n  const parsedAmount = Number(amount);\n  const isValidInteger =\n    amount.trim() !== "" && Number.isInteger(parsedAmount) && parsedAmount > 0;\n  const exceedsRemaining =\n    state.mode === "deduct" &&\n    isValidInteger &&\n    parsedAmount > currentRemaining;\n  const remainingAfterDeduction =\n    state.mode === "deduct" && isValidInteger && !exceedsRemaining\n      ? currentRemaining - parsedAmount\n      : currentRemaining;\n  const validationMessage =\n    amount.trim() === ""\n      ? ""\n      : !isValidInteger\n        ? adminText.repliesInvalidAmount\n        : exceedsRemaining\n          ? adminText.repliesAmountExceedsRemaining\n          : "";\n\n  const handleSubmit = () => {\n    if (!isValidInteger || exceedsRemaining) return;\n    onConfirm(parsedAmount);\n  };\n\n  return (\n    <Dialog open onOpenChange={onClose}>\n      <DialogContent\n        className={\`max-w-md gap-5 \${\n          adminText.dir === "rtl"\n            ? "[&>button]:left-4 [&>button]:right-auto"\n            : "[&>button]:right-4 [&>button]:left-auto"\n        }\`}\n        dir={adminText.dir}\n      >\n        <DialogHeader\n          className={\`w-full \${textAlignmentClass} \${\n            adminText.dir === "rtl" ? "pl-12" : "pr-12"\n          }\`}\n        >\n          <DialogTitle\n            className={\`w-full text-lg leading-6 \${textAlignmentClass} \${\n              state.mode === "deduct" ? "text-destructive" : ""\n            }\`}\n          >\n            {state.mode === "add"\n              ? adminText.repliesAddTitle\n              : adminText.repliesDeductTitle}\n          </DialogTitle>\n        </DialogHeader>\n\n        <div className="space-y-4">\n          <div className={\`rounded-xl border bg-muted/35 px-4 py-3 \${textAlignmentClass}\`}>\n            <p className="text-xs text-muted-foreground">\n              {adminText.storeLabel}\n            </p>\n            <p className="mt-1 text-base font-semibold text-foreground">\n              {state.merchantName}\n            </p>\n          </div>\n\n          <div className="grid grid-cols-3 gap-2">\n            {[\n              [adminText.detailsReplyLimit, limit],\n              [adminText.detailsUsed, currentUsed],\n              [adminText.detailsRemaining, currentRemaining],\n            ].map(([label, value]) => (\n              <div\n                key={String(label)}\n                className="rounded-lg border bg-card px-2 py-3 text-center"\n              >\n                <p className="text-[11px] leading-4 text-muted-foreground">\n                  {label}\n                </p>\n                <p className="mt-1 text-base font-semibold tabular-nums" dir="ltr">\n                  {Number(value).toLocaleString(locale)}\n                </p>\n              </div>\n            ))}\n          </div>\n\n          <div className="space-y-2">\n            <Label className={\`block \${textAlignmentClass}\`}>\n              {adminText.repliesCountLabel}\n            </Label>\n            <Input\n              type="number"\n              inputMode="numeric"\n              min={1}\n              max={state.mode === "deduct" ? currentRemaining : undefined}\n              step={1}\n              value={amount}\n              onChange={(event) => setAmount(event.target.value)}\n              placeholder={adminText.repliesCountPlaceholder}\n              className={\`h-11 text-base tabular-nums \${textAlignmentClass}\`}\n              aria-invalid={Boolean(validationMessage)}\n            />\n            {validationMessage && (\n              <p className={\`text-xs font-medium text-destructive \${textAlignmentClass}\`}>\n                {validationMessage}\n              </p>\n            )}\n          </div>\n\n          {state.mode === "deduct" && isValidInteger && !exceedsRemaining && (\n            <div className="flex items-center justify-between rounded-xl border border-orange-200 bg-orange-50/70 px-4 py-3 text-sm dark:border-orange-900/70 dark:bg-orange-950/20">\n              <span className="text-muted-foreground">\n                {adminText.repliesRemainingAfterLabel}\n              </span>\n              <span className="font-bold tabular-nums" dir="ltr">\n                {remainingAfterDeduction.toLocaleString(locale)}\n              </span>\n            </div>\n          )}\n        </div>\n\n        <DialogFooter\n          className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end"\n          dir="ltr"\n        >\n          <Button\n            variant="outline"\n            onClick={onClose}\n            className="h-auto min-h-10 w-full px-4 py-2 sm:w-auto"\n          >\n            {adminText.cancel}\n          </Button>\n          <Button\n            variant={state.mode === "deduct" ? "destructive" : "default"}\n            disabled={!isValidInteger || exceedsRemaining}\n            onClick={handleSubmit}\n            className="h-auto min-h-10 w-full px-4 py-2 sm:w-auto"\n          >\n            {adminText.confirm}\n          </Button>\n        </DialogFooter>\n      </DialogContent>\n    </Dialog>\n  );\n}\n\n// ── Details modal ──────────────────────────────────────────────────────────────`;

page = replaceRegexOnce(
  page,
  "replies modal",
  /interface RepliesModalState \{[\s\S]*?\/\/ ── Details modal ──────────────────────────────────────────────────────────────/,
  repliesModalReplacement,
);

page = replaceOnce(
  page,
  "open replies remaining",
  `      currentUsed: s?.replies_used,\n      limit: s?.reply_limit,`,
  `      currentUsed: s?.replies_used,\n      currentRemaining: s?.replies_remaining,\n      limit: s?.reply_limit,`,
);

page = replaceOnce(
  page,
  "mobile subscription summary",
  `                          {canManageSubscriptions && sub && (\n                            <div className="bg-muted/50 rounded-md p-2 text-xs">\n                              <div className="flex justify-between mb-1">\n                                <span className="text-muted-foreground">\n                                  {adminText.actionRepliesShort}\n                                </span>\n                                <span\n                                  className="font-medium tabular-nums"\n                                  dir="ltr"\n                                >\n                                  {sub.replies_used.toLocaleString(locale)} /{" "}\n                                  {sub.reply_limit.toLocaleString(locale)} ({pct}%)\n                                </span>\n                              </div>\n                              <div className="h-1.5 bg-muted rounded-full overflow-hidden">\n                                <div\n                                  className={\`h-full rounded-full transition-all \${pct >= 90 ? "bg-red-500" : pct >= 80 ? "bg-yellow-500" : "bg-primary"}\`}\n                                  style={{ width: \`${"${Math.min(100, pct)}"}%\` }}\n                                />\n                              </div>\n                            </div>\n                          )}`,
  `                          {canManageSubscriptions && sub && (\n                            <div className="space-y-2 rounded-lg border bg-muted/30 p-3 text-xs">\n                              <div className="flex items-center justify-between gap-2">\n                                <span className="font-semibold">\n                                  {planNames[sub.plan_name as PlanKey] ?? sub.plan_name}\n                                </span>\n                                <span className="font-medium tabular-nums text-muted-foreground" dir="ltr">\n                                  {formatUsagePercentage(\n                                    sub.replies_used,\n                                    sub.reply_limit,\n                                    locale,\n                                  )}\n                                </span>\n                              </div>\n                              <div className="grid grid-cols-3 gap-1.5">\n                                {[\n                                  [adminText.detailsUsed, sub.replies_used],\n                                  [adminText.detailsRemaining, sub.replies_remaining],\n                                  [adminText.detailsReplyLimit, sub.reply_limit],\n                                ].map(([label, value]) => (\n                                  <div key={String(label)} className="rounded-md bg-background px-1.5 py-2 text-center">\n                                    <p className="text-[10px] leading-4 text-muted-foreground">{label}</p>\n                                    <p className="mt-0.5 font-semibold tabular-nums" dir="ltr">\n                                      {Number(value).toLocaleString(locale)}\n                                    </p>\n                                  </div>\n                                ))}\n                              </div>\n                              <div className="h-1.5 overflow-hidden rounded-full bg-muted">\n                                <div\n                                  className={\`h-full rounded-full transition-all \${pct >= 90 ? "bg-red-500" : pct >= 80 ? "bg-yellow-500" : "bg-primary"}\`}\n                                  style={{\n                                    width:\n                                      sub.replies_used > 0\n                                        ? \`${"${Math.max(0.5, Math.min(100, (sub.replies_used / sub.reply_limit) * 100))}"}%\`\n                                        : "0%",\n                                  }}\n                                />\n                              </div>\n                            </div>\n                          )}`,
);

page = replaceOnce(
  page,
  "desktop subscription summary",
  `                                {sub ? (\n                                  <div className="space-y-1">\n                                    <span className="text-xs font-medium capitalize">\n                                      {planNames[sub.plan_name as PlanKey] ?? sub.plan_name}\n                                    </span>\n                                  <p\n                                    className="text-xs tabular-nums text-muted-foreground"\n                                    dir="ltr"\n                                  >\n                                    {sub.replies_used.toLocaleString(locale)} /{" "}\n                                    {sub.reply_limit.toLocaleString(locale)} ({pct}%)\n                                  </p>\n                                  <div className="w-20 h-1.5 bg-muted rounded-full overflow-hidden">\n                                    <div\n                                      className={\`h-full rounded-full \${pct >= 90 ? "bg-red-500" : pct >= 80 ? "bg-yellow-500" : "bg-primary"}\`}\n                                      style={{\n                                        width: \`${"${Math.min(100, pct)}"}%\`,\n                                      }}\n                                    />\n                                  </div>\n                                </div>\n                                ) : (`,
  `                                {sub ? (\n                                  <div className="min-w-48 space-y-2 rounded-lg border bg-muted/25 p-2.5">\n                                    <div className="flex items-center justify-between gap-2">\n                                      <span className="text-xs font-semibold capitalize">\n                                        {planNames[sub.plan_name as PlanKey] ?? sub.plan_name}\n                                      </span>\n                                      <span className="text-[11px] font-medium tabular-nums text-muted-foreground" dir="ltr">\n                                        {formatUsagePercentage(\n                                          sub.replies_used,\n                                          sub.reply_limit,\n                                          locale,\n                                        )}\n                                      </span>\n                                    </div>\n                                    <div className="grid grid-cols-3 gap-1">\n                                      {[\n                                        [adminText.detailsUsed, sub.replies_used],\n                                        [adminText.detailsRemaining, sub.replies_remaining],\n                                        [adminText.detailsReplyLimit, sub.reply_limit],\n                                      ].map(([label, value]) => (\n                                        <div key={String(label)} className="rounded-md bg-background px-1 py-1.5 text-center">\n                                          <p className="text-[9px] leading-3 text-muted-foreground">{label}</p>\n                                          <p className="mt-0.5 text-xs font-semibold tabular-nums" dir="ltr">\n                                            {Number(value).toLocaleString(locale)}\n                                          </p>\n                                        </div>\n                                      ))}\n                                    </div>\n                                    <div className="h-1.5 overflow-hidden rounded-full bg-muted">\n                                      <div\n                                        className={\`h-full rounded-full \${pct >= 90 ? "bg-red-500" : pct >= 80 ? "bg-yellow-500" : "bg-primary"}\`}\n                                        style={{\n                                          width:\n                                            sub.replies_used > 0\n                                              ? \`${"${Math.max(0.5, Math.min(100, (sub.replies_used / sub.reply_limit) * 100))}"}%\`\n                                              : "0%",\n                                        }}\n                                      />\n                                    </div>\n                                  </div>\n                                ) : (`,
);

page = replaceOnce(
  page,
  "deduct error message",
  `    } catch (error) {\n      console.error("Deduct replies failed:", error);\n      toast.error(adminText.subscriptionOperationError);\n    }`,
  `    } catch (error) {\n      console.error("Deduct replies failed:", error);\n      const message = error instanceof Error ? error.message : "";\n      toast.error(\n        message.includes("amount exceeds remaining replies")\n          ? adminText.repliesAmountExceedsRemaining\n          : adminText.subscriptionOperationError,\n      );\n    }`,
);

translations = replaceOnce(
  translations,
  "Arabic reply validation translations",
  `    repliesCountPlaceholder: "أدخل عدد الردود...",`,
  `    repliesCountPlaceholder: "أدخل عدد الردود...",\n    repliesRemainingAfterLabel: "المتبقي بعد الخصم",\n    repliesInvalidAmount: "أدخل عددًا صحيحًا أكبر من صفر.",\n    repliesAmountExceedsRemaining: "لا يمكن خصم عدد أكبر من الردود المتبقية.",`,
);

translations = replaceOnce(
  translations,
  "English reply validation translations",
  `    repliesCountPlaceholder: "Enter the number of replies...",`,
  `    repliesCountPlaceholder: "Enter the number of replies...",\n    repliesRemainingAfterLabel: "Remaining after deduction",\n    repliesInvalidAmount: "Enter a whole number greater than zero.",\n    repliesAmountExceedsRemaining: "The deduction cannot exceed the remaining replies.",`,
);

translations = replaceOnce(
  translations,
  "Kurdish reply validation translations",
  `  repliesCountPlaceholder: "ژمارەی وەڵامەکان بنووسە...",`,
  `  repliesCountPlaceholder: "ژمارەی وەڵامەکان بنووسە...",\n  repliesRemainingAfterLabel: "ماوە دوای کەمکردنەوە",\n  repliesInvalidAmount: "ژمارەیەکی تەواو و گەورەتر لە سفر بنووسە.",\n  repliesAmountExceedsRemaining: "ناتوانرێت زیاتر لە وەڵامە ماوەکان کەم بکرێتەوە.",`,
);

auth = replaceOnce(
  auth,
  "deduct remaining guard",
  `    subscription.replies_used = Math.min(\n      subscription.reply_limit,\n      subscription.replies_used + amount,\n    );\n    subscription.replies_remaining = Math.max(\n      0,\n      subscription.reply_limit - subscription.replies_used,\n    );`,
  `    if (amount > subscription.replies_remaining) {\n      return sendError(res, 409, "amount exceeds remaining replies", {\n        replies_remaining: subscription.replies_remaining,\n      });\n    }\n    subscription.replies_used += amount;\n    subscription.replies_remaining -= amount;`,
);

test = replaceOnce(
  test,
  "rejected over-deduction test",
  `  assert.equal(deductReply.body.subscription.replies_used, 1);\n  assert.equal(deductReply.body.subscription.replies_remaining, 4000);\n\n  const resetReplies = await json(await fetch(`,
  `  assert.equal(deductReply.body.subscription.replies_used, 1);\n  assert.equal(deductReply.body.subscription.replies_remaining, 4000);\n\n  const overDeductReply = await json(await fetch(\n    \`${"${baseUrl}"}/api/auth/merchants/merchant-a/subscription\`,\n    {\n      method: "PATCH",\n      headers: { ...assistantHeaders, "Content-Type": "application/json" },\n      body: JSON.stringify({ action: "deduct_replies", amount: 4001 }),\n    },\n  ));\n  assert.equal(overDeductReply.response.status, 409);\n  assert.equal(overDeductReply.body.error, "amount exceeds remaining replies");\n  assert.equal(overDeductReply.body.replies_remaining, 4000);\n\n  const subscriptionsAfterRejectedDeduction = await json(await fetch(\n    \`${"${baseUrl}"}/api/auth/admin/subscriptions\`,\n    { headers: assistantHeaders },\n  ));\n  assert.equal(subscriptionsAfterRejectedDeduction.response.status, 200);\n  assert.equal(subscriptionsAfterRejectedDeduction.body.subscriptions[0].replies_used, 1);\n  assert.equal(subscriptionsAfterRejectedDeduction.body.subscriptions[0].replies_remaining, 4000);\n\n  const resetReplies = await json(await fetch(`,
);

fs.writeFileSync(pagePath, page, "utf8");
fs.writeFileSync(translationsPath, translations, "utf8");
fs.writeFileSync(authPath, auth, "utf8");
fs.writeFileSync(testPath, test, "utf8");

for (const [path, markers] of [
  [pagePath, [
    "repliesRemainingAfterLabel",
    "currentRemaining: s?.replies_remaining",
    "formatUsagePercentage(",
    "adminText.detailsRemaining, sub.replies_remaining",
  ]],
  [translationsPath, [
    "المتبقي بعد الخصم",
    "Remaining after deduction",
    "ماوە دوای کەمکردنەوە",
  ]],
  [authPath, [
    "amount exceeds remaining replies",
    "subscription.replies_remaining -= amount",
  ]],
  [testPath, [
    "overDeductReply",
    "subscriptionsAfterRejectedDeduction",
  ]],
]) {
  const source = fs.readFileSync(path, "utf8");
  for (const marker of markers) {
    if (!source.includes(marker)) {
      throw new Error(`${path}: missing expected marker ${marker}`);
    }
  }
}

run("pnpm run typecheck");
run("PORT=3000 BASE_PATH=/ pnpm --filter @workspace/fawri run build");
run("pnpm --filter @workspace/api-server run test:admin-permissions");
run("pnpm --filter @workspace/api-server run test:merchant-session");

fs.rmSync(selfPath);
run("git diff --check");
run(`git add ${pagePath} ${translationsPath} ${authPath} ${testPath} ${selfPath}`);
run('git commit -m "Refine reply deduction and merchant subscription display"');
run(`git push origin ${branch}`);

console.log("\nCompleted: reply deduction is guarded by remaining balance, the dialog is responsive and localized, and subscription usage is displayed with used, remaining, limit, and precise percentage values.");
