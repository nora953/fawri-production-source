import fs from "node:fs";

const adminPagePath = "artifacts/fawri/src/pages/AdminPage.tsx";
const translationsPath = "artifacts/fawri/src/lib/admin-translations.ts";

function replaceOnce(source, label, before, after) {
  if (source.includes(after)) return source;
  const index = source.indexOf(before);
  if (index === -1) throw new Error(`Could not find ${label}`);
  if (source.indexOf(before, index + before.length) !== -1) {
    throw new Error(`Found multiple matches for ${label}`);
  }
  return source.slice(0, index) + after + source.slice(index + before.length);
}

function replaceExactCount(source, label, before, after, expectedCount) {
  const count = source.split(before).length - 1;
  if (count === 0 && source.split(after).length - 1 === expectedCount) return source;
  if (count !== expectedCount) {
    throw new Error(`Expected ${expectedCount} matches for ${label}, found ${count}`);
  }
  return source.split(before).join(after);
}

let page = fs.readFileSync(adminPagePath, "utf8");

page = replaceOnce(
  page,
  "plan modal activation mode",
  `interface PlanModalState {\n  merchantId: string;\n  merchantName: string;\n  mode: "change" | "renew";\n}`,
  `interface PlanModalState {\n  merchantId: string;\n  merchantName: string;\n  mode: "activate" | "change" | "renew";\n}`,
);

page = replaceOnce(
  page,
  "plan modal activation title",
  `  const modeLabel: Record<PlanModalState["mode"], string> = {\n    change: adminText.planChangeTitle,\n    renew: adminText.planRenewTitle,\n  };`,
  `  const modeLabel: Record<PlanModalState["mode"], string> = {\n    activate: adminText.planActivateTitle,\n    change: adminText.planChangeTitle,\n    renew: adminText.planRenewTitle,\n  };`,
);

