import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  assertHostedV1CatalogMediaMount,
  assertHostedV1CatalogMediaIoReady,
  assertCatalogMediaIoRoundTrip,
  assertCatalogMediaCanaryAcrossStarts,
  assertHostedV1CatalogMediaCanary,
  createHostedV1CatalogMediaReadinessCheck,
  ensureSafeMountedMediaDataDirectory,
  mountedWritableFilesystemPresent,
} from "../src/services/hostedV1CatalogMediaReadiness";

const MOUNT = "/var/data";
const DATA_DIR = "/var/data/fawri";
const good = [
  "52 34 0:61 / / rw,relatime - overlay overlay rw",
  "65 52 8:17 / /var/data rw,relatime - ext4 /dev/disk rw",
].join("\n");

const base = {
  NODE_ENV: "production",
  FAWRI_DEPLOYMENT_MODE: "production",
  FAWRI_V1_MANUAL_COMMERCE: "1",
  FAWRI_CATALOG_MEDIA_STORAGE_PROVIDER: "filesystem",
  FAWRI_PERSISTENT_MEDIA_MOUNT_PATH: MOUNT,
  FAWRI_DATA_DIR: DATA_DIR,
} as NodeJS.ProcessEnv;

function probe(mountInfo: string, dirSeen?: (dir: string) => void) {
  return {
    readMountInfo: () => mountInfo,
    realPath: (location: string) => location,
    assertReadableWritableDirectory(dir: string) {
      assert.equal(dir, DATA_DIR);
      dirSeen?.(dir);
    },
  };
}
function rejects(env: NodeJS.ProcessEnv, mounts: string) {
  assert.throws(
    () => assertHostedV1CatalogMediaMount(env, probe(mounts)),
    { code: "V1_HOSTED_CATALOG_MEDIA_MOUNT_NOT_READY" },
  );
}

test("V1 hosted media readiness admits only exact writable persistent disk", () => {
  let seen = 0;
  assert.doesNotThrow(() => assertHostedV1CatalogMediaMount(
    base, probe(good, () => { seen++; }),
  ));
  assert.equal(seen, 1);
  assert.equal(mountedWritableFilesystemPresent(good, MOUNT), true);
  // Container root is overlay and must NOT be accepted as durable storage.
  assert.equal(mountedWritableFilesystemPresent(good, "/"), false);
  assert.equal(mountedWritableFilesystemPresent(good, "/var/data/fawri"), false);
  assert.equal(createHostedV1CatalogMediaReadinessCheck().name, "hosted_catalog_media_mount");
});

test("ephemeral container path and missing mount are never accepted", () => {
  rejects(base, "52 34 0:61 / / rw,relatime - overlay overlay rw");
  rejects(base, "65 52 8:17 / /somewhere rw,relatime - ext4 /dev/disk rw");
  rejects(base, "65 52 8:17 / /var/data ro,relatime - ext4 /dev/disk ro");
  rejects({ ...base, FAWRI_PERSISTENT_MEDIA_MOUNT_PATH: undefined }, good);
  rejects({ ...base, FAWRI_DATA_DIR: "/tmp/fawri" }, good);
  rejects({ ...base, FAWRI_DATA_DIR: "/var/data" }, good);
  rejects({ ...base, FAWRI_DATA_DIR: "/var/database-escape" }, good);
  rejects({ ...base, FAWRI_DATA_DIR: "/app/artifacts/fawri/data" }, good);
  rejects({ ...base, FAWRI_PERSISTENT_MEDIA_MOUNT_PATH: "/" }, good);
  rejects({ ...base, FAWRI_CATALOG_MEDIA_STORAGE_PROVIDER: "missing" }, good);
});

test("reported mount is insufficient if the directory is not accessible", () => {
  assert.throws(() => assertHostedV1CatalogMediaMount(base, {
    readMountInfo: () => good,
    realPath: (location: string) => location,
    assertReadableWritableDirectory() { throw new Error("EACCES"); },
  }), { code: "V1_HOSTED_CATALOG_MEDIA_MOUNT_NOT_READY" });
});

