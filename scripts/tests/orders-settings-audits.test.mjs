import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const repositoryRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);

async function runAudit(script, dataDirectory) {
  const { stdout } = await execFileAsync(
    process.execPath,
    [path.join(repositoryRoot, "scripts", script), dataDirectory],
    { cwd: repositoryRoot },
  );
  return JSON.parse(stdout);
}

test("order and settings audits report migration-ready server state", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "fawri-audit-ready-"));
  const data = path.join(root, "data");
  await mkdir(data, { recursive: true });
  try {
    await writeFile(
      path.join(data, "merchants.json"),
      JSON.stringify({ merchants: [{ id: "merchant-a", is_admin: false }] }),
    );
    await writeFile(
      path.join(data, "fawri-runtime-db.json"),
      JSON.stringify({
        ordersByMerchant: {
          "merchant-a": [
            {
              id: "order-a",
              merchant_id: "merchant-a",
              status: "pending_confirmation",
              payment_method: "zaincash",
              payment_status: "electronic_pending",
            },
          ],
        },
      }),
    );
    await writeFile(
      path.join(data, "order-operations.json"),
      JSON.stringify({ version: 2, orders: {}, payment_decisions: [] }),
    );
    await writeFile(
      path.join(data, "merchant-settings.json"),
      JSON.stringify({
        version: 1,
        settings: {
          "merchant-a": {
            merchant_id: "merchant-a",
            version: 2,
            auto_reply_enabled: false,
            reply_language: "auto",
            delivery: {
              enabled: true,
              fee_iqd: 0,
              free_delivery_threshold_iqd: null,
              estimated_days_min: 1,
              estimated_days_max: 3,
              areas: [],
              notes: "",
            },
            payment: {
              cash_on_delivery_enabled: true,
              electronic_payment_enabled: false,
              methods: ["cash_on_delivery"],
              instructions: "",
            },
            created_at: "2026-08-07T00:00:00.000Z",
            updated_at: "2026-08-07T00:01:00.000Z",
          },
        },
      }),
    );
    await writeFile(
      path.join(data, "background-jobs.json"),
      JSON.stringify({
        version: 1,
        jobs: [
          {
            id: "job-a",
            type: "meta.webhook.reply",
            merchant_id: "merchant-a",
            status: "completed",
            result: {
              delivery_status: "suppressed",
              suppression_code: "MERCHANT_AUTO_REPLY_DISABLED",
              credit_consumed: false,
              settings_version: 2,
            },
          },
        ],
      }),
    );

    const orderReport = await runAudit("audit-order-operations.mjs", data);
    const settingsReport = await runAudit("audit-merchant-settings.mjs", data);
    assert.equal(orderReport.ok, true);
    assert.equal(orderReport.migration_readiness.ready, true);
    assert.equal(settingsReport.ok, true);
    assert.equal(settingsReport.migration_readiness.ready, true);
    assert.equal(settingsReport.summary.auto_reply_jobs_suppressed, 1);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
