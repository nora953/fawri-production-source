import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import type { DurableJob } from "../src/services/durableJobQueue";
import { processMetaReplyJob } from "../src/services/metaWebhookWorkerCore";

function job(externalMessageId: string): DurableJob {
  return {
    id: `job-${externalMessageId}`,
    type: "meta.webhook.reply",
    dedupe_key: `meta:page-1:${externalMessageId}`,
    merchant_id: "merchant-1",
    payload: {
      event_id: `meta:page-1:${externalMessageId}`,
      merchant_id: "merchant-1",
      external_message_id: externalMessageId,
      webhook_body: {
        object: "page",
        entry: [
          {
            id: "page-1",
            messaging: [
              {
                sender: { id: "customer-1" },
                message: { mid: externalMessageId, text: "hello" },
              },
            ],
          },
        ],
      },
    },
    priority: 10,
    status: "processing",
    attempts: 1,
    max_attempts: 5,
    available_at: "2026-08-06T12:00:00.000Z",
    locked_at: "2026-08-06T12:00:00.000Z",
    locked_by: "test-worker",
    created_at: "2026-08-06T12:00:00.000Z",
    updated_at: "2026-08-06T12:00:00.000Z",
  };
}

async function startReplayServer(
  handler: (request: http.IncomingMessage) => Promise<void> | void,
) {
  const server = http.createServer(async (request, response) => {
    try {
      await handler(request);
      response.writeHead(200, { "Content-Type": "application/json" });
      response.end(JSON.stringify({ ok: true }));
    } catch (error) {
      response.writeHead(500, { "Content-Type": "application/json" });
      response.end(JSON.stringify({ ok: false, error: String(error) }));
    }
  });
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  assert.ok(address && typeof address === "object");
  return {
    url: `http://127.0.0.1:${address.port}/api/meta/webhook`,
    async close() {
      await new Promise<void>((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
      });
    },
  };
}

async function writeRuntime(
  dataDirectory: string,
  externalMessageId: string,
  status?: "sent" | "failed",
) {
  const conversations = status
    ? [
        {
          id: `conversation-${externalMessageId}`,
          messages: [
            {
              id: `customer-${externalMessageId}`,
              sender: "customer",
              text: "hello",
              external_message_id: externalMessageId,
              timestamp: "2026-08-06T12:00:00.000Z",
            },
            {
              id: `reply-${externalMessageId}`,
              sender: "fawri",
              text: "reply",
              status,
              timestamp: "2026-08-06T12:00:01.000Z",
            },
          ],
        },
      ]
    : [];
  await writeFile(
    path.join(dataDirectory, "fawri-runtime-db.json"),
    JSON.stringify({
      productsByMerchant: {},
      conversationsByMerchant: { "merchant-1": conversations },
      metaPagesByPageId: {},
      ordersByMerchant: {},
      orderDraftsByConversation: {},
    }),
  );
}

async function withDataDirectory(
  prefix: string,
  callback: (directory: string) => Promise<void>,
) {
  const directory = await mkdtemp(path.join(os.tmpdir(), prefix));
  const previous = process.env.FAWRI_DATA_DIR;
  process.env.FAWRI_DATA_DIR = directory;
  try {
    await callback(directory);
  } finally {
    if (previous === undefined) delete process.env.FAWRI_DATA_DIR;
    else process.env.FAWRI_DATA_DIR = previous;
    await rm(directory, { recursive: true, force: true });
  }
}

test("worker core completes only after a sent outcome is recorded", async () => {
  await withDataDirectory("fawri-worker-sent-", async (directory) => {
    await writeRuntime(directory, "message-sent");
    const server = await startReplayServer(async (request) => {
      assert.ok(request.headers["x-fawri-internal-webhook-worker"]);
      await writeRuntime(directory, "message-sent", "sent");
    });
    try {
      const result = await processMetaReplyJob(job("message-sent"), server.url);
      assert.equal(result.delivery_status, "sent");
      assert.equal(result.conversation_id, "conversation-message-sent");
      assert.equal(result.internal_status, 200);
    } finally {
      await server.close();
    }
  });
});

test("worker core marks confirmed failed outcome as safely retryable", async () => {
  await withDataDirectory("fawri-worker-failed-", async (directory) => {
    await writeRuntime(directory, "message-failed");
    const server = await startReplayServer(async () => {
      await writeRuntime(directory, "message-failed", "failed");
    });
    try {
      await assert.rejects(
        () => processMetaReplyJob(job("message-failed"), server.url),
        (error: unknown) => {
          const record = error as { code?: string; retryable?: boolean };
          assert.equal(record.code, "META_REPLY_FAILED");
          assert.equal(record.retryable, true);
          return true;
        },
      );
    } finally {
      await server.close();
    }
  });
});

test("worker core sends uncertain outcome directly to non-retryable DLQ path", async () => {
  await withDataDirectory("fawri-worker-uncertain-", async (directory) => {
    await writeRuntime(directory, "message-uncertain");
    const server = await startReplayServer(() => undefined);
    try {
      await assert.rejects(
        () => processMetaReplyJob(job("message-uncertain"), server.url),
        (error: unknown) => {
          const record = error as { code?: string; retryable?: boolean };
          assert.equal(record.code, "META_REPLY_OUTCOME_UNCERTAIN");
          assert.equal(record.retryable, false);
          return true;
        },
      );
    } finally {
      await server.close();
    }
  });
});

test("worker core reuses an existing sent result without replaying", async () => {
  await withDataDirectory("fawri-worker-recovered-", async (directory) => {
    await writeRuntime(directory, "message-recovered", "sent");
    const result = await processMetaReplyJob(
      job("message-recovered"),
      "http://127.0.0.1:1/api/meta/webhook",
    );
    assert.equal(result.delivery_status, "sent");
    assert.equal(result.recovered_from_existing_result, true);
  });
});
