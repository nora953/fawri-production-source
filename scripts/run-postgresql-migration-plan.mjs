import path from "node:path";
import { buildValidatedMigrationPlan } from "./lib/postgresql-migration-plan.mjs";

const dataDirectory = path.resolve(
  process.argv[2] ||
    process.env.FAWRI_DATA_DIR ||
    path.join("artifacts", "api-server", "data"),
);

try {
  const { report } = buildValidatedMigrationPlan({ dataDirectory });
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  process.exitCode = report.ok ? 0 : 2;
} catch (error) {
  process.stderr.write(
    `${JSON.stringify(
      {
        ok: false,
        mode: "dry_run",
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
