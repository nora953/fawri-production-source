import assert from "node:assert/strict";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  enqueueDurableJob,
  listDurableJobs,
} from "../src/services/durableJobQueue";
import { startMetaWebhookWorker } from "../src/services/metaWebhookWorker";

function makeDirectory(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "fawri-settings-worker-"));
}

function writeJson(directory: string, fileName: string, value: unknown): void {
  fs.writeFileSync(
    path.join(directory, fileName),
    `${JSON.stringify(value, null, 2)}\n`,
    "utf8",
  );
}

function writeApprovedMerchant(directory: string): void {
  writeJson(directory, "merchants.json", {
    merchants: [
      {
        id: "merchant-1",
        is_admin: false,
        otp_verified: true,
        status: "approved",
        account_status: "approved",
      },
    ],
  });
}

function withDataDirectory(directory: string): () => void {
  const previous = process.env.FAWRI_DATA_DIR;
  process.env.FAWRI_DATA_DIR = directory;
  return () => {
    if (previous === undefined) delete process.env.FAWRI_DATA_DIR;
    else process.env.FAWRI_DATA_DIR = previous;
  };
}

async function reserveServer(): Promise<{
  port: number;
  requests: number;
  close: () => Promise<void>;
}> {
  let requests = 0;
  const server = http.createServer((_req, res) => {
    requests += 1;
    res.statusCode = 500;
    res.end("should not be called");
  });
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => resolve());
  });
  const address = server.address();
  assert.ok(address && typeof address === "object");
  return {
    port: address.port,
    get requests() {
      return requests;
    },
    close: () =>
      new Promise<void>((resolve, reject) => {
        server.close(error => (error ? reject(error) : resolve()));
      }),
  };
}

function enqueueReplyJob() {
  return enqueueDurableJob({
    type: "meta.webhook.reply",
    dedupeKey: "meta:page-1:message-1",
    merchantId: "merchant-1",
    payload: {
      event_id: "meta:page-1:message-1",
      merchant_id: "merchant-1",
      external_message_id: "message-1",
      webhook_body: {
        object: "page",
        entry: [
          {
            id: "page-1",
            messaging: [
              {
                sender: { id: "customer-1" },
                message: { mid: "message-1", text: "hello" },
              },
            ],
          },
        ],
      },
    },
  }).job;
}

test("disabled auto reply completes queued job without contacting Meta", async () => {
  const directory = makeDirectory();
  const restore = withDataDirectory(directory);
  const server = await reserveServer();
  try {
    writeApprovedMerchant(directory);
    writeJson(directory, "merchant-settings.json", {
      version: 1,
      settings: {
        "merchant-1": {
          merchant_id: "merchant-1",
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
          created_at: "2026-08-06T10:00:00.000Z",
          updated_at: "2026-08-06T11:00:00.000Z",
        },
      },
    });
    const queued = enqueueReplyJob();
    const worker = startMetaWebhookWorker(server.port);
    try {
      assert.equal(await worker.runOnce(), true);
    } finally {
      worker.stop();
    }

    const completed = listDurableJobs("completed");
    assert.equal(completed.length, 1);
    assert.equal(completed[0].id, queued.id);
    assert.deepEqual(completed[0].result, {
      event_id: "meta:page-1:message-1",
      delivery_status: "suppressed",
      suppression_code: "MERCHANT_AUTO_REPLY_DISABLED",
    });
    assert.equal(server.requests, 0);
    assert.equal(
      fs.existsSync(path.join(directory, "reply-reservations.json")),
      false,
      "suppressed job consumed reply entitlement",
    );
  } finally {
    await server.close();
    restore();
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test("unreadable settings keep the job retryable", async () => {
  const directory = makeDirectory();
  const restore = withDataDirectory(directory);
  const server = await reserveServer();
  try {
    writeApprovedMerchant(directory);
    fs.writeFileSync(
      path.join(directory, "merchant-settings.json"),
      "{ invalid-json",
      "utf8",
    );
    const queued = enqueueReplyJob();
    const worker = startMetaWebhookWorker(server.port);
    try {
      assert.equal(await worker.runOnce(), true);
    } finally {
      worker.stop();
    }

    const retry = listDurableJobs("retry");
    assert.equal(retry.length, 1);
    assert.equal(retry[0].id, queued.id);
    assert.equal(retry[0].attempts, 1);
    assert.equal(retry[0].last_error_code, "MERCHANT_SETTINGS_UNAVAILABLE");
    assert.equal(server.requests, 0);
  } finally {
    await server.close();
    restore();
    fs.rmSync(directory, { recursive: true, force: true });
  }
});
