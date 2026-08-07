import { spawnSync } from "node:child_process";
import { mkdirSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { redactSensitiveText, summarizeFindings } from "./security-redaction-lib.mjs";

const MAX_BUFFER = 128 * 1024 * 1024;

function command(name, executable, args, options = {}) {
  return { name, executable, args, ...options };
}

function walkSql(directory) {
  const stat = statSync(directory, { throwIfNoEntry: false });
  if (!stat?.isDirectory()) return [];
  const files = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...walkSql(absolute));
    else if (entry.isFile() && entry.name.endsWith(".sql")) files.push(absolute);
  }
  return files.sort();
}

function suites() {
  return {
    server: [
      command("server-typecheck", "pnpm", ["--filter", "@workspace/api-server", "run", "typecheck"]),
      command("server-build", "pnpm", ["--filter", "@workspace/api-server", "run", "build"]),
      command("server-unit-tests", process.execPath, ["scripts/quality-run-tests.mjs", "server-unit"]),
      command("server-integration-tests", process.execPath, ["scripts/quality-run-tests.mjs", "server-integration"]),
    ],
    frontend: [
      command("frontend-typecheck", "pnpm", ["--filter", "./artifacts/fawri", "run", "typecheck"]),
      command("frontend-build", "pnpm", ["--filter", "./artifacts/fawri", "run", "build"]),
      command("frontend-tests", process.execPath, ["scripts/quality-run-tests.mjs", "frontend"]),
    ],
    "browser-storage": [
      command("browser-storage-script-syntax", process.execPath, ["--check", "scripts/audit-browser-operational-storage.mjs"]),
      command("browser-storage-tests", process.execPath, ["scripts/quality-run-tests.mjs", "browser-storage"]),
      command("browser-storage-audit", process.execPath, ["scripts/audit-browser-operational-storage.mjs", "."]),
    ],
    contracts: [
      command("contract-tests", process.execPath, ["scripts/quality-run-tests.mjs", "contracts"]),
    ],
    observability: [
      command("observability-tests", process.execPath, ["scripts/quality-run-tests.mjs", "observability"]),
    ],
    database: [
      command("database-typecheck", "pnpm", ["--filter", "@workspace/db", "run", "typecheck"]),
      command("database-schema-generate", "pnpm", ["--filter", "@workspace/db", "run", "schema:generate"]),
      command("database-schema-clean-tree", "git", ["diff", "--exit-code", "--", "lib/db/drizzle"]),
      command(
        "database-schema-smoke",
        "pnpm",
        ["--filter", "@workspace/db", "run", "schema:smoke"],
        { env: { FAWRI_ALLOW_MIGRATION_SMOKE: "1" } },
      ),
    ],
    migration: [
      command("migration-contract-tests", process.execPath, ["scripts/quality-run-tests.mjs", "migration"]),
      command(
        "migration-candidate-generate",
        "pnpm",
        ["--dir", "lib/db", "exec", "drizzle-kit", "generate", "--config=drizzle.complete.config.ts"],
        { before: () => rmSync("lib/db/drizzle-complete-candidate", { recursive: true, force: true }) },
      ),
      {
        name: "migration-candidate-apply",
        run() {
          const files = walkSql("lib/db/drizzle-complete-candidate");
          if (files.length === 0) {
            return { status: 1, stdout: "", stderr: "No generated migration SQL files were found\n" };
          }
          const chunks = [];
          let status = 0;
          for (const file of files) {
            const result = spawnSync("psql", [process.env.DATABASE_URL ?? "", "-v", "ON_ERROR_STOP=1", "-f", file], {
              cwd: process.cwd(),
              env: { ...process.env },
              encoding: "utf8",
              maxBuffer: MAX_BUFFER,
            });
            chunks.push(`Applying ${path.relative(process.cwd(), file)}\n`, result.stdout ?? "", result.stderr ?? "");
            if (result.error || result.status !== 0) {
              status = result.status ?? 1;
              break;
            }
          }
          return { status, stdout: chunks.join(""), stderr: "" };
        },
      },
    ],
    "__self-test-pass": [
      command("self-pass-one", process.execPath, ["-e", "console.log('safe-one')"]),
      command("self-pass-two", process.execPath, ["-e", "console.log('safe-two')"]),
    ],
    "__self-test-mixed": [
      command("self-pass", process.execPath, ["-e", "console.log('safe-pass')"]),
      command("self-fail", process.execPath, ["-e", "console.error('safe-fail'); process.exit(3)"]),
      command("self-after-fail", process.execPath, ["-e", "console.log('safe-after')"]),
    ],
  };
}

function parseArguments(argv) {
  const suite = argv[0];
  if (!suite) throw new Error("Usage: node scripts/quality-run-gate.mjs <suite> [--report path]");
  let reportPath;
  for (let index = 1; index < argv.length; index += 1) {
    if (argv[index] === "--report") {
      reportPath = argv[index + 1];
      index += 1;
    }
  }
  return { suite, reportPath };
}

function executeCheck(check) {
  check.before?.();
  if (check.run) return check.run();
  const result = spawnSync(check.executable, check.args, {
    cwd: process.cwd(),
    env: { ...process.env, ...(check.env ?? {}), CI: process.env.CI ?? "true" },
    encoding: "utf8",
    maxBuffer: MAX_BUFFER,
  });
  if (result.error) {
    return { status: 1, stdout: result.stdout ?? "", stderr: `${result.stderr ?? ""}${result.error.message}\n` };
  }
  return { status: result.status ?? 1, stdout: result.stdout ?? "", stderr: result.stderr ?? "" };
}

function printSafeOutput(name, raw) {
  const { text, findings } = redactSensitiveText(raw, { includePii: true, includeAssignments: true });
  process.stdout.write(`::group::${name}\n`);
  process.stdout.write(text);
  if (!text.endsWith("\n")) process.stdout.write("\n");
  process.stdout.write("::endgroup::\n");
  return findings;
}

function main() {
  const { suite, reportPath } = parseArguments(process.argv.slice(2));
  const checks = suites()[suite];
  if (!checks) throw new Error(`Unknown quality gate suite: ${suite}`);

  const results = [];
  for (const check of checks) {
    let execution;
    try {
      execution = executeCheck(check);
    } catch (error) {
      const message = error instanceof Error ? error.message : "unknown check error";
      execution = { status: 1, stdout: "", stderr: `${message}\n` };
    }

    const findings = printSafeOutput(check.name, `${execution.stdout}${execution.stderr}`);
    const status = findings.length > 0 ? "sensitive-output" : execution.status === 0 ? "pass" : "fail";
    results.push({
      check: check.name,
      status,
      exit_code: execution.status,
      sensitive_findings: summarizeFindings(findings),
    });
  }

  const report = {
    suite,
    status: results.every((result) => result.status === "pass") ? "pass" : "fail",
    checks: results,
  };
  if (reportPath) {
    const absolute = path.resolve(reportPath);
    mkdirSync(path.dirname(absolute), { recursive: true });
    writeFileSync(absolute, `${JSON.stringify(report, null, 2)}\n`, { mode: 0o600 });
  }
  process.stdout.write(`${suite}: ${report.status}; ${results.filter((result) => result.status === "pass").length}/${results.length} checks passed\n`);
  if (report.status !== "pass") process.exitCode = 1;
}

try {
  main();
} catch (error) {
  const message = error instanceof Error ? error.message : "unknown quality gate error";
  process.stderr.write(`quality-run-gate failed: ${message}\n`);
  process.exitCode = 1;
}
