import { buildStagingRestorePlan } from "./lib/staging-restore-policy.mjs";

try {
  const args = process.argv.slice(2);
  if (args.length !== 1 || args[0].startsWith("--")) throw new Error("Usage: node scripts/plan-staging-restore.mjs <data-directory> (read-only; no write mode)");
  const { report } = buildStagingRestorePlan({ dataDirectory: args[0] });
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  process.exitCode = report.ok ? 0 : 2;
} catch (error) {
  process.stderr.write(`${JSON.stringify({ ok: false, writes_performed: false, database_connection_used: false, error: error.message })}\n`);
  process.exitCode = 1;
}
