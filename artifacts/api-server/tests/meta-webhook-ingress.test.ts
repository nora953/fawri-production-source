import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { enqueueMetaWebhookEvents } from "../src/middleware/metaWebhookQueueIngress";

function response() {
  return {
    locals: {} as Record<string, unknown>,
    statusCode: 0,
    body: null as unknown,
    headers: {} as Record<string, string>,
    setHeader(name: string, value: string) {
      this.headers[name] = value;
    },
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(body: unknown) {
      this.body = body;
      return this;
    },
  };
}

function request(mid: string) {
  return {
    method: "POST",
    path: "/api/meta/webhook",
    headers: {},
    body: {
      object: "page",
      entry: [
        {
          id: "page-1",
          messaging: [
            {
              sender: { id: "customer-1" },
              recipient: { id: "page-1" },
              message: { mid, text: "private customer text" },
            },
          ],
        },
      ],
    },
  };
}

test("webhook ingress acknowledges only after durable enqueue", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "fawri-ingress-"));
  const previous = process.env.FAWRI_DATA_DIR;
  process.env.FAWRI_DATA_DIR = directory;
  try {
    await writeFile(
      path.join(directory, "meta-channels.json"),
      JSON.stringify({
        version: 1,
        channels: [
          {
            id: "channel-1",
            merchant_id: "merchant-1",
            platform: "messenger",
            page_id: "page-1",
            page_name: "Page One",
            status: "active",
            webhook_subscribed: true,
            connection_version: 1,
            created_at: "2026-08-07T00:00:00.000Z",
            updated_at: "2026-08-07T00:00:00.000Z",
          },
        ],
      }),
    );

    const accepted = response();
    enqueueMetaWebhookEvents(request("message-1") as never, accepted as never, () => {
      throw new Error("external ingress should terminate the response");
    });
    assert.equal(accepted.statusCode, 200);
    const jobs = JSON.parse(
      await readFile(path.join(directory, "background-jobs.json"), "utf8"),
    );
    assert.equal(jobs.jobs.length, 1);
    assert.equal(jobs.jobs[0].dedupe_key, "meta:page-1:message-1");

    await writeFile(
      path.join(directory, "background-jobs.json.lock"),
      JSON.stringify({ token: "other-worker", pid: 999999 }),
    );
    const unavailable = response();
    enqueueMetaWebhookEvents(request("message-2") as never, unavailable as never, () => {
      throw new Error("external ingress should terminate the response");
    });
    assert.equal(unavailable.statusCode, 503);
    const processedPath = path.join(directory, "processed-meta-events.json");
    const processed = JSON.parse(await readFile(processedPath, "utf8"));
    assert.equal("meta:page-1:message-2" in processed.events, false);
  } finally {
    if (previous === undefined) delete process.env.FAWRI_DATA_DIR;
    else process.env.FAWRI_DATA_DIR = previous;
    await rm(directory, { recursive: true, force: true });
  }
});
