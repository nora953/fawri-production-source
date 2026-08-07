import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
  findSensitiveText,
  parseAuditSeverityCounts,
  summarizeFindings,
} from "./security-ci-lib.mjs";

const MAX_REPOSITORY_FILE_BYTES = 2 * 1024 * 1024;
const MAX_OUTPUT_FILE_BYTES = 10 * 1024 * 1024;
const PROTECTED_WORKFLOWS = [
  "meta-webhook-pipeline.yml",
  "merchant-access-security.yml",
  "merchant-settings.yml",
  "postgresql-schema.yml",
  "postgresql-migration-candidate.yml",
  "complete-migration-safety.yml",
  "complete-schema-candidate.yml",
  "order-operations.yml",
  "browser-storage-audit.yml",
];
const FINAL_WORKFLOWS = ["quality-gates.yml", "security-supply-chain.yml"];

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

function readScannableText(file, maxBytes) {
  const stat = statSync(file, { throwIfNoEntry: false });
  if (!stat?.isFile() || stat.size > maxBytes) return null;
  const buffer = readFileSync(file);
  if (buffer.includes(0)) return null;
  return buffer.toString("utf8");
}

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

export function validateRepositoryPolicy(root, files) {
  const violations = [];
  const workflowDir = path.join(root, ".github", "workflows");

  for (const workflow of [...PROTECTED_WORKFLOWS, ...FINAL_WORKFLOWS]) {
    if (!existsSync(path.join(workflowDir, workflow))) violations.push(`missing workflow: ${workflow}`);
  }

  for (const workflow of FINAL_WORKFLOWS) {
    const workflowPath = path.join(workflowDir, workflow);
    if (!existsSync(workflowPath)) continue;
    const content = readFileSync(workflowPath, "utf8");
    if (!/^permissions:\s*\n\s+contents:\s*read\s*$/m.test(content)) {
      violations.push(`${workflow}: missing top-level contents: read permission`);
    }
    if (!/persist-credentials:\s*false/.test(content)) {
      violations.push(`${workflow}: checkout must disable persisted credentials`);
    }
    if (/pull_request_target\s*:/.test(content)) violations.push(`${workflow}: pull_request_target is forbidden`);
    if (/contents:\s*write/.test(content)) violations.push(`${workflow}: contents: write is forbidden`);
    if (/continue-on-error:\s*true/.test(content)) violations.push(`${workflow}: continue-on-error is forbidden`);
    if (/(?:\|\|\s*true|--force\b|force:\s*true)/.test(content)) {
      violations.push(`${workflow}: bypass/force construct is forbidden`);
    }
    for (const match of content.matchAll(/^\s*uses:\s*([^\s#]+)\s*$/gm)) {
      const action = match[1];
      if (!/@[0-9a-f]{40}$/i.test(action)) {
        violations.push(`${workflow}: action must be pinned to an immutable SHA: ${action}`);
      }
    }
  }

  if (!files.includes("pnpm-lock.yaml")) violations.push("pnpm-lock.yaml is required");
  for (const forbidden of ["package-lock.json", "npm-shrinkwrap.json", "yarn.lock"]) {
    const matches = files.filter((file) => path.basename(file) === forbidden);
    for (const match of matches) violations.push(`${match} is forbidden; pnpm is authoritative`);
  }

  const lockfilePath = path.join(root, "pnpm-lock.yaml");
  const workspacePath = path.join(root, "pnpm-workspace.yaml");
  const packagePath = path.join(root, "package.json");
  if (existsSync(lockfilePath)) {
    const lockfile = readFileSync(lockfilePath, "utf8");
    if (!/^lockfileVersion:\s*[\"']?9\.0[\"']?\s*$/m.test(lockfile)) {
      violations.push("pnpm lockfileVersion must remain 9.0");
    }
  }
  if (!existsSync(workspacePath)) violations.push("pnpm-workspace.yaml is required");
  if (!existsSync(packagePath)) violations.push("package.json is required");

  let minimumReleaseAge = null;
  if (existsSync(workspacePath)) {
    const workspace = readFileSync(workspacePath, "utf8");
    if (!/^autoInstallPeers:\s*false\s*$/m.test(workspace)) violations.push("autoInstallPeers must remain false");
    const match = workspace.match(/^minimumReleaseAge:\s*(\d+)\s*$/m);
    minimumReleaseAge = match ? Number(match[1]) : null;
    if (minimumReleaseAge === null || minimumReleaseAge < 1440) {
      violations.push("minimumReleaseAge must be at least 1440 minutes");
    }
  }

  if (existsSync(packagePath)) {
    const packageJson = JSON.parse(readFileSync(packagePath, "utf8"));
    const preinstall = String(packageJson?.scripts?.preinstall ?? "");
    if (!preinstall.includes("Use pnpm instead")) violations.push("root preinstall must reject non-pnpm installs");
  }

  return {
    status: violations.length === 0 ? "pass" : "fail",
    protected_workflows: PROTECTED_WORKFLOWS.length,
    final_workflows: FINAL_WORKFLOWS.length,
    lockfile: "pnpm-lock.yaml",
    minimum_release_age_minutes: minimumReleaseAge,
    violations,
  };
}

function scanRepository(root) {
  const findings = [];
  let scanned = 0;
  let skipped = 0;
  for (const file of trackedFiles(root)) {
    const absolute = path.join(root, file);
    const text = readScannableText(absolute, MAX_REPOSITORY_FILE_BYTES);
    if (text === null) {
      skipped += 1;
      continue;
    }
    scanned += 1;
    for (const finding of findSensitiveText(text, { includePrivateData: false, includeAssignments: false })) {
      const line = text.slice(0, finding.index).split("\n").length;
      findings.push({ file, line, rule: finding.rule });
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
  return findings.length === 0 ? 0 : 1;
}

function scanOutput(inputs) {
  if (inputs.length === 0) throw new Error("output scan requires at least one file or directory");
  const findings = [];
  let scanned = 0;
  let skipped = 0;
  for (const input of inputs) {
    for (const file of collectFiles(path.resolve(input))) {
      const text = readScannableText(file, MAX_OUTPUT_FILE_BYTES);
      if (text === null) {
        skipped += 1;
        continue;
      }
      scanned += 1;
      for (const finding of findSensitiveText(text, { includePrivateData: true, includeAssignments: true })) {
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
  return findings.length === 0 ? 0 : 1;
}

function dependencyAudit() {
  const result = spawnSync("pnpm", ["audit", "--json", "--audit-level=high"], {
    cwd: process.cwd(),
    env: { ...process.env, CI: process.env.CI ?? "true" },
    encoding: "utf8",
    maxBuffer: 32 * 1024 * 1024,
  });
  if (result.error) throw result.error;
  const stdout = String(result.stdout ?? "").trim();
  if (!stdout) throw new Error("pnpm audit produced no JSON output");

  let payload;
  try {
    payload = JSON.parse(stdout);
  } catch {
    throw new Error("pnpm audit output was not valid JSON");
  }
  const counts = parseAuditSeverityCounts(payload);
  const blocking = counts.high + counts.critical;
  const report = {
    status: blocking === 0 && (result.status ?? 1) === 0 ? "pass" : "fail",
    vulnerabilities: counts,
    blocking_severities: ["high", "critical"],
  };
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);

  if (blocking > 0) return 1;
  if ((result.status ?? 1) !== 0) throw new Error(`pnpm audit failed with status ${result.status ?? 1}`);
  return 0;
}

export function main(argv = process.argv.slice(2)) {
  const command = argv[0];
  const root = repositoryRoot();
  if (command === "repository") return scanRepository(root);
  if (command === "output") return scanOutput(argv.slice(1));
  if (command === "dependency") return dependencyAudit();
  if (command === "policy") {
    const report = validateRepositoryPolicy(root, trackedFiles(root));
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
    return report.status === "pass" ? 0 : 1;
  }
  throw new Error("Usage: node scripts/security-final-audit.mjs <repository|output|dependency|policy> [paths...]");
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    process.exitCode = main();
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown security audit error";
    process.stderr.write(`security-final-audit failed closed: ${message}\n`);
    process.exitCode = 2;
  }
}
