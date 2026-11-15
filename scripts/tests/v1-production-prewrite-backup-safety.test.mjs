import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  FIRST_PREWRITE_TARGET,
  validateProductionPrewriteBackupUrl,
  assertProductionPrewriteCatalog,
} from "../lib/v1-production-prewrite-backup-safety.mjs";

const allowed = Object.freeze({
  GITHUB_ACTIONS: "true",
  GITHUB_REPOSITORY: "nora953/fawri-production-source",
  GITHUB_REF: "refs/heads/fix/p0-provider-receipt-order-discovery-20261015",
  GITHUB_EVENT_NAME: "push",
  FAWRI_V1_PREWRITE_EXPORT_ENABLED: "1",
});
function fixture() {
  const value = new URL("postgresql://" + FIRST_PREWRITE_TARGET.endpoint_host +
    "/fawri?sslmode=require");
  value.username = FIRST_PREWRITE_TARGET.owner_login;
  value.password = "synthetic-only-password";
  return value;
}
test("production prewrite export requires explicit Actions opt-in and exact target", () => {
  const url = fixture();
  const actual = validateProductionPrewriteBackupUrl(url.toString(), allowed);
  assert.equal(actual.host, FIRST_PREWRITE_TARGET.endpoint_host);
  assert.equal(actual.database, "fawri");
  assert.equal(actual.user, "fawri_owner");
  assert.equal(actual.password, "synthetic-only-password");
  const neonDirect = fixture();
  neonDirect.searchParams.set("channel_binding", "require");
  assert.equal(validateProductionPrewriteBackupUrl(neonDirect.toString(), allowed).host,
    FIRST_PREWRITE_TARGET.endpoint_host);
  for (const [field, value] of [
    ["GITHUB_ACTIONS", "false"],
    ["GITHUB_REPOSITORY", "another/repo"],
    ["GITHUB_REF", "refs/heads/main"],
    ["GITHUB_EVENT_NAME", "pull_request"],
    ["FAWRI_V1_PREWRITE_EXPORT_ENABLED", "0"],
  ]) {
    assert.throws(() => validateProductionPrewriteBackupUrl(url.toString(),
      { ...allowed, [field]: value }), /V1_PREWRITE_EXPORT_NOT_AUTHORIZED/);
  }
  for (const mutate of [
    u => { u.hostname = "ep-steep-star-b97qa95j.c-7.eu-central-1.aws.neon.tech"; },
    u => { u.hostname = "ep-polished-poetry-b9jpvn4r-pooler.c-7.eu-central-1.aws.neon.tech"; },
    u => { u.username = "fawri_restricted_runtime"; },
    u => { u.pathname = "/neondb"; },
    u => { u.port = "5433"; },
    u => { u.password = ""; },
  ]) {
    const other = fixture();
    mutate(other);
    assert.throws(() => validateProductionPrewriteBackupUrl(other.toString(), allowed));
  }
});
test("prewrite URL refuses TLS downgrade or libpq option overrides", () => {
  for (const params of [
    "", "?sslmode=disable", "?sslmode=require&host=localhost",
    "?sslmode=require&options=-csearch_path%3Dpublic",
    "?sslmode=require&sslmode=require", "?channel_binding=require",
    "?sslmode=require&channel_binding=disable",
    "?sslmode=require&channel_binding=prefer",
    "?sslmode=require&channel_binding=require&channel_binding=require",
  ]) {
    const u = fixture();
    u.search = params;
    assert.throws(() => validateProductionPrewriteBackupUrl(u.toString(), allowed),
      /V1_PREWRITE_EXPORT_TLS_OPTIONS_DENIED/);
  }
});
test("only a real, completely empty PG18 production preimage passes", () => {
  const pre = {
    db: "fawri", actor: "fawri_owner", major: 18,
    runtime_roles: 0, public_relations: 0, migration_relations: 0,
  };
  assert.equal(assertProductionPrewriteCatalog(pre), true);
  for (const [key, value] of [
    ["db", "staging"], ["actor", "fawri_restricted_runtime"], ["major", 17],
    ["runtime_roles", 1], ["public_relations", 1], ["migration_relations", 1],
  ]) {
    assert.throws(() => assertProductionPrewriteCatalog({ ...pre, [key]: value }),
      /V1_PREWRITE_EXPORT_NOT_EMPTY_SAFE_PREIMAGE/);
  }
  assert.throws(() => assertProductionPrewriteCatalog(null));
});

test("encrypted production export needs exact owner push and never runs on PR", () => {
  const source = readFileSync(new URL(
    "../../.github/workflows/v1-production-prewrite-encrypted-backup.yml",
    import.meta.url), "utf8");
  assert.match(source, /github\.event_name == 'push'/);
  assert.match(source, /github\.actor == 'nora953'/);
  assert.match(source, /github\.event\.head_commit\.message == 'FAWRI_V1_OWNER_AUTHORIZED_EMPTY_PREWRITE_EXPORT'/);
  assert.match(source, /vars\.FAWRI_V1_PREWRITE_EXPORT_ENABLED == '1'/);
  assert.match(source, /github\.ref == 'refs\/heads\/fix\/p0-provider-receipt-order-discovery-20261015'/);
});