page = replaceOnce(
  page,
  "mobile approved merchant subscription actions",
  `              {canManageSubscriptions && (\n                <>\n                  <DropdownMenuItem onClick={onChangePlan}>\n                    <FileText className={\`h-3.5 w-3.5 \${iconSpacingClass}\`} />\n                    {adminText.actionChangePlan}\n                  </DropdownMenuItem>\n                  <DropdownMenuItem onClick={onRenewPlan}>\n                    <RefreshCcw className={\`h-3.5 w-3.5 \${iconSpacingClass}\`} />\n                    {adminText.actionRenewPlan}\n                  </DropdownMenuItem>\n                  <DropdownMenuItem onClick={onResetReplies}>\n                    <RefreshCcw className={\`h-3.5 w-3.5 \${iconSpacingClass}\`} />\n                    {adminText.actionResetReplies}\n                  </DropdownMenuItem>\n                  <DropdownMenuItem onClick={onAddReplies}>\n                    <Plus className={\`h-3.5 w-3.5 \${iconSpacingClass}\`} />\n                    {adminText.actionAddReplies}\n                  </DropdownMenuItem>\n                  <DropdownMenuItem\n                    onClick={onDeductReplies}\n                    className="text-destructive focus:text-destructive"\n                  >\n                    <Minus className={\`h-3.5 w-3.5 \${iconSpacingClass}\`} />\n                    {adminText.actionDeductReplies}\n                  </DropdownMenuItem>\n                  <DropdownMenuSeparator />\n                  <DropdownMenuItem onClick={onToggleAutoReply}>\n                    {sub?.auto_reply_enabled ? (\n                      <>\n                        <PowerOff className={\`h-3.5 w-3.5 \${iconSpacingClass}\`} />\n                        {adminText.actionDisableAutoReplies}\n                      </>\n                    ) : (\n                      <>\n                        <Power className={\`h-3.5 w-3.5 \${iconSpacingClass}\`} />\n                        {adminText.actionEnableAutoReplies}\n                      </>\n                    )}\n                  </DropdownMenuItem>\n                </>\n              )}`,
  `              {canManageSubscriptions && (\n                sub ? (\n                  <>\n                    <DropdownMenuItem onClick={onChangePlan}>\n                      <FileText className={\`h-3.5 w-3.5 \${iconSpacingClass}\`} />\n                      {adminText.actionChangePlan}\n                    </DropdownMenuItem>\n                    <DropdownMenuItem onClick={onRenewPlan}>\n                      <RefreshCcw className={\`h-3.5 w-3.5 \${iconSpacingClass}\`} />\n                      {adminText.actionRenewPlan}\n                    </DropdownMenuItem>\n                    <DropdownMenuItem onClick={onResetReplies}>\n                      <RefreshCcw className={\`h-3.5 w-3.5 \${iconSpacingClass}\`} />\n                      {adminText.actionResetReplies}\n                    </DropdownMenuItem>\n                    <DropdownMenuItem onClick={onAddReplies}>\n                      <Plus className={\`h-3.5 w-3.5 \${iconSpacingClass}\`} />\n                      {adminText.actionAddReplies}\n                    </DropdownMenuItem>\n                    <DropdownMenuItem\n                      onClick={onDeductReplies}\n                      className="text-destructive focus:text-destructive"\n                    >\n                      <Minus className={\`h-3.5 w-3.5 \${iconSpacingClass}\`} />\n                      {adminText.actionDeductReplies}\n                    </DropdownMenuItem>\n                    <DropdownMenuSeparator />\n                    <DropdownMenuItem onClick={onToggleAutoReply}>\n                      {sub.auto_reply_enabled ? (\n                        <>\n                          <PowerOff className={\`h-3.5 w-3.5 \${iconSpacingClass}\`} />\n                          {adminText.actionDisableAutoReplies}\n                        </>\n                      ) : (\n                        <>\n                          <Power className={\`h-3.5 w-3.5 \${iconSpacingClass}\`} />\n                          {adminText.actionEnableAutoReplies}\n                        </>\n                      )}\n                    </DropdownMenuItem>\n                  </>\n                ) : (\n                  <DropdownMenuItem onClick={onChangePlan}>\n                    <FileText className={\`h-3.5 w-3.5 \${iconSpacingClass}\`} />\n                    {adminText.actionActivatePaidSubscription}\n                  </DropdownMenuItem>\n                )\n              )}`,
);

page = replaceOnce(
  page,
  "desktop approved merchant subscription actions",
  `          {canManageSubscriptions && (\n            <>\n              <Button variant="outline" size="sm" className="h-7 px-2 text-xs" onClick={onChangePlan}>\n                {adminText.actionPlanShort}\n              </Button>\n              <Button variant="outline" size="sm" className="h-7 px-2 text-xs" onClick={onRenewPlan}>\n                {adminText.actionRenewShort}\n              </Button>\n              <Button variant="outline" size="sm" className="h-7 px-2 text-xs" onClick={onResetReplies}>\n                <RefreshCcw className={\`h-3 w-3 \${compactIconSpacingClass}\`} />\n                {adminText.actionRepliesShort}\n              </Button>\n              <Button variant="outline" size="sm" className="h-7 px-2 text-xs" onClick={onAddReplies}>\n                <Plus className={\`h-3 w-3 \${compactIconSpacingClass}\`} />\n                {adminText.actionAddShort}\n              </Button>\n            </>\n          )}`,
  `          {canManageSubscriptions && (\n            sub ? (\n              <>\n                <Button variant="outline" size="sm" className="h-7 px-2 text-xs" onClick={onChangePlan}>\n                  {adminText.actionPlanShort}\n                </Button>\n                <Button variant="outline" size="sm" className="h-7 px-2 text-xs" onClick={onRenewPlan}>\n                  {adminText.actionRenewShort}\n                </Button>\n                <Button variant="outline" size="sm" className="h-7 px-2 text-xs" onClick={onResetReplies}>\n                  <RefreshCcw className={\`h-3 w-3 \${compactIconSpacingClass}\`} />\n                  {adminText.actionRepliesShort}\n                </Button>\n                <Button variant="outline" size="sm" className="h-7 px-2 text-xs" onClick={onAddReplies}>\n                  <Plus className={\`h-3 w-3 \${compactIconSpacingClass}\`} />\n                  {adminText.actionAddShort}\n                </Button>\n              </>\n            ) : (\n              <Button\n                variant="outline"\n                size="sm"\n                className="h-7 px-2 text-xs"\n                onClick={onChangePlan}\n              >\n                {adminText.actionActivatePaidSubscriptionShort}\n              </Button>\n            )\n          )}`,
);

