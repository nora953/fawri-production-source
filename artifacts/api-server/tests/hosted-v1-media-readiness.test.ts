import assert from "node:assert/strict";
import test from "node:test";
import {
  assertHostedV1CatalogMediaMount,
  createHostedV1CatalogMediaReadinessCheck,
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
  assert.equal(mountedWritableFilesystemPresent(good, "/"), true);
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
    assertReadableWritableDirectory() { throw new Error("EACCES"); },
  }), { code: "V1_HOSTED_CATALOG_MEDIA_MOUNT_NOT_READY" });
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
