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

    enqueueMetaWebhookEvents(request, response, next);

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
