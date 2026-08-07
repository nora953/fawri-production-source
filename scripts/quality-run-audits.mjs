import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

const AUDITS = [
  { id: "order-operations", script: "scripts/audit-order-operations.mjs", args: [] },
  { id: "merchant-settings", script: "scripts/audit-merchant-settings.mjs", args: [] },
  { id: "catalog-operations", script: "scripts/audit-catalog-operations.mjs", args: ["--json"] },
  { id: "knowledge-operations", script: "scripts/audit-knowledge-operations.mjs", args: [] },
  {
    id: "background-jobs",
    script: "scripts/audit-fawri-background-jobs.mjs",
    args: ["artifacts/api-server/data"],
  },
];

const SAFE_SUMMARY_KEYS = new Set([
  "operations",
  "terminal_operations",
  "payment_decisions",
  "settings",
  "auto_reply_jobs",
  "auto_reply_jobs_suppressed",
  "auto_reply_jobs_waiting_while_disabled",
  "products",
  "variants",
  "inventory_mutations",
  "saved_answers",
  "training_requests",
  "learned_answers",
  "background_jobs",
  "queued",
  "retry",
  "processing",
  "completed",
  "dead_letter",
  "issues",
  "severity_counts",
  "proposed_rows",
]);

function parseArguments(argv) {
  let outputDir = "ci-artifacts/contracts/domain-audits";
  let auditRoot = process.cwd();
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === "--output-dir") {
      outputDir = argv[index + 1] ?? outputDir;
      index += 1;
    } else if (argv[index] === "--audit-root") {
      auditRoot = argv[index + 1] ?? auditRoot;
      index += 1;
    }
  }
  return { outputDir: path.resolve(outputDir), auditRoot: path.resolve(auditRoot) };
}

function boundedString(value, limit = 200) {
  if (typeof value !== "string") return undefined;
  return value.slice(0, limit);
}

function safeCounts(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const result = {};
  for (const [key, entry] of Object.entries(value)) {
    if (!SAFE_SUMMARY_KEYS.has(key)) continue;
    if (typeof entry === "number" && Number.isFinite(entry)) result[key] = entry;
    else if (typeof entry === "boolean") result[key] = entry;
    else if (entry && typeof entry === "object" && !Array.isArray(entry)) {
      const nested = {};
      for (const [nestedKey, nestedValue] of Object.entries(entry)) {
        if (typeof nestedValue === "number" && Number.isFinite(nestedValue)) {
          nested[nestedKey] = nestedValue;
        }
      }
      if (Object.keys(nested).length > 0) result[key] = nested;
    }
  }
  return Object.keys(result).length > 0 ? result : undefined;
}

function safeBlockers(value) {
  if (!Array.isArray(value)) return undefined;
  const blockers = value
    .filter((entry) => typeof entry === "string" && /^[A-Z0-9_:-]{1,100}$/.test(entry))
    .slice(0, 100);
  return blockers.length > 0 ? blockers : [];
}

function parseJson(stdout) {
  const trimmed = stdout.trim();
  if (!trimmed) return undefined;
  try {
    return JSON.parse(trimmed);
  } catch {
    return undefined;
  }
}

function safeAuditResult(audit, execution, parsed) {
  const report = {
    audit: audit.id,
    script: audit.script,
    status: execution.status === 0 && parsed?.ok !== false ? "pass" : "fail",
    exit_code: execution.status,
    parsed_json: Boolean(parsed),
  };

  if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
    if (typeof parsed.ok === "boolean") report.ok = parsed.ok;
    const mode = boundedString(parsed.mode, 40);
    if (mode) report.mode = mode;
    const summary = safeCounts(parsed.summary);
    if (summary) report.summary = summary;
    if (parsed.migration_readiness && typeof parsed.migration_readiness === "object") {
      report.migration_readiness = {
        ready:
          typeof parsed.migration_readiness.ready === "boolean"
            ? parsed.migration_readiness.ready
            : undefined,
        blockers: safeBlockers(parsed.migration_readiness.blockers),
      };
    }
  }

  if (execution.status !== 0 && !parsed) {
    report.failure_code = "AUDIT_COMMAND_FAILED_WITHOUT_JSON";
  }
  return report;
}

function runAudit(audit, root) {
  const scriptPath = path.join(root, audit.script);
  if (!existsSync(scriptPath)) {
    return {
      audit: audit.id,
      script: audit.script,
      status: "not_integrated",
      exit_code: null,
      parsed_json: false,
    };
  }

  const execution = spawnSync(process.execPath, [scriptPath, ...audit.args], {
    cwd: root,
    env: { ...process.env, CI: process.env.CI ?? "true" },
    encoding: "utf8",
    maxBuffer: 32 * 1024 * 1024,
  });
  const status = execution.error ? 1 : execution.status ?? 1;
  const parsed = parseJson(execution.stdout ?? "");
  return safeAuditResult(audit, { status }, parsed);
}

function main() {
  const { outputDir, auditRoot } = parseArguments(process.argv.slice(2));
  mkdirSync(outputDir, { recursive: true });

  const results = AUDITS.map((audit) => runAudit(audit, auditRoot));
  for (const result of results) {
    writeFileSync(path.join(outputDir, `${result.audit}.json`), `${JSON.stringify(result, null, 2)}\n`, {
      mode: 0o600,
    });
  }

  const present = results.filter((result) => result.status !== "not_integrated");
  const failed = present.filter((result) => result.status === "fail");
  const manifest = {
    status: failed.length === 0 ? "pass" : "fail",
    audits_configured: results.length,
    audits_present: present.length,
    audits_not_integrated: results.length - present.length,
    audits_failed: failed.length,
    results: results.map(({ audit, script, status, exit_code: exitCode }) => ({
      audit,
      script,
      status,
      exit_code: exitCode,
    })),
  };
  writeFileSync(path.join(outputDir, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`, {
    mode: 0o600,
  });
  process.stdout.write(`${JSON.stringify(manifest, null, 2)}\n`);
  if (failed.length > 0) process.exitCode = 1;
}

main();
