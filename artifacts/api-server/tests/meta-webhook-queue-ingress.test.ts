import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import type { NextFunction, Request, Response } from "express";
import { enqueueMetaWebhookEvents } from "../src/middleware/metaWebhookQueueIngress";

function responseMock() {
  const state = {
    statusCode: 200,
    body: undefined as unknown,
    headers: new Map<string, string>(),
    ended: false,
  };
  const response = {
    locals: {},
    setHeader(name: string, value: string) {
      state.headers.set(name.toLowerCase(), String(value));
      return response;
    },
    status(code: number) {
      state.statusCode = code;
      return response;
    },
    json(body: unknown) {
      state.body = body;
      state.ended = true;
      return response;
    },
    sendStatus(code: number) {
      state.statusCode = code;
      state.ended = true;
      return response;
    },
  };
  return { response: response as unknown as Response, state };
}

test("queue write failure returns 503 without marking event processed", async () => {
  const dataDirectory = await mkdtemp(
    path.join(os.tmpdir(), "fawri-meta-ingress-failure-"),
  );
  const previousDataDirectory = process.env.FAWRI_DATA_DIR;
  process.env.FAWRI_DATA_DIR = dataDirectory;

  try {
    await writeFile(
      path.join(dataDirectory, "fawri-runtime-db.json"),
      JSON.stringify({
        productsByMerchant: {},
        conversationsByMerchant: {},
        metaPagesByPageId: {
          "page-1": {
            merchant_id: "merchant-1",
            page_id: "page-1",
          },
        },
        ordersByMerchant: {},
        orderDraftsByConversation: {},
      }),
    );
    await writeFile(
      path.join(dataDirectory, "background-jobs.json"),
      "{ invalid-json",
    );

    const request = {
      method: "POST",
      path: "/api/meta/webhook",
      body: {
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
      headers: {},
      socket: { remoteAddress: "203.0.113.10" },
    } as unknown as Request;
    const { response, state } = responseMock();
    let nextCalled = false;
    const next = (() => {
      nextCalled = true;
    }) as NextFunction;

    await enqueueMetaWebhookEvents(request, response, next);

    assert.equal(nextCalled, false);
    assert.equal(state.statusCode, 503);
    assert.equal(state.ended, true);
    assert.deepEqual(state.body, {
      ok: false,
      code: "META_WEBHOOK_QUEUE_UNAVAILABLE",
      error: "Meta webhook queue is unavailable",
    });
    await assert.rejects(
      readFile(path.join(dataDirectory, "processed-meta-events.json"), "utf8"),
      (error: unknown) =>
        (error as NodeJS.ErrnoException).code === "ENOENT",
    );
  } finally {
    if (previousDataDirectory === undefined) {
      delete process.env.FAWRI_DATA_DIR;
    } else {
      process.env.FAWRI_DATA_DIR = previousDataDirectory;
    }
    await rm(dataDirectory, { recursive: true, force: true });
  }
});

test("queue preserves supported inbound media for reply processing and fails closed for unsupported attachments", async () => {
  const dataDirectory = await mkdtemp(
    path.join(os.tmpdir(), "fawri-meta-media-ingress-"),
  );
  const previousDataDirectory = process.env.FAWRI_DATA_DIR;
  process.env.FAWRI_DATA_DIR = dataDirectory;

  try {
    await writeFile(
      path.join(dataDirectory, "fawri-runtime-db.json"),
      JSON.stringify({
        productsByMerchant: {},
        conversationsByMerchant: {},
        metaPagesByPageId: {
          "page-media": {
            merchant_id: "merchant-media",
            page_id: "page-media",
          },
        },
        ordersByMerchant: {},
        orderDraftsByConversation: {},
      }),
    );

    const { listDurableJobs } = await import(
      "../src/services/durableJobQueue"
    );

    async function enqueueMessage(
      mid: string,
      message: Record<string, unknown>,
    ) {
      const request = {
        method: "POST",
        path: "/api/meta/webhook",
        body: {
          object: "page",
          entry: [
            {
              id: "page-media",
              messaging: [
                {
                  sender: { id: "customer-media" },
                  message: { mid, ...message },
                },
              ],
            },
          ],
        },
        headers: {},
        socket: { remoteAddress: "203.0.113.20" },
      } as unknown as Request;

      const { response, state } = responseMock();
      let nextCalled = false;

      await enqueueMetaWebhookEvents(
        request,
        response,
        (() => {
          nextCalled = true;
        }) as NextFunction,
      );

      assert.equal(nextCalled, false);
      assert.equal(state.statusCode, 200);
    }

    await enqueueMessage("message-text", { text: "hello" });

    await enqueueMessage("message-image", {
      attachments: [
        {
          type: "image",
          payload: { url: "https://example.invalid/image.jpg" },
        },
      ],
    });

    await enqueueMessage("message-audio", {
      attachments: [
        {
          type: "audio",
          payload: { url: "https://example.invalid/audio.m4a" },
        },
      ],
    });

    await enqueueMessage("message-video", {
      attachments: [
        {
          type: "video",
          payload: { url: "https://example.invalid/video.mp4" },
        },
      ],
    });

    await enqueueMessage("message-share", {
      attachments: [
        {
          type: "share",
          payload: {
            url: "https://example.invalid/post",
            title: "Shared post",
          },
        },
      ],
    });

    await enqueueMessage("message-file", {
      attachments: [
        {
          type: "file",
          payload: { url: "https://example.invalid/file.pdf" },
        },
      ],
    });

    await enqueueMessage("message-echo", {
      is_echo: true,
      text: "echo",
    });

    const jobs = listDurableJobs();

    for (const mid of [
      "message-text",
      "message-image",
      "message-audio",
      "message-video",
    ]) {
      const job = jobs.find(
        (candidate) =>
          candidate.payload?.external_message_id === mid,
      );

      assert.ok(job, `missing reply job for ${mid}`);
      assert.equal(job.type, "meta.webhook.reply");
      assert.equal(job.merchant_id, "merchant-media");

      const webhookBody = job.payload?.webhook_body as
        | Record<string, unknown>
        | undefined;

      assert.ok(webhookBody, `missing preserved webhook body for ${mid}`);
    }

    const nonReplyJobs = jobs.filter(
      (candidate) => candidate.type === "meta.webhook.event",
    );

    assert.equal(nonReplyJobs.length, 3);
    assert.ok(
      nonReplyJobs.every(
        (job) => job.payload?.event_kind === "non_reply",
      ),
    );

    assert.equal(
      jobs.some(
        (job) => job.payload?.external_message_id === "message-share" && job.type === "meta.webhook.reply",
      ),
      false,
    );
    assert.equal(
      jobs.some(
        (job) => job.payload?.external_message_id === "message-file",
      ),
      false,
    );
    assert.equal(
      jobs.some(
        (job) => job.payload?.external_message_id === "message-echo",
      ),
      false,
    );
  } finally {
    if (previousDataDirectory === undefined) {
      delete process.env.FAWRI_DATA_DIR;
    } else {
      process.env.FAWRI_DATA_DIR = previousDataDirectory;
    }
    await rm(dataDirectory, { recursive: true, force: true });
  }
});
