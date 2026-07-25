import fs from "node:fs";

const filePath = "artifacts/fawri/src/components/admin/AdministratorsTab.tsx";
let source = fs.readFileSync(filePath, "utf8");

function replaceOnce(label, before, after) {
  const first = source.indexOf(before);
  if (first === -1) throw new Error(`Could not find ${label}`);
  if (source.indexOf(before, first + before.length) !== -1) {
    throw new Error(`Found multiple matches for ${label}`);
  }
  source = source.slice(0, first) + after + source.slice(first + before.length);
}

replaceOnce(
  "permission dialog content classes",
  `        <DialogContent
          className="sm:max-w-lg"
          dir={adminText.dir}`,
  `        <DialogContent
          className={
            adminText.dir === "rtl"
              ? "sm:max-w-lg [&>button]:left-4 [&>button]:right-auto"
              : "sm:max-w-lg"
          }
          dir={adminText.dir}`,
);

replaceOnce(
  "permission dialog header",
  `          <DialogHeader
            className={adminText.dir === "rtl" ? "text-right" : "text-left"}
          >`,
  `          <DialogHeader
            className={
              adminText.dir === "rtl"
                ? "pl-14 text-right sm:!text-right"
                : "pr-14 text-left"
            }
          >`,
);

replaceOnce(
  "permission dialog description",
  `            <DialogDescription>
              {permissionText.description}
              {selectedAdministrator?.owner_name
                ? \` (\${selectedAdministrator.owner_name})\`
                : ""}
            </DialogDescription>`,
  `            <DialogDescription>
              <span className="block">{permissionText.description}</span>
              {selectedAdministrator?.owner_name && (
                <span className="mt-1 block" dir="auto">
                  ({selectedAdministrator.owner_name})
                </span>
              )}
            </DialogDescription>`,
);

fs.writeFileSync(filePath, source, "utf8");
console.log("Permission dialog header spacing fixed.");
