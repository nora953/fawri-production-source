import fs from "node:fs";
import { execSync } from "node:child_process";

const sourcePath = "artifacts/fawri/src/pages/AdminPage.tsx";
const selfPath = "scripts/restrict-admin-notes-to-owner.mjs";
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

let source = fs.readFileSync(sourcePath, "utf8");
const detailsStart = source.indexOf("function DetailsModal({");
const detailsEnd = source.indexOf("// ── Admin logs tab", detailsStart);
if (detailsStart === -1 || detailsEnd === -1) {
  throw new Error("Could not isolate DetailsModal section");
}

let details = source.slice(detailsStart, detailsEnd);
details = replaceOnce(
  details,
  "DetailsModal prop declaration",
  "  canManageMerchants,\n  canManageSubscriptions,",
  "  canManageNotes,\n  canManageSubscriptions,",
);
details = replaceOnce(
  details,
  "DetailsModal prop type",
  "  canManageMerchants: boolean;\n  canManageSubscriptions: boolean;",
  "  canManageNotes: boolean;\n  canManageSubscriptions: boolean;",
);
details = replaceOnce(
  details,
  "notes tab visibility",
  "    ...(canManageMerchants\n      ? [{ id: \"notes\" as const, label: adminText.detailsTabNotes }]\n      : []),",
  "    ...(canManageNotes\n      ? [{ id: \"notes\" as const, label: adminText.detailsTabNotes }]\n      : []),",
);

if (details.includes("canManageMerchants")) {
  throw new Error("DetailsModal still references canManageMerchants");
}
source = source.slice(0, detailsStart) + details + source.slice(detailsEnd);

const invocationStart = source.lastIndexOf("<DetailsModal");
if (invocationStart === -1) {
  throw new Error("Could not find DetailsModal invocation");
}
const invocationEnd = source.indexOf("/>", invocationStart);
if (invocationEnd === -1) {
  throw new Error("Could not find end of DetailsModal invocation");
}
let invocation = source.slice(invocationStart, invocationEnd + 2);

let ownerExpression;
if (source.includes('const isOwner = currentAdmin?.admin_role === "owner_admin"')) {
  ownerExpression = "isOwner";
} else if (source.includes('const isOwnerAdmin = currentAdmin?.admin_role === "owner_admin"')) {
  ownerExpression = "isOwnerAdmin";
} else if (source.includes("currentAdmin?.admin_role")) {
  ownerExpression = 'currentAdmin?.admin_role === "owner_admin"';
} else {
  throw new Error("Could not determine owner role expression");
}

invocation = replaceOnce(
  invocation,
  "DetailsModal invocation permission",
  "canManageMerchants={canManageMerchants}",
  `canManageNotes={${ownerExpression}}`,
);
source = source.slice(0, invocationStart) + invocation + source.slice(invocationEnd + 2);

fs.writeFileSync(sourcePath, source, "utf8");

const finalSource = fs.readFileSync(sourcePath, "utf8");
const finalDetails = finalSource.slice(
  finalSource.indexOf("function DetailsModal({"),
  finalSource.indexOf("// ── Admin logs tab", finalSource.indexOf("function DetailsModal({")),
);
for (const marker of [
  "canManageNotes,",
  "canManageNotes: boolean;",
  "...(canManageNotes",
  "canManageNotes={",
]) {
  if (!finalSource.includes(marker)) {
    throw new Error(`Missing final marker: ${marker}`);
  }
}
if (finalDetails.includes("canManageMerchants")) {
  throw new Error("Final DetailsModal still exposes notes through merchant-status permission");
}

run("pnpm run typecheck");
run("PORT=3000 BASE_PATH=/ pnpm --filter @workspace/fawri run build");

fs.rmSync(selfPath);
run("git diff --check");
run(`git add ${sourcePath} ${selfPath}`);
run('git commit -m "Restrict merchant notes to owner"');
run(`git push origin ${branch}`);

console.log("\nCompleted: merchant notes are owner-only, validated, committed, and pushed.");
