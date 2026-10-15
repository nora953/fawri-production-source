import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const dataArgument = process.argv.find(
  (value, index) => index > 1 && !value.startsWith("--"),
);
const dataDirectory = path.resolve(
  dataArgument ||
    process.env.FAWRI_DATA_DIR ||
    path.join("artifacts", "api-server", "data"),
);

const auditors = [
  {
    name: "json_sources",
    script: "audit-fawri-json-data.mjs",
  },
  {
    name: "background_jobs",
    script: "audit-fawri-background-jobs.mjs",
  },
  {
    name: "manual_conversations",
    script: "audit-manual-conversation-operations.mjs",
  },
];

function runAuditor(auditor) {
  const scriptPath = path.join(scriptDirectory, auditor.script);
  const result = spawnSync(process.execPath, [scriptPath, dataDirectory], {
    cwd: path.resolve(scriptDirectory, ".."),
    encoding: "utf8",
    env: {
      ...process.env,
      DATABASE_URL: "postgresql://must-not-be-used.invalid/fawri",
    },
  });
  if (result.error) throw result.error;

  const output = result.status === 1 ? result.stderr : result.stdout;
  let report;
  try {
    report = JSON.parse(output || "{}");
  } catch (error) {
    throw new Error(
      `${auditor.name} returned invalid JSON: ${String(error)}; output=${String(output).slice(0, 500)}`,
    );
  }
  return {
    name: auditor.name,
    script: auditor.script,
    exit_code: result.status ?? 1,
    report,
  };
}

try {
  const results = auditors.map(runAuditor);
  const fatal = results.filter((result) => result.exit_code === 1);
  const failed = results.filter(
    (result) => result.exit_code !== 0 || result.report?.ok !== true,
  );
  const issueCount = results.reduce(
    (total, result) => total + Number(result.report?.summary?.issues || 0),
    0,
  );
  const report = {
    ok: failed.length === 0,
    mode: "read_only_aggregate_audit",
    generated_at: new Date().toISOString(),
    data_dir: dataDirectory,
    writes_performed: false,
    database_connection_used: false,
    summary: {
      auditors: results.length,
      passed: results.length - failed.length,
      failed: failed.length,
      fatal: fatal.length,
      issues: issueCount,
    },
    audits: Object.fromEntries(
      results.map((result) => [
        result.name,
        {
          script: result.script,
          exit_code: result.exit_code,
          report: result.report,
        },
      ]),
    ),
  };
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  process.exitCode = fatal.length > 0 ? 1 : report.ok ? 0 : 2;
} catch (error) {
  process.stderr.write(
    `${JSON.stringify(
      {
        ok: false,
        mode: "read_only_aggregate_audit",
        generated_at: new Date().toISOString(),
        data_dir: dataDirectory,
        writes_performed: false,
        database_connection_used: false,
        fatal_error: String(error),
      },
      null,
      2,
    )}\n`,
  );
  process.exitCode = 1;
}
