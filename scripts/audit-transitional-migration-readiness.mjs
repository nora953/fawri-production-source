import path from "node:path";
import { buildTransitionalMigrationReadiness } from "./lib/transitional-migration-readiness.mjs";

const dataArgument = process.argv.find(
  (value, index) => index > 1 && !value.startsWith("--"),
);
const dataDirectory = path.resolve(
  dataArgument ||
    process.env.FAWRI_DATA_DIR ||
    path.join("artifacts", "api-server", "data"),
);
const includeRows =
  process.argv.includes("--include-rows") ||
  process.env.FAWRI_INCLUDE_MIGRATION_ROWS === "1";

try {
  const { report } = buildTransitionalMigrationReadiness({ dataDirectory });
  report.rows_included = includeRows;
  if (!includeRows) {
    delete report.rows;
    delete report.target_rows;
  }
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  process.exitCode = report.ok ? 0 : 2;
} catch (error) {
  process.stderr.write(
    `${JSON.stringify(
      {
        ok: false,
        mode: "read_only_migration_preflight",
        generated_at: new Date().toISOString(),
        data_dir: dataDirectory,
        rows_included: false,
        fatal_error: String(error),
      },
      null,
      2,
    )}\n`,
  );
  process.exitCode = 1;
}
