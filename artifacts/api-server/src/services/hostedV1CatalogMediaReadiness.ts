import crypto from "node:crypto";
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
  assertReadableWritableDirectory: (dataDir: string, mountPath: string) => void;
  realPath?: (file: string) => string;
};

/**
 * The mount itself is inspected before creating a missing child. Never use a
 * recursive mkdir: it follows an existing symlink to an ephemeral or foreign
 * path before the caller's final canonical-path check can reject that path.
 */
export function ensureSafeMountedMediaDataDirectory(dir: string, mount: string): void {
  const mountStat = fs.lstatSync(mount);
  if (!mountStat.isDirectory() || mountStat.isSymbolicLink() ||
      fs.realpathSync(mount) !== mount) throw new Error("MEDIA_MOUNT_ALIAS");

  const relative = path.relative(mount, dir);
  if (!relative || relative === ".." || relative.startsWith(".." + path.sep) ||
      path.isAbsolute(relative)) throw new Error("MEDIA_DIR_OUTSIDE_MOUNT");

  let current = mount;
  for (const part of relative.split(path.sep)) {
    if (!part || part === "." || part === "..") throw new Error("MEDIA_DIR_INVALID");
    current = path.join(current, part);
    try {
      const entry = fs.lstatSync(current);
      if (!entry.isDirectory() || entry.isSymbolicLink()) throw new Error("MEDIA_DIR_ALIAS");
    } catch (error) {
      if ((error as NodeJS.ErrnoException)?.code !== "ENOENT") throw error;
      try {
        fs.mkdirSync(current, { mode: 0o700 });
      } catch (mkdirError) {
        // Concurrent first startup may create the same child. Reinspect it
        // rather than trusting a successful or failed mkdir.
        if ((mkdirError as NodeJS.ErrnoException)?.code !== "EEXIST") throw mkdirError;
      }
      const created = fs.lstatSync(current);
      if (!created.isDirectory() || created.isSymbolicLink()) throw new Error("MEDIA_DIR_ALIAS");
    }
  }
  if (fs.realpathSync(dir) !== dir) throw new Error("MEDIA_DIR_REDIRECT");
  fs.accessSync(dir, fs.constants.R_OK | fs.constants.W_OK);
}

const defaultProbe: MediaMountProbe = {
  readMountInfo: () => fs.readFileSync("/proc/self/mountinfo", "utf8"),
  realPath: (file) => fs.realpathSync(file),
  assertReadableWritableDirectory: ensureSafeMountedMediaDataDirectory,
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
    // An explicitly mounted overlay or memory-only filesystem is not
    // persistent catalog storage even if it advertises read/write access.
    const fsType = segments[1].trim().split(/\s+/)[0];
    const volatileTypes = new Set([
      "overlay", "tmpfs", "ramfs", "devtmpfs", "squashfs", "proc",
      "sysfs", "devpts", "cgroup", "cgroup2", "autofs",
    ]);
    if (decodeMountPoint(pre[4]) === mountPath &&
        pre[5].split(",").includes("rw") &&
        fsType && !volatileTypes.has(fsType)) return true;
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
    probe.assertReadableWritableDirectory(directory, mount);
    // A symlink can redirect the /var/data/fawri path to the ephemeral
    // overlay (or some other tenant's directory). Resolve both after making
    // the child; refuse any path outside the physical persistent mount.
    const canonicalMount = (probe.realPath ?? defaultProbe.realPath!)(mount);
    const canonicalData = (probe.realPath ?? defaultProbe.realPath!)(directory);
    if (canonicalMount !== mount || canonicalData !== directory ||
        !canonicalData.startsWith(canonicalMount + path.sep)) deny();
  } catch {
    deny();
  }
}

/**
 * G3 startup-only writable-disk proof. lstat/access and mountinfo alone do
 * not prove that actual writes, fsync and reads work. This probe creates its
 * own unpredictable temporary file under the already admitted data directory,
 * verifies the exact bytes and removes only that file. It never reads or
 * changes catalog images, customer records or the cleanup journal.
 *
 * Do not invoke this from the periodic /readyz endpoint: write at startup
 * only, not on each Render health probe.
 */
export function assertCatalogMediaIoRoundTrip(directory: string): void {
  // Caller validates the mounted, symlink-free directory before invocation.
  // This lower-level helper is also exercised against a disposable directory.
  const probePath = path.join(directory,
    `.fawri-g3-media-probe-${process.pid}-${crypto.randomUUID()}`);
  const proof = crypto.randomBytes(32);
  let fileDescriptor: number | undefined;
  let created = false;
  try {
    // Open with exclusive creation and 0600 permissions: never replace a
    // pre-existing file or a symlink, including on unexpected probe collision.
    fileDescriptor = fs.openSync(probePath, "wx", 0o600);
    created = true;
    const written = fs.writeSync(fileDescriptor, proof);
    if (written !== proof.length) throw new Error("MEDIA_PROBE_SHORT_WRITE");
    fs.fsyncSync(fileDescriptor);
    fs.closeSync(fileDescriptor);
    fileDescriptor = undefined;
    const readBack = fs.readFileSync(probePath);
    if (readBack.length !== proof.length ||
        !crypto.timingSafeEqual(proof, readBack)) throw new Error("MEDIA_PROBE_MISMATCH");
    fs.rmSync(probePath);
    created = false;
  } catch {
    throw Object.assign(new Error("hosted catalog media disk I/O unavailable"), {
      code: "V1_HOSTED_CATALOG_MEDIA_IO_NOT_READY",
    });
  } finally {
    if (fileDescriptor !== undefined) {
      try { fs.closeSync(fileDescriptor); } catch { /* admission already failed */ }
    }
    if (created) {
      try { fs.rmSync(probePath, { force: true }); } catch { /* no unrelated path is removed */ }
    }
    proof.fill(0);
  }
}

