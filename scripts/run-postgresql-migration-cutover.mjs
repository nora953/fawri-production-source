import path from "node:path";
import { runCompleteLockedMigration } from "../lib/db/scripts/run-complete-migration-with-operational-locks.mjs";
import {
  assertCompleteMigrationWritable,
  buildValidatedMigrationPlan,
} from "./lib/postgresql-migration-plan-complete.mjs";

const dataArgument = process.argv.find(
  (value, index) => index > 1 && !value.startsWith("--"),
);
const dataDirectory = path.resolve(
  dataArgument || process.env.FAWRI_DATA_DIR || path.join("artifacts", "api-server", "data"),
);
const commitTest = process.argv.includes("--commit-test");
const rollbackTest = process.argv.includes("--rollback-test");
const write = process.argv.includes("--write");

try {
  if (write) {
    const error = new Error(
      "Real cutover execution is intentionally unavailable. Complete backup, restore rehearsal, change approval, and production credential provisioning first.",
    );
    error.code = "REAL_CUTOVER_NOT_IMPLEMENTED";
    throw error;
  }
  if (commitTest && rollbackTest) {
    throw new Error("Choose only one of --commit-test or --rollback-test");
  }

  if (!commitTest && !rollbackTest) {
    const { report } = buildValidatedMigrationPlan({
      dataDirectory,
      includeRows: false,
    });
    assertCompleteMigrationWritable(report);
    process.stdout.write(
      `${JSON.stringify(
        {
          ...report,
          mode: "dry_run",
          writes_performed: false,
          database_connection_used: false,
        },
        null,
        2,
      )}\n`,
    );
    process.exitCode = report.ok ? 0 : 2;
  } else {
    const mode = commitTest ? "commit" : "rollback";
    const requiredFlag = commitTest
      ? "FAWRI_ALLOW_MIGRATION_COMMIT_TEST"
      : "FAWRI_ALLOW_MIGRATION_ROLLBACK_TEST";
    if (process.env[requiredFlag] !== "1") {
      const error = new Error(`${requiredFlag}=1 is required`);
      error.code = "EXPLICIT_WRITE_PERMISSION_REQUIRED";
      throw error;
    }
    const result = runCompleteLockedMigration({ mode, dataDirectory });
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  }
} catch (error) {
  process.stderr.write(
    `${JSON.stringify(
      {
        ok: false,
        code: error?.code || "POSTGRESQL_CUTOVER_FAILED",
        error: String(error?.message || error),
        mode: write ? "write" : commitTest ? "commit_test" : rollbackTest ? "rollback_test" : "dry_run",
        writes_performed: false,
      },
      null,
      2,
    )}\n`,
  );
  process.exitCode = 1;
}
