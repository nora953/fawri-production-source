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

let page = fs.readFileSync(adminPagePath, "utf8");

page = replaceOnce(
  page,
  "plan modal safe selection",
  `  const [selected, setSelected] = useState<PlanKey>("gold");\n  const { lang } = useI18n();\n  const adminText = getAdminText(lang);\n  const locale = lang === "en" ? "en-US" : "ar-IQ";`,
  `  const [selected, setSelected] = useState<PlanKey | null>(null);\n  const { lang } = useI18n();\n  const adminText = getAdminText(lang);\n  const locale = lang === "en" ? "en-US" : "ar-IQ";\n  const textAlignmentClass =\n    adminText.dir === "rtl"\n      ? "!text-right sm:!text-right"\n      : "!text-left sm:!text-left";`,
);

page = replaceOnce(
  page,
  "plan modal submit labels",
  `  const planNames: Record<PlanKey, string> = {\n    silver: adminText.planSilver,\n    gold: adminText.planGold,\n    diamond: adminText.planDiamond,\n  };\n\n  return (`,
  `  const planNames: Record<PlanKey, string> = {\n    silver: adminText.planSilver,\n    gold: adminText.planGold,\n    diamond: adminText.planDiamond,\n  };\n\n  const submitLabel: Record<PlanModalState["mode"], string> = {\n    activate: adminText.confirmActivateSubscription,\n    change: adminText.confirmChangePlan,\n    renew: adminText.confirmRenewPlan,\n  };\n\n  return (`,
);

page = replaceOnce(
  page,
  "plan modal direction",
  `      <DialogContent\n        className="max-w-md"\n        dir={adminText.dir}\n      >\n        <DialogHeader>\n          <DialogTitle>{modeLabel[state.mode]}</DialogTitle>\n        </DialogHeader>`,
  `      <DialogContent\n        className={\`max-w-md \${\n          adminText.dir === "rtl"\n            ? "[&>button]:left-4 [&>button]:right-auto"\n            : "[&>button]:right-4 [&>button]:left-auto"\n        }\`}\n        dir={adminText.dir}\n      >\n        <DialogHeader className={textAlignmentClass}>\n          <DialogTitle className={\`w-full \${textAlignmentClass}\`}>\n            {modeLabel[state.mode]}\n          </DialogTitle>\n        </DialogHeader>`,
);

page = replaceOnce(
  page,
  "localized plan name",
  `                  {planNames[key]} — {PLANS[key].label}`,
  `                  {planNames[key]}`,
);

page = replaceOnce(
  page,
  "plan card alignment",
  `              className={\`w-full rounded-lg border-2 p-3 text-start transition-colors \${`,
  `              aria-pressed={selected === key}\n              className={\`w-full rounded-lg border-2 p-3 transition-colors \${\n                adminText.dir === "rtl" ? "text-right" : "text-left"\n              } \${`,
);

page = replaceOnce(
  page,
  "safe responsive plan footer",
  `        <DialogFooter className="flex gap-2 flex-row-reverse justify-start">\n          <Button onClick={() => onConfirm(selected)}>\n            {adminText.confirm}\n          </Button>\n\n          <Button variant="outline" onClick={onClose}>\n            {adminText.cancel}\n          </Button>\n        </DialogFooter>`,
  `        <DialogFooter\n          className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end"\n          dir="ltr"\n        >\n          <Button\n            variant="outline"\n            onClick={onClose}\n            className="h-auto min-h-10 w-full whitespace-normal px-4 py-2 sm:w-auto"\n          >\n            {adminText.cancel}\n          </Button>\n\n          <Button\n            disabled={!selected}\n            onClick={() => selected && onConfirm(selected)}\n            className="h-auto min-h-10 w-full whitespace-normal px-4 py-2 sm:w-auto"\n          >\n            {submitLabel[state.mode]}\n          </Button>\n        </DialogFooter>`,
);

fs.writeFileSync(adminPagePath, page, "utf8");

let translations = fs.readFileSync(translationsPath, "utf8");

translations = replaceOnce(
  translations,
  "Arabic plan modal actions",
  `    planRenewTitle: "تجديد الخطة",\n    planSilver:`,
  `    planRenewTitle: "تجديد الخطة",\n    confirmActivateSubscription: "تفعيل الاشتراك",\n    confirmChangePlan: "تأكيد تغيير الخطة",\n    confirmRenewPlan: "تأكيد تجديد الخطة",\n    planSilver:`,
);

translations = replaceOnce(
  translations,
  "English plan modal actions",
  `    planRenewTitle: "Renew plan",\n    planSilver:`,
  `    planRenewTitle: "Renew plan",\n    confirmActivateSubscription: "Activate subscription",\n    confirmChangePlan: "Confirm plan change",\n    confirmRenewPlan: "Confirm plan renewal",\n    planSilver:`,
);

translations = replaceOnce(
  translations,
  "Kurdish plan modal actions",
  `  planRenewTitle: "نوێکردنەوەی پلان",\n  planSilver:`,
  `  planRenewTitle: "نوێکردنەوەی پلان",\n  confirmActivateSubscription: "چالاککردنی بەشداری",\n  confirmChangePlan: "پشتڕاستکردنەوەی گۆڕینی پلان",\n  confirmRenewPlan: "پشتڕاستکردنەوەی نوێکردنەوەی پلان",\n  planSilver:`,
);

fs.writeFileSync(translationsPath, translations, "utf8");

const finalPage = fs.readFileSync(adminPagePath, "utf8");
const finalTranslations = fs.readFileSync(translationsPath, "utf8");

for (const marker of [
  `useState<PlanKey | null>(null)`,
  `disabled={!selected}`,
  `selected && onConfirm(selected)`,
  `adminText.confirmActivateSubscription`,
  `aria-pressed={selected === key}`,
  `[&>button]:left-4 [&>button]:right-auto`,
]) {
  if (!finalPage.includes(marker)) throw new Error(`Missing page marker: ${marker}`);
}

if (finalPage.includes(`{planNames[key]} — {PLANS[key].label}`)) {
  throw new Error("Duplicate plan labels remain");
}

for (const marker of [
  `confirmActivateSubscription:`,
  `confirmChangePlan:`,
  `confirmRenewPlan:`,
]) {
  const count = (finalTranslations.match(new RegExp(marker, "g")) ?? []).length;
  if (count !== 3) throw new Error(`Expected three translation entries for ${marker}, found ${count}`);
}

console.log("Paid subscription modal refinement applied and verified.");
