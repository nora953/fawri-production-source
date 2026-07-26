import fs from "node:fs";
import { execSync } from "node:child_process";

const sourcePath = "artifacts/fawri/src/pages/AdminPage.tsx";
const selfPath = "scripts/finish-mobile-details-status.mjs";
const branch = "feature/admin-permissions-v2";

function run(command) {
  console.log(`\n> ${command}`);
  execSync(command, { stdio: "inherit", shell: "/bin/bash" });
}

const source = fs.readFileSync(sourcePath, "utf8");
const startMarker =
  "// ── Details modal ──────────────────────────────────────────────────────────────";
const endMarker =
  "// ── Admin logs tab ─────────────────────────────────────────────────────────────";
const start = source.indexOf(startMarker);
const end = source.indexOf(endMarker, start);

if (start === -1 || end === -1 || end <= start) {
  throw new Error("Could not isolate DetailsModal");
}

let details = source.slice(start, end);

function replaceOnce(label, before, after) {
  const count = details.split(before).length - 1;
  if (count !== 1) {
    throw new Error(`${label}: expected one match, found ${count}`);
  }
  details = details.replace(before, after);
}

replaceOnce(
  "mobile tab text size",
  'className={`-mb-px min-w-0 whitespace-nowrap border-b-2 px-0.5 py-2 text-[10px] tracking-tight transition-colors sm:px-4 sm:text-sm sm:tracking-normal ${',
  'className={`-mb-px min-w-0 whitespace-nowrap border-b-2 px-0.5 py-2 text-xs tracking-tight transition-colors sm:px-4 sm:text-sm sm:tracking-normal ${',
);

replaceOnce(
  "channel status formatter",
  "  const storeDetails: [string, string][] = [",
  `  const getChannelStatusText = (status: string): string => {\n    if (status === "connected") return adminText.detailsChannelConnected;\n    if (status === "pending") return adminText.detailsChannelPending;\n    return adminText.detailsChannelDisconnected;\n  };\n\n  const storeDetails: [string, string][] = [`,
);

replaceOnce(
  "editable channel status trigger",
  `                      <SelectTrigger className="h-auto min-h-9 w-full gap-1 px-2 py-1.5 text-[10px] [&>span]:line-clamp-none [&>span]:whitespace-normal [&>span]:break-words [&>span]:text-center [&>span]:leading-4 sm:text-xs">\n                        <SelectValue />\n                      </SelectTrigger>`,
  `                      <SelectTrigger className="h-auto min-h-10 w-full gap-1 px-2 py-1.5 text-[11px] [&>span]:!line-clamp-none [&>span]:whitespace-normal [&>span]:break-words [&>span]:text-center [&>span]:leading-4 sm:text-xs">\n                        <span className="block min-w-0 flex-1 !line-clamp-none whitespace-normal break-words text-center leading-4">\n                          {getChannelStatusText(\n                            channelOverrides[key] ?? "disconnected",\n                          )}\n                        </span>\n                      </SelectTrigger>`,
);

const updated = source.slice(0, start) + details + source.slice(end);
fs.writeFileSync(sourcePath, updated, "utf8");

const verified = fs.readFileSync(sourcePath, "utf8").slice(start, end + 600);
for (const marker of [
  "text-xs tracking-tight transition-colors",
  "const getChannelStatusText = (status: string): string =>",
  "[&>span]:!line-clamp-none",
  "channelOverrides[key] ?? \"disconnected\"",
]) {
  if (!verified.includes(marker)) {
    throw new Error(`Missing final marker: ${marker}`);
  }
}

if (verified.includes("<SelectValue />")) {
  throw new Error("Old editable channel SelectValue remains in DetailsModal");
}

run("pnpm run typecheck");
run("PORT=3000 BASE_PATH=/ pnpm --filter @workspace/fawri run build");

fs.rmSync(selfPath);
run("git diff --check");
run(`git add ${sourcePath} ${selfPath}`);
run('git commit -m "Show full mobile channel statuses"');
run(`git push origin ${branch}`);

console.log("\nCompleted: source updated, tests passed, temporary script removed, committed, and pushed.");
