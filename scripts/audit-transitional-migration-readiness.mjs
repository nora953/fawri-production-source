import path from "node:path";
import { buildTransitionalMigrationReadiness } from "./lib/transitional-migration-readiness.mjs";

const dataDirectory = path.resolve(
  process.argv[2] ||
    process.env.FAWRI_DATA_DIR ||
    path.join("artifacts", "api-server", "data"),
);

try {
  const { report } = buildTransitionalMigrationReadiness({ dataDirectory });
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
        fatal_error: String(error),
      },
      null,
      2,
    )}\n`,
  );
  process.exitCode = 1;
}
