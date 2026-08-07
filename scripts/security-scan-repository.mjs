import { execFileSync } from "node:child_process";
import { readFileSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { findSensitiveText, summarizeFindings } from "./security-redaction-lib.mjs";

const MAX_FILE_BYTES = 2 * 1024 * 1024;
const SKIP_PREFIXES = [".git/", "node_modules/", "dist/", "coverage/", "data/"];
const SELF_PATHS = new Set([
  "scripts/security-redaction-lib.mjs",
  "scripts/security-redaction-lib.test.mjs",
]);

function repositoryRoot() {
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
}

function trackedFiles(root) {
  const output = execFileSync("git", ["ls-files", "-z"], {
    cwd: root,
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });
  return output.split("\0").filter(Boolean);
}

function isSkippable(file) {
  return SELF_PATHS.has(file) || SKIP_PREFIXES.some((prefix) => file.startsWith(prefix));
}

function main() {
  const root = repositoryRoot();
  const findings = [];
  let scanned = 0;
  let skipped = 0;

  for (const file of trackedFiles(root)) {
    if (isSkippable(file)) {
      skipped += 1;
      continue;
    }

    const absolute = path.join(root, file);
    const stat = statSync(absolute, { throwIfNoEntry: false });
    if (!stat?.isFile() || stat.size > MAX_FILE_BYTES) {
      skipped += 1;
      continue;
    }

    const buffer = readFileSync(absolute);
    if (buffer.includes(0)) {
      skipped += 1;
      continue;
    }

    scanned += 1;
    const text = buffer.toString("utf8");
    const fileFindings = findSensitiveText(text, { includePii: false, includeAssignments: false });
    for (const finding of fileFindings) {
      const line = text.slice(0, finding.index).split("\n").length;
      findings.push({ file, line, rule: finding.rule });
    }
  }

  const report = {
    status: findings.length === 0 ? "pass" : "fail",
    scanned_files: scanned,
    skipped_files: skipped,
    findings: summarizeFindings(findings),
    locations: findings.map(({ file, line, rule }) => ({ file, line, rule })),
  };

  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  if (findings.length > 0) process.exitCode = 1;
}

main();
