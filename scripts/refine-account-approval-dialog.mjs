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
  "approval dialog layout",
  `  return (\n    <Dialog open onOpenChange={onClose}>\n      <DialogContent\n        className="max-w-sm"\n        dir={adminText.dir}\n      >\n        <DialogHeader>\n          <DialogTitle\n            className={isDestructive ? "text-destructive" : ""}\n          >\n            {labels[state.type]}\n          </DialogTitle>\n        </DialogHeader>\n\n        <div className="space-y-3">\n          <p className="text-sm text-muted-foreground">\n            {adminText.storeLabel}:{" "}\n            <span className="font-medium text-foreground">\n              {state.merchantName}\n            </span>\n          </p>\n\n          {needsReason ? (\n            <div className="space-y-1.5">\n              <Label>{adminText.reasonRequired}</Label>\n\n              <Textarea\n                value={reason}\n                onChange={(event) => setReason(event.target.value)}\n                placeholder={adminText.reasonPlaceholder}\n                rows={3}\n              />\n            </div>\n          ) : (\n            <p className="text-sm text-muted-foreground">\n              {adminText.confirmActionQuestion}\n            </p>\n          )}\n        </div>\n\n        <DialogFooter className="flex gap-2 flex-row-reverse justify-start">\n          <Button\n            variant={isDestructive ? "destructive" : "default"}\n            disabled={needsReason && !reason.trim()}\n            onClick={() => onConfirm(reason)}\n          >\n            {adminText.confirm}\n          </Button>\n\n          <Button variant="outline" onClick={onClose}>\n            {adminText.cancel}\n          </Button>\n        </DialogFooter>`,
  `  const isApproval = state.type === "approve";\n  const textAlignmentClass =\n    adminText.dir === "rtl" ? "text-right" : "text-left";\n\n  return (\n    <Dialog open onOpenChange={onClose}>\n      <DialogContent\n        className={isApproval ? "max-w-md gap-4" : "max-w-sm"}\n        dir={adminText.dir}\n      >\n        <DialogHeader className={textAlignmentClass}>\n          <DialogTitle\n            className={\`\${isDestructive ? "text-destructive" : ""} \${\n              isApproval ? "text-lg leading-6" : ""\n            }\`}\n          >\n            {labels[state.type]}\n          </DialogTitle>\n        </DialogHeader>\n\n        {isApproval ? (\n          <div className={\`space-y-3 \${textAlignmentClass}\`}>\n            <div className="rounded-xl border bg-muted/35 px-4 py-3">\n              <p className="text-xs text-muted-foreground">\n                {adminText.approvalAccountFor}\n              </p>\n              <p className="mt-1 text-base font-semibold text-foreground">\n                {state.merchantName}\n              </p>\n            </div>\n\n            <div className="rounded-xl border border-green-200 bg-green-50/70 px-4 py-3 text-sm leading-6 text-green-950 dark:border-green-900/70 dark:bg-green-950/30 dark:text-green-100">\n              <p>{adminText.approvalNoPlan}</p>\n              <p className="mt-1">{adminText.approvalDeadline}</p>\n            </div>\n          </div>\n        ) : (\n          <div className="space-y-3">\n            <p className="text-sm text-muted-foreground">\n              {adminText.storeLabel}:{" "}\n              <span className="font-medium text-foreground">\n                {state.merchantName}\n              </span>\n            </p>\n\n            {needsReason ? (\n              <div className="space-y-1.5">\n                <Label>{adminText.reasonRequired}</Label>\n\n                <Textarea\n                  value={reason}\n                  onChange={(event) => setReason(event.target.value)}\n                  placeholder={adminText.reasonPlaceholder}\n                  rows={3}\n                />\n              </div>\n            ) : (\n              <p className="text-sm text-muted-foreground">\n                {adminText.confirmActionQuestion}\n              </p>\n            )}\n          </div>\n        )}\n\n        {isApproval ? (\n          <DialogFooter\n            className="mt-1 flex flex-row justify-end gap-2"\n            dir="ltr"\n          >\n            <Button variant="outline" onClick={onClose} className="min-w-20">\n              {adminText.cancel}\n            </Button>\n            <Button\n              onClick={() => onConfirm(reason)}\n              className="min-w-32 bg-green-600 text-white hover:bg-green-700"\n            >\n              {adminText.confirmApproveAccountButton}\n            </Button>\n          </DialogFooter>\n        ) : (\n          <DialogFooter className="flex gap-2 flex-row-reverse justify-start">\n            <Button\n              variant={isDestructive ? "destructive" : "default"}\n              disabled={needsReason && !reason.trim()}\n              onClick={() => onConfirm(reason)}\n            >\n              {adminText.confirm}\n            </Button>\n\n            <Button variant="outline" onClick={onClose}>\n              {adminText.cancel}\n            </Button>\n          </DialogFooter>\n        )}`,
);

fs.writeFileSync(adminPagePath, page, "utf8");

let translations = fs.readFileSync(translationsPath, "utf8");

translations = replaceOnce(
  translations,
  "Arabic approval dialog copy",
  `    confirmApproveAccount: "قبول حساب المتجر",\n    confirmRejectStore:`,
  `    confirmApproveAccount: "قبول حساب المتجر",\n    approvalAccountFor: "سيتم قبول حساب المتجر:",\n    approvalNoPlan: "لن يتم تفعيل أي باقة عند قبول الحساب.",\n    approvalDeadline:\n      "لدى التاجر 10 أيام لربط أول قناة، وتبدأ التجربة المجانية عند نجاح الربط.",\n    confirmApproveAccountButton: "تأكيد قبول الحساب",\n    confirmRejectStore:`,
);

translations = replaceOnce(
  translations,
  "English approval dialog copy",
  `    confirmApproveAccount: "Approve merchant account",\n    confirmRejectStore:`,
  `    confirmApproveAccount: "Approve merchant account",\n    approvalAccountFor: "The following merchant account will be approved:",\n    approvalNoPlan: "No plan will be activated when the account is approved.",\n    approvalDeadline:\n      "The merchant has 10 days to connect the first channel. The free trial starts after a successful connection.",\n    confirmApproveAccountButton: "Confirm account approval",\n    confirmRejectStore:`,
);

translations = replaceOnce(
  translations,
  "Kurdish approval dialog copy",
  `  confirmApproveAccount: "پەسەندکردنی هەژماری فرۆشگا",\n  confirmRejectStore:`,
  `  confirmApproveAccount: "پەسەندکردنی هەژماری فرۆشگا",\n  approvalAccountFor: "ئەم هەژمارەی فرۆشگا پەسەند دەکرێت:",\n  approvalNoPlan: "لە کاتی پەسەندکردنی هەژماردا هیچ پلانێک چالاک ناکرێت.",\n  approvalDeadline:\n    "فرۆشیار 10 ڕۆژی هەیە بۆ بەستنی یەکەم کەناڵ، و تاقیکردنەوەی خۆڕایی دوای سەرکەوتنی پەیوەستکردن دەست پێ دەکات.",\n  confirmApproveAccountButton: "پشتڕاستکردنەوەی پەسەندکردنی هەژمار",\n  confirmRejectStore:`,
);

fs.writeFileSync(translationsPath, translations, "utf8");
console.log("Approval dialog refinement applied.");