page = replaceExactCount(
  page,
  "subscription-aware plan modal callbacks",
  `onChangePlan={() => openPlan("change", m)}`,
  `onChangePlan={() => openPlan(sub ? "change" : "activate", m)}`,
  2,
);

page = replaceOnce(
  page,
  "paid subscription activation handler",
  `  const doChangePlan = async (merchantId: string, plan: PlanKey) => {`,
  `  const doActivatePaidSubscription = async (merchantId: string, plan: PlanKey) => {\n    const m = merchants.find((x) => x.id === merchantId)!;\n    const previousSubscriptions = getSubscriptions();\n\n    try {\n      const subscription = createSubscriptionForPlan(merchantId, plan);\n      const apiMerchant = await syncMerchantSubscriptionToApi(\n        merchantId,\n        subscription,\n      );\n\n      updateMerchant(merchantId, apiMerchant);\n      logAction(\n        "plan_activated",\n        m,\n        formatAdminMessage(adminText.logPlanActivated, {\n          plan: planNames[plan],\n        }),\n        { plan },\n      );\n      toast.success(\n        formatAdminMessage(adminText.toastPlanActivated, {\n          plan: planNames[plan],\n        }),\n      );\n      setPlanModal(null);\n      refreshData();\n    } catch (error) {\n      saveSubscriptions(previousSubscriptions);\n      refreshData();\n      console.error("Paid subscription activation failed:", error);\n      toast.error(adminText.planActivationSaveError);\n    }\n  };\n\n  const doChangePlan = async (merchantId: string, plan: PlanKey) => {`,
);

page = replaceOnce(
  page,
  "plan modal submission routing",
  `          onConfirm={(plan) => {\n            if (planModal.mode === "change")\n              doChangePlan(planModal.merchantId, plan);\n            else doRenewPlan(planModal.merchantId, plan);\n          }}`,
  `          onConfirm={(plan) => {\n            if (planModal.mode === "activate")\n              doActivatePaidSubscription(planModal.merchantId, plan);\n            else if (planModal.mode === "change")\n              doChangePlan(planModal.merchantId, plan);\n            else doRenewPlan(planModal.merchantId, plan);\n          }}`,
);

fs.writeFileSync(adminPagePath, page, "utf8");

let translations = fs.readFileSync(translationsPath, "utf8");

translations = translations
  .replace(`    planActivateTitle: "تفعيل الخطة",`, `    planActivateTitle: "تفعيل اشتراك مدفوع",`)
  .replace(`    planActivateTitle: "Activate plan",`, `    planActivateTitle: "Activate paid subscription",`)
  .replace(`  planActivateTitle: "چالاككردنی پلان",`, `  planActivateTitle: "چالاککردنی بەشداریی پارەدراو",`);

translations = replaceOnce(
  translations,
  "Arabic paid subscription action labels",
  `    actionFinalReject: "رفض نهائي",\n    actionChangePlan: "تغيير الخطة",`,
  `    actionFinalReject: "رفض نهائي",\n    actionActivatePaidSubscription: "تفعيل اشتراك مدفوع",\n    actionActivatePaidSubscriptionShort: "اشتراك مدفوع",\n    actionChangePlan: "تغيير الخطة",`,
);

