import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { buildTransitionalMigrationReadiness } from "../lib/transitional-migration-readiness.mjs";

function writeJson(directory, fileName, value) {
  fs.writeFileSync(
    path.join(directory, fileName),
    `${JSON.stringify(value, null, 2)}\n`,
    "utf8",
  );
}

test("nested provider credentials are detected and recursively removed", () => {
  const directory = fs.mkdtempSync(
    path.join(os.tmpdir(), "fawri-secret-redaction-"),
  );
  try {
    writeJson(directory, "merchants.json", {
      merchants: [{ id: "merchant-1", is_admin: false }],
      subscriptions: [],
    });
    writeJson(directory, "fawri-runtime-db.json", {
      metaPagesByPageId: {
        "page-1": {
          page_id: "page-1",
          merchant_id: "merchant-1",
          page_name: "Safe name",
          metadata: {
            nested: {
              access_token: "nested-access-token-secret",
              app_secret: "nested-app-secret",
              password: "nested-password",
              private_key: "nested-private-key",
              harmless: "keep-this-value",
            },
          },
        },
      },
    });

    const { report } = buildTransitionalMigrationReadiness({
      dataDirectory: directory,
    });
    assert.equal(report.ok, true);
    assert.ok(
      report.issues.some(
        (item) => item.code === "META_PAGE_TOKEN_REQUIRES_ENCRYPTED_MIGRATION",
      ),
    );

    const serialized = JSON.stringify(report.target_rows.merchant_channels);
    for (const secret of [
      "nested-access-token-secret",
      "nested-app-secret",
      "nested-password",
      "nested-private-key",
    ]) {
      assert.equal(serialized.includes(secret), false, `${secret} leaked`);
    }
    const legacy = report.target_rows.merchant_channels[0].metadata.legacy;
    assert.equal(legacy.metadata.nested.harmless, "keep-this-value");
    assert.equal(Object.hasOwn(legacy.metadata.nested, "access_token"), false);
    assert.equal(Object.hasOwn(legacy.metadata.nested, "app_secret"), false);
    assert.equal(Object.hasOwn(legacy.metadata.nested, "password"), false);
    assert.equal(Object.hasOwn(legacy.metadata.nested, "private_key"), false);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});