export function assertHostedV1CatalogMediaIoReady(
  env: NodeJS.ProcessEnv = process.env,
): void {
  if (!productionReleaseGateRequired(env) || !manualCommercialRelease(env)) return;
  // No temporary write is allowed before the persistent mount, path segments
  // and canonical filesystem identity have passed admission.
  assertHostedV1CatalogMediaMount(env);
  assertCatalogMediaIoRoundTrip(path.resolve(String(env.FAWRI_DATA_DIR || "").trim()));
}


/**
 * G3 synthetic disk canary: seed it once on the admitted durable disk; on the
 * following process start verify that the exact bytes survived. Never use a
 * real merchant image, DB row, user token or an API route for this probe.
 *
 * "seeded" is NOT persistence acceptance: operators must observe "verified"
 * on a later hosted restart/redeploy and still test real merchant images.
 * A corrupt pre-existing canary fails closed instead of being silently reset.
 */
export type CatalogMediaCanaryStatus = "seeded" | "verified";
const G3_CANARY_FILE = ".fawri-g3-media-persistence-canary-v1.json";

function canaryNotReady(): never {
  throw Object.assign(new Error("hosted media persistence canary invalid"), {
    code: "V1_HOSTED_CATALOG_MEDIA_CANARY_NOT_READY",
  });
}

export function assertCatalogMediaCanaryAcrossStarts(
  directory: string,
  requireExisting = false,
): CatalogMediaCanaryStatus {
  const filename = path.join(directory, G3_CANARY_FILE);

  function verify(): void {
    const entry = fs.lstatSync(filename);
    if (!entry.isFile() || entry.isSymbolicLink() || entry.size > 512 ||
        entry.size < 100 || (entry.mode & 0o077) !== 0) canaryNotReady();
    // Prevent symlink following even if the file were replaced between lstat
    // and open. Never read arbitrary files outside the mounted media root.
    const fd = fs.openSync(filename,
      fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW);
    let raw: string;
    try {
      if (!fs.fstatSync(fd).isFile()) canaryNotReady();
      raw = fs.readFileSync(fd, "utf8");
    } finally {
      fs.closeSync(fd);
    }
    const value = JSON.parse(raw) as Record<string, unknown>;
    if (value.version !== 1 || typeof value.nonce !== "string" ||
        !/^[a-f0-9]{64}$/.test(value.nonce) ||
        typeof value.digest !== "string" ||
        !/^[a-f0-9]{64}$/.test(value.digest)) canaryNotReady();
    const expected = crypto.createHash("sha256")
      .update("fawri-g3-persistence-v1:" + value.nonce).digest("hex");
    if (!crypto.timingSafeEqual(Buffer.from(expected, "hex"),
      Buffer.from(value.digest, "hex"))) canaryNotReady();
  }

  try {
    const existing = fs.lstatSync(filename, { throwIfNoEntry: false });
    if (existing) {
      verify();
      return "verified";
    }
    // On a later approved hosted redeploy, require the exact prior marker.
    // Never treat a newly initialized/lost volume as persistence evidence.
    if (requireExisting) canaryNotReady();
    const nonce = crypto.randomBytes(32).toString("hex");
    const digest = crypto.createHash("sha256")
      .update("fawri-g3-persistence-v1:" + nonce).digest("hex");
    const proof = Buffer.from(JSON.stringify({ version: 1, nonce, digest }) + "\n");
    let fd: number | undefined;
    let created = false;
    try {
      fd = fs.openSync(filename, "wx", 0o600);
      created = true;
      if (fs.writeSync(fd, proof) !== proof.length) canaryNotReady();
      fs.fsyncSync(fd);
      fs.closeSync(fd);
      fd = undefined;
      verify();
      return "seeded";
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "EEXIST" && !created) {
        // Two instances booting concurrently may race on first seeding.
        verify();
        return "verified";
      }
      if (created) fs.rmSync(filename, { force: true });
      throw error;
    } finally {
      if (fd !== undefined) fs.closeSync(fd);
      proof.fill(0);
    }
  } catch {
    canaryNotReady();
  }
}

/** Runs only after the mounted-disk and exclusive fsync/read startup guards. */
export function assertHostedV1CatalogMediaCanary(
  env: NodeJS.ProcessEnv = process.env,
): CatalogMediaCanaryStatus | "skipped" {
  if (!productionReleaseGateRequired(env) || !manualCommercialRelease(env)) {
    return "skipped";
  }
  assertHostedV1CatalogMediaMount(env);
  return assertCatalogMediaCanaryAcrossStarts(
    path.resolve(String(env.FAWRI_DATA_DIR || "").trim()),
    env.FAWRI_G3_REQUIRE_EXISTING_CANARY === "1",
  );
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
