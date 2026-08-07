import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

const WORKFLOW_DIR = path.resolve(".github/workflows");
const FORBIDDEN = [
  { id: "contents-write", pattern: /^\s*contents:\s*write\s*$/m },
  { id: "pull-request-target", pattern: /^\s*pull_request_target:\s*$/m },
  { id: "persist-credentials-true", pattern: /^\s*persist-credentials:\s*true\s*$/m },
  { id: "force-push", pattern: /git\s+push[^\n]*(?:--force|-f\b)/i },
];

function workflowFiles() {
  return readdirSync(WORKFLOW_DIR, { withFileTypes: true })
    .filter((entry) => entry.isFile() && /\.ya?ml$/i.test(entry.name))
    .map((entry) => path.join(WORKFLOW_DIR, entry.name))
    .sort();
}

function main() {
  const violations = [];
  const files = workflowFiles();
  if (files.length === 0) throw new Error("No GitHub Actions workflows found");

  for (const file of files) {
    const relative = path.relative(process.cwd(), file).split(path.sep).join("/");
    const text = readFileSync(file, "utf8");

    if (!/^permissions:\s*\n\s+contents:\s+read\s*$/m.test(text)) {
      violations.push({ file: relative, rule: "top-level-contents-read" });
    }
    if (!/^concurrency:\s*\n\s+group:\s*.+\n\s+cancel-in-progress:\s*true\s*$/m.test(text)) {
      violations.push({ file: relative, rule: "concurrency-cancel-latest" });
    }
    if (!/^\s{6,}persist-credentials:\s*false\s*$/m.test(text)) {
      violations.push({ file: relative, rule: "checkout-persist-credentials-false" });
    }
    if (!/^\s{2}(?:pull_request|push|workflow_dispatch|schedule):/m.test(text)) {
      violations.push({ file: relative, rule: "explicit-trigger" });
    }

    for (const rule of FORBIDDEN) {
      if (rule.pattern.test(text)) violations.push({ file: relative, rule: rule.id });
    }
  }

  process.stdout.write(
    `${JSON.stringify({ status: violations.length ? "fail" : "pass", workflows: files.length, violations }, null, 2)}\n`,
  );
  if (violations.length > 0) process.exitCode = 1;
}

main();
