import fs from "node:fs";

const filePath = "artifacts/fawri/src/pages/AdminPage.tsx";
let source = fs.readFileSync(filePath, "utf8");

function replaceOnce(label, before, after) {
  if (source.includes(after)) return;
  const first = source.indexOf(before);
  if (first === -1) throw new Error(`Could not find ${label}`);
  if (source.indexOf(before, first + before.length) !== -1) {
    throw new Error(`Found multiple matches for ${label}`);
  }
  source = source.slice(0, first) + after + source.slice(first + before.length);
}

replaceOnce(
  "approval dialog responsive footer",
  `        {isApproval ? (\n          <DialogFooter\n            className="mt-1 flex flex-row justify-end gap-2"\n            dir="ltr"\n          >\n            <Button variant="outline" onClick={onClose} className="min-w-20">\n              {adminText.cancel}\n            </Button>\n            <Button\n              onClick={() => onConfirm(reason)}\n              className="min-w-32 bg-green-600 text-white hover:bg-green-700"\n            >\n              {adminText.confirmApproveAccountButton}\n            </Button>\n          </DialogFooter>`,
  `        {isApproval ? (\n          <DialogFooter\n            className="mt-1 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end"\n            dir="ltr"\n          >\n            <Button\n              variant="outline"\n              onClick={onClose}\n              className="h-auto min-h-10 w-full whitespace-normal px-4 py-2 sm:w-auto sm:min-w-20"\n            >\n              {adminText.cancel}\n            </Button>\n            <Button\n              onClick={() => onConfirm(reason)}\n              className="h-auto min-h-10 w-full whitespace-normal bg-green-600 px-4 py-2 text-white hover:bg-green-700 sm:w-auto sm:min-w-32"\n            >\n              {adminText.confirmApproveAccountButton}\n            </Button>\n          </DialogFooter>`,
);

fs.writeFileSync(filePath, source, "utf8");
console.log("Approval dialog mobile footer fixed.");
