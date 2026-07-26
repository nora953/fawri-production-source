import fs from "node:fs";

const filePath = "artifacts/fawri/src/pages/AdminPage.tsx";
const source = fs.readFileSync(filePath, "utf8");

const sectionStartMarker =
  "// ── Details modal ──────────────────────────────────────────────────────────────";
const sectionEndMarker =
  "// ── Admin logs tab ─────────────────────────────────────────────────────────────";

const sectionStart = source.indexOf(sectionStartMarker);
const sectionEnd = source.indexOf(sectionEndMarker, sectionStart);

if (sectionStart === -1 || sectionEnd === -1 || sectionEnd <= sectionStart) {
  throw new Error("Could not isolate DetailsModal");
}

let detailsSection = source.slice(sectionStart, sectionEnd);

function replaceExact(label, before, after) {
  const matches = detailsSection.split(before).length - 1;
  if (matches !== 1) {
    throw new Error(`${label}: expected one match, found ${matches}`);
  }
  detailsSection = detailsSection.replace(before, after);
}

replaceExact(
  "store cards",
  `          {activeTab === "store" && (\n            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">\n              {storeDetails.map(([label, value]) => (\n                <div\n                  key={label}\n                  className={\`flex min-h-20 flex-col justify-center rounded-lg bg-muted/50 p-3 \${textAlignmentClass}\`}\n                >\n                  <p className="text-xs text-muted-foreground">{label}</p>\n\n                  <p className="mt-1 break-all text-sm font-medium">{value}</p>\n                </div>\n              ))}\n            </div>\n          )}`,
  `          {activeTab === "store" && (\n            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">\n              {storeDetails.map(([label, value]) => (\n                <div\n                  key={label}\n                  className={\`flex min-h-28 flex-col justify-between gap-3 rounded-lg border p-3 \${textAlignmentClass}\`}\n                >\n                  <p className="text-sm font-medium leading-5">{label}</p>\n\n                  <span\n                    className={\`inline-flex min-h-9 w-full items-center justify-start rounded-md border bg-muted px-2 py-2 text-sm font-medium \${textAlignmentClass}\`}\n                  >\n                    {value}\n                  </span>\n                </div>\n              ))}\n            </div>\n          )}`,
);

replaceExact(
  "subscription cards",
  `          {activeTab === "subscription" &&\n            (sub ? (\n              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">\n                {subscriptionDetails.map(([label, value]) => (\n                  <div\n                    key={label}\n                    className={\`flex min-h-20 flex-col justify-center rounded-lg bg-muted/50 p-3 \${textAlignmentClass}\`}\n                  >\n                    <p className="text-xs text-muted-foreground">{label}</p>\n\n                    <p className="mt-1 text-sm font-medium">{value}</p>\n                  </div>\n                ))}\n              </div>\n            ) : (`,
  `          {activeTab === "subscription" &&\n            (sub ? (\n              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">\n                {subscriptionDetails.map(([label, value]) => (\n                  <div\n                    key={label}\n                    className={\`flex min-h-28 flex-col justify-between gap-3 rounded-lg border p-3 \${textAlignmentClass}\`}\n                  >\n                    <p className="text-sm font-medium leading-5">{label}</p>\n\n                    <span\n                      className={\`inline-flex min-h-9 w-full items-center justify-start rounded-md border bg-muted px-2 py-2 text-sm font-medium \${textAlignmentClass}\`}\n                    >\n                      {value}\n                    </span>\n                  </div>\n                ))}\n              </div>\n            ) : (`,
);

const updatedSource =
  source.slice(0, sectionStart) + detailsSection + source.slice(sectionEnd);
fs.writeFileSync(filePath, updatedSource, "utf8");

const finalSource = fs.readFileSync(filePath, "utf8");
const finalStart = finalSource.indexOf(sectionStartMarker);
const finalEnd = finalSource.indexOf(sectionEndMarker, finalStart);
const finalDetails = finalSource.slice(finalStart, finalEnd);

for (const marker of [
  `grid grid-cols-2 gap-3 sm:grid-cols-3`,
  `flex min-h-28 flex-col justify-between gap-3 rounded-lg border p-3`,
  `inline-flex min-h-9 w-full items-center justify-start rounded-md border bg-muted`,
]) {
  if (!finalDetails.includes(marker)) {
    throw new Error(`Missing final marker: ${marker}`);
  }
}

if (
  finalDetails.includes(
    `flex min-h-20 flex-col justify-center rounded-lg bg-muted/50 p-3`,
  )
) {
  throw new Error("Old store/subscription card styling still remains");
}

console.log("Store and subscription cards now match the channels card style.");
