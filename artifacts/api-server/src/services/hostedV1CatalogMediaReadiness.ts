import fs from "node:fs";
import path from "node:path";
import { manualCommercialRelease } from "./manualCommercialRelease";
import { productionReleaseGateRequired } from "./productionReleaseReadiness";
import type { ReadinessCheck } from "../observability/types";

/**
 * G3: fail closed if the first-commercial catalog/merchant cleanup files could
 * be written into an ephemeral container directory instead of the explicitly
 * mounted persistent disk. This is only a local mount preflight. A separate
 * hosted restart/redeploy and offsite DB+media restore still must pass.
 */
type MediaMountProbe = {
  readMountInfo: () => string;
  assertReadableWritableDirectory: (dataDir: string) => void;
};

const defaultProbe: MediaMountProbe = {
  readMountInfo: () => fs.readFileSync("/proc/self/mountinfo", "utf8"),
  assertReadableWritableDirectory: (dir) => {
    if (!fs.statSync(dir).isDirectory()) throw new Error("NOT_DIRECTORY");
    fs.accessSync(dir, fs.constants.R_OK | fs.constants.W_OK);
  },
};

const MOUNT_ESCAPE = /\\(040|011|012|134)/g;
function decodeMountPoint(value: string): string {
  const characters: Record<string, string> = {
    "040": " ", "011": "\t", "012": "\n", "134": "\\",
  };
  return value.replace(MOUNT_ESCAPE, (_match, code: string) => characters[code] ?? "");
}

export function mountedWritableFilesystemPresent(mountInfo: string, mountPath: string): boolean {
  for (const line of String(mountInfo || "").split("\n")) {
    const segments = line.split(" - ");
    if (segments.length !== 2) continue;
    const pre = segments[0].trim().split(/\s+/);
    // Linux mountinfo: field 5 = mount point, field 6 = mount options.
    if (pre.length < 6) continue;
    if (decodeMountPoint(pre[4]) === mountPath &&
        pre[5].split(",").includes("rw")) return true;
  }
  return false;
}

function deny(): never {
  throw Object.assign(new Error("hosted catalog media mount unavailable"), {
    code: "V1_HOSTED_CATALOG_MEDIA_MOUNT_NOT_READY",
  });
}

export function assertHostedV1CatalogMediaMount(
  env: NodeJS.ProcessEnv = process.env,
  probe: MediaMountProbe = defaultProbe,
): void {
  if (!productionReleaseGateRequired(env) || !manualCommercialRelease(env)) return;

  const mountRaw = String(env.FAWRI_PERSISTENT_MEDIA_MOUNT_PATH || "").trim();
  const directoryRaw = String(env.FAWRI_DATA_DIR || "").trim();
  if (!path.isAbsolute(mountRaw) || !path.isAbsolute(directoryRaw) ||
      mountRaw.includes("\0") || directoryRaw.includes("\0")) deny();
  const mount = path.resolve(mountRaw);
  const directory = path.resolve(directoryRaw);
  if (mount === "/" || directory === mount || !directory.startsWith(mount + path.sep)) deny();
  if (String(env.FAWRI_CATALOG_MEDIA_STORAGE_PROVIDER || "").toLowerCase() !== "filesystem") deny();
  try {
    if (!mountedWritableFilesystemPresent(probe.readMountInfo(), mount)) deny();
    probe.assertReadableWritableDirectory(directory);
  } catch {
    deny();
  }
}

export function createHostedV1CatalogMediaReadinessCheck(): ReadinessCheck {
  return {
    name: "hosted_catalog_media_mount",
    timeoutMs: 2_000,
    check() {
      assertHostedV1CatalogMediaMount();
    },
  };
}