translations = replaceOnce(
  translations,
  "English paid subscription action labels",
  `    actionFinalReject: "Reject permanently",\n    actionChangePlan: "Change plan",`,
  `    actionFinalReject: "Reject permanently",\n    actionActivatePaidSubscription: "Activate paid subscription",\n    actionActivatePaidSubscriptionShort: "Paid subscription",\n    actionChangePlan: "Change plan",`,
);

translations = replaceOnce(
  translations,
  "Kurdish paid subscription action labels",
  `  actionFinalReject: "ڕەتکردنەوەی کۆتایی",\n  actionChangePlan: "گۆڕینی پلان",`,
  `  actionFinalReject: "ڕەتکردنەوەی کۆتایی",\n  actionActivatePaidSubscription: "چالاککردنی بەشداریی پارەدراو",\n  actionActivatePaidSubscriptionShort: "بەشداریی پارەدراو",\n  actionChangePlan: "گۆڕینی پلان",`,
);

translations = replaceOnce(
  translations,
  "Arabic paid subscription feedback",
  `    logPlanChanged: "خطة {plan}",`,
  `    logPlanActivated: "تم تفعيل الاشتراك المدفوع — خطة {plan}",\n    toastPlanActivated: "تم تفعيل الاشتراك المدفوع بخطة {plan}",\n    planActivationSaveError:\n      "تعذر تفعيل الاشتراك المدفوع في السيرفر.",\n\n    logPlanChanged: "خطة {plan}",`,
);

translations = replaceOnce(
  translations,
  "English paid subscription feedback",
  `    logPlanChanged: "Plan {plan}",`,
  `    logPlanActivated: "Paid subscription activated — plan {plan}",\n    toastPlanActivated: "The paid {plan} subscription was activated.",\n    planActivationSaveError:\n      "Could not activate the paid subscription on the server.",\n\n    logPlanChanged: "Plan {plan}",`,
);

translations = replaceOnce(
  translations,
  "Kurdish paid subscription feedback",
  `  logPlanChanged: "پلانی {plan}",`,
  `  logPlanActivated: "بەشداریی پارەدراو چالاککرا — پلانی {plan}",\n  toastPlanActivated: "بەشداریی پارەدراو بە پلانی {plan} چالاککرا",\n  planActivationSaveError: "چالاککردنی بەشداریی پارەدراو لە سێرڤەر سەرنەکەوت.",\n\n  logPlanChanged: "پلانی {plan}",`,
);

fs.writeFileSync(translationsPath, translations, "utf8");

const finalPage = fs.readFileSync(adminPagePath, "utf8");
const finalTranslations = fs.readFileSync(translationsPath, "utf8");

const requiredPageMarkers = [
  `mode: "activate" | "change" | "renew";`,
  `activate: adminText.planActivateTitle,`,
  `sub ? "change" : "activate"`,
  `adminText.actionActivatePaidSubscription`,
  `adminText.actionActivatePaidSubscriptionShort`,
  `const doActivatePaidSubscription = async`,
  `planModal.mode === "activate"`,
];

for (const marker of requiredPageMarkers) {
  if (!finalPage.includes(marker)) throw new Error(`Missing page marker: ${marker}`);
}

if ((finalPage.match(/sub \? "change" : "activate"/g) ?? []).length !== 2) {
  throw new Error("Expected two subscription-aware plan callbacks");
}

for (const marker of [
  `actionActivatePaidSubscription:`,
  `actionActivatePaidSubscriptionShort:`,
  `logPlanActivated:`,
  `toastPlanActivated:`,
  `planActivationSaveError:`,
]) {
  const count = (finalTranslations.match(new RegExp(marker, "g")) ?? []).length;
  if (count !== 3) throw new Error(`Expected three translation entries for ${marker}, found ${count}`);
}

console.log("Approved merchant subscription actions applied and verified.");
