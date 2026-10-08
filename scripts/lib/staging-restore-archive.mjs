import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { canonicalJson, repositoryRoot } from "./postgresql-cross-lane-reconciliation.mjs";

const hash = (value) => createHash("sha256").update(canonicalJson(value)).digest("hex");
const inside = (root, file) => {
  const relative = path.relative(root, file);
  return relative === "" || (!relative.startsWith(`..${path.sep}`) && relative !== ".." && !path.isAbsolute(relative));
};

export function verifyRestoreArchive(archive) {
  const { archive_sha256, ...payload } = archive;
  if (payload.format !== "fawri-staging-history-v1" || !Array.isArray(payload.history) ||
      archive_sha256 !== hash(payload) || payload.history_sha256 !== hash(payload.history)) {
    throw new Error("RESTORE_ARCHIVE_CHECKSUM_MISMATCH");
  }
  return archive_sha256;
}

export function writeRestoreArchive(report, outputPath) {
  if (!report.ok || report.mode !== "additive_staging_restore_dry_run" ||
      report.writes_performed !== false || report.database_connection_used !== false ||
      report.write_readiness?.ok !== false || !Array.isArray(report.restore_history) ||
      report.staging_restore_policy?.history_sha256 !== hash(report.restore_history)) {
    throw new Error("RESTORE_ARCHIVE_REQUIRES_VALID_OFFLINE_PLAN");
  }
  const target = path.resolve(outputPath);
  const source = fs.realpathSync(report.data_dir);
  const repo = fs.realpathSync(repositoryRoot);
  if ([source, repo].some((root) => inside(root, target))) throw new Error("RESTORE_ARCHIVE_MUST_BE_OUTSIDE_SOURCE_AND_REPOSITORY");
  let ancestor = path.dirname(target);
  const missing = [];
  while (!fs.existsSync(ancestor)) {
    missing.unshift(path.basename(ancestor));
    ancestor = path.dirname(ancestor);
  }
  const resolvedTarget = path.join(fs.realpathSync(ancestor), ...missing, path.basename(target));
  if ([source, repo].some((root) => inside(root, resolvedTarget))) throw new Error("RESTORE_ARCHIVE_MUST_BE_OUTSIDE_SOURCE_AND_REPOSITORY");
  // Bind the archive to the source bytes just validated, including absent files.
  for (const descriptor of Object.values(report.source_files)) {
    const file = path.resolve(source, descriptor.file);
    if (!inside(source, file)) throw new Error("RESTORE_ARCHIVE_INVALID_SOURCE_PATH");
    const exists = fs.existsSync(file);
    if (exists !== descriptor.exists || (exists &&
        createHash("sha256").update(fs.readFileSync(file)).digest("hex") !== descriptor.sha256)) {
      throw new Error("RESTORE_ARCHIVE_SOURCE_CHANGED");
    }
  }
  fs.mkdirSync(path.dirname(target), { recursive: true, mode: 0o700 });
  const realTarget = path.join(fs.realpathSync(path.dirname(target)), path.basename(target));
  if ([source, repo].some((root) => inside(root, realTarget))) throw new Error("RESTORE_ARCHIVE_MUST_BE_OUTSIDE_SOURCE_AND_REPOSITORY");
  const payload = {
    format: "fawri-staging-history-v1", tool_version: report.tool_version,
    source_manifest_sha256: report.source_manifest_sha256,
    source_files: report.source_files,
    schema_snapshot_sha256: report.schema_validation.snapshot_sha256,
    restore_plan_sha256: report.restore_plan_sha256,
    history_sha256: report.staging_restore_policy.history_sha256,
    history: report.restore_history,
  };
  const archive = { ...payload, archive_sha256: hash(payload) };
  const fd = fs.openSync(realTarget, "wx", 0o600);
  try {
    fs.writeFileSync(fd, `${JSON.stringify(archive, null, 2)}\n`, "utf8");
    fs.fsyncSync(fd);
  } finally {
    fs.closeSync(fd);
  }
  const checksum = verifyRestoreArchive(JSON.parse(fs.readFileSync(realTarget, "utf8")));
  if (checksum !== archive.archive_sha256) throw new Error("RESTORE_ARCHIVE_READBACK_MISMATCH");
  return { ok: true, archive_path: realTarget, archive_sha256: checksum,
    history_records: payload.history.length, restore_plan_sha256: payload.restore_plan_sha256,
    source_manifest_sha256: payload.source_manifest_sha256, database_connection_used: false, database_writes_performed: false };
}
