import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { fileURLToPath } from "node:url";

const testDirectory = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(testDirectory, "../..");
const auditPath = path.join(repositoryRoot, "scripts", "audit-merchant-settings.mjs");

function makeDirectory() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "fawri-settings-audit-"));
}

function writeJson(directory, fileName, value) {
  fs.writeFileSync(
    path.join(directory, fileName),
    `${JSON.stringify(value, null, 2)}\n`,
    "utf8",
  );
}

function validFixture(directory) {
  writeJson(directory, "merchants.json", {
    merchants: [{ id: "merchant-1", is_admin: false }],
  });
  writeJson(directory, "merchant-settings.json", {
    version: 1,
    settings: {
      "merchant-1": {
        merchant_id: "merchant-1",
        version: 2,
        auto_reply_enabled: true,
        reply_language: "auto",
        delivery: {
          enabled: true,
          fee_iqd: 5000,
          free_delivery_threshold_iqd: 50000,
          estimated_days_min: 1,
          estimated_days_max: 3,
          areas: ["Baghdad", "Erbil"],
          notes: "Delivery note",
        },
        payment: {
          cash_on_delivery_enabled: true,
          electronic_payment_enabled: true,
          methods: ["cash_on_delivery", "zaincash"],
          instructions: "Payment instructions",
        },
        created_at: "2026-08-06T10:00:00.000Z",
        updated_at: "2026-08-06T11:00:00.000Z",
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

test("valid merchant settings pass without revealing instructions", () => {
  const directory = makeDirectory();
  try {
    validFixture(directory);
    const before = fs.readFileSync(path.join(directory, "merchant-settings.json"), "utf8");
    const result = runAudit(directory);
    const after = fs.readFileSync(path.join(directory, "merchant-settings.json"), "utf8");

    assert.equal(result.status, 0, result.stderr || result.stdout);
    assert.equal(after, before, "audit modified merchant settings");
    const report = JSON.parse(result.stdout);
    assert.equal(report.ok, true);
    assert.deepEqual(report.summary, {
      settings: 1,
      issues: 0,
      severity_counts: {},
    });
    assert.equal(result.stdout.includes("Payment instructions"), false);
    assert.equal(result.stdout.includes("Delivery note"), false);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test("orphan merchant and record identity mismatch fail", () => {
  const directory = makeDirectory();
  try {
    validFixture(directory);
    const filePath = path.join(directory, "merchant-settings.json");
    const database = JSON.parse(fs.readFileSync(filePath, "utf8"));
    database.settings["missing-merchant"] = {
      ...database.settings["merchant-1"],
      merchant_id: "different-merchant",
    };
    delete database.settings["merchant-1"];
    writeJson(directory, "merchant-settings.json", database);

    const result = runAudit(directory);
    assert.equal(result.status, 2, result.stderr || result.stdout);
    const report = JSON.parse(result.stdout);
    assert.ok(
      report.issues.some(item => item.code === "MERCHANT_SETTINGS_MERCHANT_MISSING"),
    );
    assert.ok(
      report.issues.some(item => item.code === "MERCHANT_SETTINGS_ID_MISMATCH"),
    );
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test("delivery range and duplicate areas fail", () => {
  const directory = makeDirectory();
  try {
    validFixture(directory);
    const filePath = path.join(directory, "merchant-settings.json");
    const database = JSON.parse(fs.readFileSync(filePath, "utf8"));
    const settings = database.settings["merchant-1"];
    settings.delivery.estimated_days_min = 7;
    settings.delivery.estimated_days_max = 2;
    settings.delivery.areas = ["Baghdad", "Baghdad"];
    writeJson(directory, "merchant-settings.json", database);

    const result = runAudit(directory);
    assert.equal(result.status, 2, result.stderr || result.stdout);
    const report = JSON.parse(result.stdout);
    assert.ok(
      report.issues.some(item => item.code === "MERCHANT_SETTINGS_DELIVERY_INVALID"),
    );
    assert.ok(
      report.issues.some(
        item => item.code === "MERCHANT_SETTINGS_DELIVERY_CONTENT_INVALID",
      ),
    );
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test("payment flags and methods must agree", () => {
  const directory = makeDirectory();
  try {
    validFixture(directory);
    const filePath = path.join(directory, "merchant-settings.json");
    const database = JSON.parse(fs.readFileSync(filePath, "utf8"));
    const payment = database.settings["merchant-1"].payment;
    payment.cash_on_delivery_enabled = false;
    payment.electronic_payment_enabled = false;
    payment.methods = ["cash_on_delivery", "invalid"];
    writeJson(directory, "merchant-settings.json", database);

    const result = runAudit(directory);
    assert.equal(result.status, 2, result.stderr || result.stdout);
    const report = JSON.parse(result.stdout);
    assert.ok(
      report.issues.some(item => item.code === "MERCHANT_SETTINGS_PAYMENT_UNAVAILABLE"),
    );
    assert.ok(
      report.issues.some(item => item.code === "MERCHANT_SETTINGS_PAYMENT_METHOD_INVALID"),
    );
    assert.ok(
      report.issues.some(item => item.code === "MERCHANT_SETTINGS_CASH_METHOD_MISMATCH"),
    );
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test("malformed merchant settings JSON fails safely", () => {
  const directory = makeDirectory();
  try {
    writeJson(directory, "merchants.json", { merchants: [] });
    fs.writeFileSync(
      path.join(directory, "merchant-settings.json"),
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
