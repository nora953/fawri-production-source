import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { fileURLToPath } from "node:url";

const testDirectory = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(testDirectory, "../..");
const auditPath = path.join(repositoryRoot, "scripts", "audit-order-operations.mjs");

function makeDirectory() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "fawri-order-audit-"));
}

function writeJson(directory, fileName, value) {
  fs.writeFileSync(
    path.join(directory, fileName),
    `${JSON.stringify(value, null, 2)}\n`,
    "utf8",
  );
}

function baseFixture(directory) {
  writeJson(directory, "merchants.json", {
    merchants: [{ id: "merchant-1", is_admin: false }],
  });
  writeJson(directory, "fawri-runtime-db.json", {
    ordersByMerchant: {
      "merchant-1": [
        {
          id: "order-1",
          merchant_id: "merchant-1",
          status: "pending_confirmation",
          payment_method: "zaincash",
          payment_status: "electronic_pending",
        },
      ],
    },
  });
  writeJson(directory, "order-operations.json", {
    version: 1,
    orders: {
      "merchant-1": {
        "order-1": {
          version: 2,
          status: "confirmed",
          payment_status: "paid",
          payment_verified_at: "2026-08-06T12:00:00.000Z",
          payment_verified_by: "merchant-1",
          updated_at: "2026-08-06T12:00:00.000Z",
        },
      },
    },
  });
}

function runAudit(directory) {
  return spawnSync(process.execPath, [auditPath, directory], {
    cwd: repositoryRoot,
    encoding: "utf8",
  });
}

test("valid order operations pass without exposing customer data", () => {
  const directory = makeDirectory();
  try {
    baseFixture(directory);
    const before = fs.readFileSync(path.join(directory, "order-operations.json"), "utf8");
    const result = runAudit(directory);
    const after = fs.readFileSync(path.join(directory, "order-operations.json"), "utf8");

    assert.equal(result.status, 0, result.stderr || result.stdout);
    assert.equal(after, before, "audit modified order operations");
    const report = JSON.parse(result.stdout);
    assert.equal(report.ok, true);
    assert.deepEqual(report.summary, {
      operations: 1,
      issues: 0,
      severity_counts: {},
    });
    assert.equal(result.stdout.includes("customer"), false);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test("orphan order and tenant mismatch fail the audit", () => {
  const directory = makeDirectory();
  try {
    baseFixture(directory);
    writeJson(directory, "order-operations.json", {
      version: 1,
      orders: {
        "merchant-1": {
          "missing-order": {
            version: 2,
            status: "confirmed",
            payment_status: "paid",
            payment_verified_at: "2026-08-06T12:00:00.000Z",
            payment_verified_by: "merchant-1",
            updated_at: "2026-08-06T12:00:00.000Z",
          },
        },
      },
    });
    const result = runAudit(directory);
    assert.equal(result.status, 2, result.stderr || result.stdout);
    const report = JSON.parse(result.stdout);
    assert.ok(
      report.issues.some(item => item.code === "ORDER_OPERATION_ORDER_MISSING"),
    );
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test("invalid paid and failed metadata are rejected", () => {
  const directory = makeDirectory();
  try {
    baseFixture(directory);
    const filePath = path.join(directory, "order-operations.json");
    const database = JSON.parse(fs.readFileSync(filePath, "utf8"));
    const operation = database.orders["merchant-1"]["order-1"];
    delete operation.payment_verified_at;
    operation.payment_rejection_reason = "contradictory reason";
    writeJson(directory, "order-operations.json", database);

    const result = runAudit(directory);
    assert.equal(result.status, 2, result.stderr || result.stdout);
    const report = JSON.parse(result.stdout);
    assert.ok(
      report.issues.some(
        item => item.code === "ORDER_OPERATION_PAID_METADATA_INVALID",
      ),
    );
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test("cash orders cannot carry electronic payment states", () => {
  const directory = makeDirectory();
  try {
    writeJson(directory, "merchants.json", {
      merchants: [{ id: "merchant-1", is_admin: false }],
    });
    writeJson(directory, "fawri-runtime-db.json", {
      ordersByMerchant: {
        "merchant-1": [
          {
            id: "order-1",
            merchant_id: "merchant-1",
            status: "pending_confirmation",
            payment_method: "cash_on_delivery",
          },
        ],
      },
    });
    writeJson(directory, "order-operations.json", {
      version: 1,
      orders: {
        "merchant-1": {
          "order-1": {
            version: 2,
            status: "pending_confirmation",
            payment_status: "manual_review",
            updated_at: "2026-08-06T12:00:00.000Z",
          },
        },
      },
    });

    const result = runAudit(directory);
    assert.equal(result.status, 2, result.stderr || result.stdout);
    const report = JSON.parse(result.stdout);
    assert.ok(
      report.issues.some(
        item => item.code === "ORDER_OPERATION_PAYMENT_METHOD_MISMATCH",
      ),
    );
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test("malformed order operation JSON fails safely", () => {
  const directory = makeDirectory();
  try {
    writeJson(directory, "merchants.json", { merchants: [] });
    writeJson(directory, "fawri-runtime-db.json", {});
    fs.writeFileSync(
      path.join(directory, "order-operations.json"),
      "{ invalid-json",
      "utf8",
    );
    const result = runAudit(directory);
    assert.equal(result.status, 1);
    const report = JSON.parse(result.stderr);
    assert.equal(report.ok, false);
    assert.match(report.fatal_error, /SyntaxError/);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});
