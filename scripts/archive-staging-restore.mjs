import { buildStagingRestorePlan } from "./lib/staging-restore-policy.mjs";
import { writeRestoreArchive } from "./lib/staging-restore-archive.mjs";

try {
  const args = process.argv.slice(2);
  if (args.length !== 2 || args.some((arg) => arg.startsWith("--"))) {
    throw new Error("Usage: node scripts/archive-staging-restore.mjs <data-directory> <private-output-file-outside-repository>");
  }
  const { report } = buildStagingRestorePlan({ dataDirectory: args[0], includeRows: true });
  console.log(JSON.stringify(writeRestoreArchive(report, args[1]), null, 2));
} catch (error) {
  console.error(JSON.stringify({ ok: false, error: error.code || error.message, database_connection_used: false, database_writes_performed: false }));
  process.exitCode = 1;
}