test("ephemeral mount types and symlink redirects are rejected", () => {
  for (const fsType of ["overlay", "tmpfs", "ramfs", "squashfs"]) {
    rejects(base, "65 52 8:17 / /var/data rw,relatime - " +
      fsType + " /dev/disk rw");
  }
  assert.throws(() => assertHostedV1CatalogMediaMount(base, {
    readMountInfo: () => good,
    assertReadableWritableDirectory() {},
    realPath(location: string) {
      return location === DATA_DIR ? "/tmp/redirected" : location;
    },
  }), { code: "V1_HOSTED_CATALOG_MEDIA_MOUNT_NOT_READY" });
  assert.throws(() => assertHostedV1CatalogMediaMount(base, {
    readMountInfo: () => good,
    assertReadableWritableDirectory() {},
    realPath(location: string) {
      return location === MOUNT ? "/other/volume" : location;
    },
  }), { code: "V1_HOSTED_CATALOG_MEDIA_MOUNT_NOT_READY" });
});

test("first-start directory creation never follows existing symlinks outside mounted disk", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "fawri-g3-mount-"));
  const mount = path.join(root, "mount");
  const outside = path.join(root, "outside");
  try {
    fs.mkdirSync(mount);
    fs.mkdirSync(outside);
    const child = path.join(mount, "new", "media");
    assert.doesNotThrow(() => ensureSafeMountedMediaDataDirectory(child, mount));
    assert.ok(fs.statSync(child).isDirectory());
    assert.equal(fs.statSync(child).mode & 0o777, 0o700);

    const alias = path.join(mount, "alias");
    fs.symlinkSync(outside, alias, "dir");
    assert.throws(
      () => ensureSafeMountedMediaDataDirectory(path.join(alias, "must-not-exist"), mount),
      /MEDIA_DIR_ALIAS/,
    );
    assert.equal(fs.existsSync(path.join(outside, "must-not-exist")), false);

    const aliasMount = path.join(root, "alias-mount");
    fs.symlinkSync(mount, aliasMount, "dir");
    assert.throws(
      () => ensureSafeMountedMediaDataDirectory(path.join(aliasMount, "other"), aliasMount),
      /MEDIA_MOUNT_ALIAS/,
    );
    assert.equal(fs.existsSync(path.join(mount, "other")), false);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("startup disk I/O probe writes, fsyncs, reads and cleans only its temporary file", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "fawri-g3-io-"));
  try {
    const marker = path.join(root, "merchant-existing.jpg");
    fs.writeFileSync(marker, "preserved-merchant-image", { mode: 0o600 });
    const before = fs.readdirSync(root);
    assert.doesNotThrow(() => assertCatalogMediaIoRoundTrip(root));
    assert.deepEqual(fs.readdirSync(root), before);
    assert.equal(fs.readFileSync(marker, "utf8"), "preserved-merchant-image");
    // Existing files cannot accidentally be overwritten by probe creation.
    assert.equal(fs.statSync(marker).isFile(), true);
    assert.throws(
      () => assertCatalogMediaIoRoundTrip(path.join(root, "missing")),
      { code: "V1_HOSTED_CATALOG_MEDIA_IO_NOT_READY" },
    );
    assert.deepEqual(fs.readdirSync(root), before);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("I/O proof cannot bypass production mount admission", () => {
  assert.throws(() => assertHostedV1CatalogMediaIoReady({
    ...base, FAWRI_DATA_DIR: "/tmp/ephemeral",
  }), { code: "V1_HOSTED_CATALOG_MEDIA_MOUNT_NOT_READY" });
  // Staging/test never perform a mounted Render disk write probe.
  assert.doesNotThrow(() => assertHostedV1CatalogMediaIoReady({
    ...base, NODE_ENV: "test", FAWRI_DEPLOYMENT_MODE: "staging",
    FAWRI_DATA_DIR: "/nonexistent/missing/directory",
  }));
});

test("non-commercial/test runtimes are not made dependent on Render mountinfo", () => {
  const unavailable = {
    readMountInfo(): string { throw new Error("MOUNTINFO_NOT_AVAILABLE"); },
    assertReadableWritableDirectory(): void { throw new Error("NO_DIRECTORY"); },
  };
  assert.doesNotThrow(() => assertHostedV1CatalogMediaMount({
    ...base, FAWRI_DEPLOYMENT_MODE: "staging",
  }, unavailable));
  assert.doesNotThrow(() => assertHostedV1CatalogMediaMount({
    ...base, FAWRI_V1_MANUAL_COMMERCE: "0", NODE_ENV: "development",
    FAWRI_DEPLOYMENT_MODE: "development",
  }, unavailable));
});


test("G3 synthetic canary seeds once and verifies identical durable bytes on next startup", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "fawri-g3-persist-"));
  const sentinel = path.join(root, "real-merchant-image-must-not-change.jpg");
  const canary = path.join(root, ".fawri-g3-media-persistence-canary-v1.json");
  try {
    fs.writeFileSync(sentinel, "untouched-existing-image");
    assert.throws(() => assertCatalogMediaCanaryAcrossStarts(root, true), {
      code: "V1_HOSTED_CATALOG_MEDIA_CANARY_NOT_READY",
    });
    assert.equal(fs.existsSync(canary), false,
      "strict acceptance must never create a replacement missing marker");
    assert.equal(assertCatalogMediaCanaryAcrossStarts(root), "seeded");
    const original = fs.readFileSync(canary);
    const stat = fs.statSync(canary);
    assert.equal(stat.mode & 0o777, 0o600);
    assert.equal(assertCatalogMediaCanaryAcrossStarts(root), "verified");
    assert.equal(assertCatalogMediaCanaryAcrossStarts(root, true), "verified",
      "strict second-boot gate must accept only an already persisted marker");
    assert.deepEqual(fs.readFileSync(canary), original);
    assert.equal(fs.readFileSync(sentinel, "utf8"), "untouched-existing-image");
    assert.deepEqual(fs.readdirSync(root).sort(), [
      ".fawri-g3-media-persistence-canary-v1.json",
      "real-merchant-image-must-not-change.jpg",
    ].sort());
    // Simulate losing/corrupting the persisted marker. Never silently repair
    // or overwrite it: this must block release until operator investigation.
    fs.writeFileSync(canary, JSON.stringify({ version: 1, nonce: "a".repeat(64),
      digest: "b".repeat(64) }) + "\n", { mode: 0o600 });
    assert.throws(() => assertCatalogMediaCanaryAcrossStarts(root), {
      code: "V1_HOSTED_CATALOG_MEDIA_CANARY_NOT_READY",
    });
    assert.equal(fs.readFileSync(sentinel, "utf8"), "untouched-existing-image");
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("G3 synthetic canary rejects symlinks and untrusted private modes", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "fawri-g3-persist-alias-"));
  const outside = path.join(root, "outside");
  const dir = path.join(root, "dir");
  const marker = path.join(dir, ".fawri-g3-media-persistence-canary-v1.json");
  try {
    fs.mkdirSync(dir);
    fs.writeFileSync(outside, "private-outside-data");
    fs.symlinkSync(outside, marker);
    assert.throws(() => assertCatalogMediaCanaryAcrossStarts(dir), {
      code: "V1_HOSTED_CATALOG_MEDIA_CANARY_NOT_READY",
    });
    assert.equal(fs.readFileSync(outside, "utf8"), "private-outside-data");
    fs.rmSync(marker);
    assert.equal(assertCatalogMediaCanaryAcrossStarts(dir), "seeded");
    fs.chmodSync(marker, 0o644);
    assert.throws(() => assertCatalogMediaCanaryAcrossStarts(dir), {
      code: "V1_HOSTED_CATALOG_MEDIA_CANARY_NOT_READY",
    });
    assert.equal(assertHostedV1CatalogMediaCanary({
      ...base, FAWRI_DEPLOYMENT_MODE: "staging", NODE_ENV: "test",
      FAWRI_DATA_DIR: "/does-not-exist",
    }), "skipped", "staging must not write a persistent canary");
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("G3 canary fails closed when an existing marker is truncated or malformed", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "fawri-g3-persist-malformed-"));
  const marker = path.join(root, ".fawri-g3-media-persistence-canary-v1.json");
  try {
    for (const value of ["", "{}", "x".repeat(520), "{not json"]) {
      fs.writeFileSync(marker, value, { mode: 0o600 });
      assert.throws(() => assertCatalogMediaCanaryAcrossStarts(root), {
        code: "V1_HOSTED_CATALOG_MEDIA_CANARY_NOT_READY",
      });
      assert.equal(fs.readFileSync(marker, "utf8"), value,
        "existing marker must be preserved for forensics");
    }
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
