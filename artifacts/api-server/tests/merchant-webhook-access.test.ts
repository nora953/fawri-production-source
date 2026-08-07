import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { enforceMerchantWebhookOperationalAccess } from "../src/middleware/merchantWebhookAccess";

test("unknown Meta page returns retryable 503 instead of dropping the event", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "fawri-unknown-page-"));
  const previous = process.env.FAWRI_DATA_DIR;
  process.env.FAWRI_DATA_DIR = directory;
  try {
    const req = {
      method: "POST",
      path: "/api/meta/webhook",
      body: {
        object: "page",
        entry: [
          {
            id: "unknown-page",
            messaging: [
              {
                sender: { id: "customer-1" },
                message: { mid: "message-1", text: "private" },
              },
            ],
          },
        ],
      },
    };
    const res = {
      locals: {},
      statusCode: 0,
      responseBody: null as unknown,
      setHeader() {},
      status(code: number) {
        this.statusCode = code;
        return this;
      },
      json(value: unknown) {
        this.responseBody = value;
        return this;
      },
    };
    let nextCalled = false;
    enforceMerchantWebhookOperationalAccess(
      req as never,
      res as never,
      () => {
        nextCalled = true;
      },
    );
    assert.equal(nextCalled, false);
    assert.equal(res.statusCode, 503);
    assert.deepEqual(res.responseBody, {
      ok: false,
      code: "META_PAGE_DIRECTORY_UNAVAILABLE",
      error: "Meta page mapping is temporarily unavailable",
    });
  } finally {
    if (previous === undefined) delete process.env.FAWRI_DATA_DIR;
    else process.env.FAWRI_DATA_DIR = previous;
    await rm(directory, { recursive: true, force: true });
  }
});
