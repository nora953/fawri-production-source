import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { findSensitiveText, summarizeFindings } from "./security-redaction-lib.mjs";

const MAX_FILE_BYTES = 10 * 1024 * 1024;

function collectFiles(inputPath) {
  const stat = statSync(inputPath, { throwIfNoEntry: false });
  if (!stat) throw new Error(`Path does not exist: ${inputPath}`);
  if (stat.isFile()) return [inputPath];
  if (!stat.isDirectory()) return [];

  const files = [];
  for (const entry of readdirSync(inputPath, { withFileTypes: true })) {
    if (entry.isSymbolicLink()) continue;
    files.push(...collectFiles(path.join(inputPath, entry.name)));
  }
  return files;
}

function main() {
  const inputs = process.argv.slice(2);
  if (inputs.length === 0) {
    throw new Error("Usage: node scripts/security-scan-output.mjs <file-or-directory> [...]");
  }

  const findings = [];
  let scanned = 0;
  let skipped = 0;

  for (const input of inputs) {
    for (const file of collectFiles(path.resolve(input))) {
      const stat = statSync(file);
      if (stat.size > MAX_FILE_BYTES) {
        skipped += 1;
        continue;
      }
      const buffer = readFileSync(file);
      if (buffer.includes(0)) {
        skipped += 1;
        continue;
      }

      scanned += 1;
      const text = buffer.toString("utf8");
      for (const finding of findSensitiveText(text, { includePii: true })) {
        const line = text.slice(0, finding.index).split("\n").length;
        findings.push({ file: path.relative(process.cwd(), file), line, rule: finding.rule });
      }
    }
  }

  const report = {
    status: findings.length === 0 ? "pass" : "fail",
    scanned_files: scanned,
    skipped_files: skipped,
    findings: summarizeFindings(findings),
    locations: findings,
  };
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  if (findings.length > 0) process.exitCode = 1;
}

main();
