import path from "node:path";
import {
  assertCompleteMigrationWritable,
  buildValidatedMigrationPlan,
} from "./lib/postgresql-migration-plan-complete.mjs";

const dataArgument = process.argv.find(
  (value, index) => index > 1 && !value.startsWith("--"),
);
const dataDirectory = path.resolve(
  dataArgument ||
    process.env.FAWRI_DATA_DIR ||
    path.join("artifacts", "api-server", "data"),
);
const requireWriteReady = process.argv.includes("--require-write-ready");

try {
  const { report } = buildValidatedMigrationPlan({
    dataDirectory,
    includeRows: false,
  });
  if (requireWriteReady) assertCompleteMigrationWritable(report);
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  process.exitCode = report.ok ? 0 : 2;
} catch (error) {
  process.stderr.write(
    `${JSON.stringify(
      {
        ok: false,
        mode: "complete_read_only_migration_plan",
        data_dir: dataDirectory,
        writes_performed: false,
        database_connection_used: false,
        code: error?.code || "COMPLETE_MIGRATION_PLAN_FAILED",
        error: String(error?.message || error),
        ...(Array.isArray(error?.blockers)
          ? { write_readiness_blockers: error.blockers }
          : {}),
      },
      null,
      2,
    )}\n`,
  );
  process.exitCode = 1;
}
