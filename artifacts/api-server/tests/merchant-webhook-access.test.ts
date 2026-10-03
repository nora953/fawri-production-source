import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { enforceMerchantWebhookOperationalAccess } from "../src/middleware/merchantWebhookAccess";
import { enforceMerchantWebhookSubscriptionAccess } from "../src/middleware/merchantWebhookSubscriptionAccess";

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
    await enforceMerchantWebhookOperationalAccess(
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

test("supported inbound media reserves reply entitlement while unsupported events consume nothing", async () => {
  const directory = await mkdtemp(
    path.join(os.tmpdir(), "fawri-media-entitlement-"),
  );
  const previous = process.env.FAWRI_DATA_DIR;
  process.env.FAWRI_DATA_DIR = directory;

  const merchantIds = [
    "merchant-text",
    "merchant-image",
    "merchant-audio",
    "merchant-video",
    "merchant-share",
    "merchant-file",
    "merchant-echo",
    "merchant-no-mid",
  ];

  function subscription(merchantId: string) {
    return {
      id: `subscription-${merchantId}`,
      merchant_id: merchantId,
      plan_name: "silver",
      price_iqd: 25_000,
      reply_limit: 1,
      replies_used: 0,
      replies_remaining: 1,
      base_reply_limit: 1,
      base_replies_used: 0,
      base_replies_remaining: 1,
      addon_replies_remaining: 0,
      addon_reply_batches: [],
      billing_anchor_day: 1,
      start_date: "2026-08-01T00:00:00.000Z",
      expires_at: "2099-09-01T00:00:00.000Z",
      status: "active",
      auto_reply_enabled: true,
      emergency_credit_used: 0,
      emergency_credit_amount: 400,
      emergency_credit_remaining: 0,
      emergency_credit_activated: false,
      emergency_debt: 0,
      pending_next_cycle_deduction: 0,
    };
  }

  try {
    await writeFile(
      path.join(directory, "fawri-runtime-db.json"),
      JSON.stringify({
        metaPagesByPageId: Object.fromEntries(
          merchantIds.map((merchantId) => [
            `page-${merchantId}`,
            {
              merchant_id: merchantId,
              page_id: `page-${merchantId}`,
            },
          ]),
        ),
      }),
    );

    await writeFile(
      path.join(directory, "merchants.json"),
      JSON.stringify({
        merchants: [],
        subscriptions: merchantIds.map(subscription),
      }),
    );

    async function enforce(
      merchantId: string,
      message: Record<string, unknown>,
    ) {
      const req = {
        method: "POST",
        path: "/api/meta/webhook",
        body: {
          object: "page",
          entry: [
            {
              id: `page-${merchantId}`,
              messaging: [
                {
                  sender: { id: `customer-${merchantId}` },
                  message,
                },
              ],
            },
          ],
        },
      };

      const res = {
        locals: {},
        statusCode: 200,
        setHeader() {},
        status(code: number) {
          this.statusCode = code;
          return this;
        },
        json() {
          return this;
        },
      };

      let nextCalled = false;

      await enforceMerchantWebhookSubscriptionAccess(
        req as never,
        res as never,
        () => {
          nextCalled = true;
        },
      );

      assert.equal(nextCalled, true);
      return { req, res };
    }

    const supported = [
      ["merchant-text", { mid: "message-text", text: "hello" }],
      [
        "merchant-image",
        {
          mid: "message-image",
          attachments: [
            {
              type: "image",
              payload: { url: "https://example.invalid/image.jpg" },
            },
          ],
        },
      ],
      [
        "merchant-audio",
        {
          mid: "message-audio",
          attachments: [
            {
              type: "audio",
              payload: { url: "https://example.invalid/audio.m4a" },
            },
          ],
        },
      ],
      [
        "merchant-video",
        {
          mid: "message-video",
          attachments: [
            {
              type: "video",
              payload: { url: "https://example.invalid/video.mp4" },
            },
          ],
        },
      ],
      [
        "merchant-share",
        {
          mid: "message-share",
          attachments: [
            {
              type: "share",
              payload: {
                url: "https://example.invalid/post",
                title: "Shared post",
              },
            },
          ],
        },
      ],
    ] as const;

    for (const [merchantId, message] of supported) {
      const { res } = await enforce(merchantId, message);
      assert.equal(
        (res.locals as Record<string, unknown>).metaWebhookReservedReplies,
        1,
        `${merchantId} did not reserve entitlement`,
      );
      assert.equal(
        (res.locals as Record<string, unknown>).metaWebhookBlockedReplies,
        0,
      );
    }

    const unsupported = [
      [
        "merchant-file",
        {
          mid: "message-file",
          attachments: [
            {
              type: "file",
              payload: { url: "https://example.invalid/file.pdf" },
            },
          ],
        },
      ],
      [
        "merchant-echo",
        {
          mid: "message-echo",
          is_echo: true,
          text: "echo",
        },
      ],
      [
        "merchant-no-mid",
        {
          attachments: [
            {
              type: "image",
              payload: { url: "https://example.invalid/no-mid.jpg" },
            },
          ],
        },
      ],
    ] as const;

    for (const [merchantId, message] of unsupported) {
      const { res } = await enforce(merchantId, message);
      assert.equal(
        (res.locals as Record<string, unknown>).metaWebhookReservedReplies,
        0,
        `${merchantId} unexpectedly reserved entitlement`,
      );
      assert.equal(
        (res.locals as Record<string, unknown>).metaWebhookBlockedReplies,
        0,
      );
    }

    const database = JSON.parse(
      await readFile(path.join(directory, "merchants.json"), "utf8"),
    );

    for (const merchantId of [
      "merchant-text",
      "merchant-image",
      "merchant-audio",
      "merchant-video",
      "merchant-share",
    ]) {
      const subscription = database.subscriptions.find(
        (item: { merchant_id: string }) => item.merchant_id === merchantId,
      );
      assert.equal(subscription.base_replies_used, 1);
      assert.equal(subscription.base_replies_remaining, 0);
    }

    for (const merchantId of [
      "merchant-file",
      "merchant-echo",
      "merchant-no-mid",
    ]) {
      const subscription = database.subscriptions.find(
        (item: { merchant_id: string }) => item.merchant_id === merchantId,
      );
      assert.equal(subscription.base_replies_used, 0);
      assert.equal(subscription.base_replies_remaining, 1);
    }

    const reservations = JSON.parse(
      await readFile(
        path.join(directory, "reply-reservations.json"),
        "utf8",
      ),
    );

    assert.deepEqual(
      Object.keys(reservations.reservations).sort(),
      [
        "meta:page-merchant-audio:message-audio",
        "meta:page-merchant-image:message-image",
        "meta:page-merchant-share:message-share",
        "meta:page-merchant-text:message-text",
        "meta:page-merchant-video:message-video",
      ],
    );
  } finally {
    if (previous === undefined) {
      delete process.env.FAWRI_DATA_DIR;
    } else {
      process.env.FAWRI_DATA_DIR = previous;
    }
    await rm(directory, { recursive: true, force: true });
  }
});

test("supported media during manual takeover is persisted, deduplicated, and never returned to automation", async () => {
  const directory = await mkdtemp(
    path.join(os.tmpdir(), "fawri-manual-media-webhook-"),
  );
  const previous = process.env.FAWRI_DATA_DIR;
  process.env.FAWRI_DATA_DIR = directory;

  try {
    await writeFile(
      path.join(directory, "fawri-runtime-db.json"),
      JSON.stringify({
        productsByMerchant: {},
        conversationsByMerchant: {
          "merchant-manual-media": [
            {
              id: "messenger-customer-media",
              merchant_id: "merchant-manual-media",
              platform: "messenger",
              page_id: "page-manual-media",
              customer_name: "Customer",
              customer_handle: "customer-media",
              status: "auto_replying",
              assigned_to_human: false,
              needs_training: false,
              updated_at: "2026-08-06T10:00:00.000Z",
              messages: [],
            },
          ],
        },
        metaPagesByPageId: {
          "page-manual-media": {
            merchant_id: "merchant-manual-media",
            page_id: "page-manual-media",
          },
        },
        ordersByMerchant: {},
        orderDraftsByConversation: {},
      }),
    );

    const {
      getServerConversation,
      takeOverConversation,
    } = await import("../src/services/manualConversationRuntime");
    const { enforceManualConversationWebhookAccess } = await import(
      "../src/middleware/manualConversationWebhookAccess"
    );

    takeOverConversation(
      "merchant-manual-media",
      "messenger-customer-media",
    );

    const supported = [
      {
        mid: "manual-media-image-1",
        type: "image",
        marker: "[image]",
      },
      {
        mid: "manual-media-audio-1",
        type: "audio",
        marker: "[audio]",
      },
      {
        mid: "manual-media-video-1",
        type: "video",
        marker: "[video]",
      },
      {
        mid: "manual-media-share-1",
        type: "share",
        marker: "[shared_post]",
      },
    ] as const;

    const messaging = [
      ...supported.map(({ mid, type }) => ({
        sender: { id: "customer-media" },
        timestamp: 1786039200000,
        message: {
          mid,
          attachments: [
            {
              type,
              payload: {
                url: `https://example.invalid/private-${type}`,
              },
            },
          ],
        },
      })),
      // Duplicate image: same Meta message identity must not create a second message.
      {
        sender: { id: "customer-media" },
        timestamp: 1786039200000,
        message: {
          mid: "manual-media-image-1",
          attachments: [
            {
              type: "image",
              payload: {
                url: "https://example.invalid/private-image-duplicate",
              },
            },
          ],
        },
      },
      // Unsupported attachment must fail closed and continue downstream untouched.
      {
        sender: { id: "customer-media" },
        timestamp: 1786039200000,
        message: {
          mid: "manual-media-file-1",
          attachments: [
            {
              type: "file",
              payload: {
                url: "https://example.invalid/private-file",
              },
            },
          ],
        },
      },
    ];

    const req = {
      method: "POST",
      path: "/api/meta/webhook",
      socket: { remoteAddress: "203.0.113.10" },
      body: {
        object: "page",
        entry: [
          {
            id: "page-manual-media",
            messaging,
          },
        ],
      },
    };

    const res = {
      locals: {},
      setHeader() {},
      status() {
        return this;
      },
      json() {
        return this;
      },
    };

    let nextCalled = false;
    await enforceManualConversationWebhookAccess(
      req as never,
      res as never,
      () => {
        nextCalled = true;
      },
    );

    assert.equal(nextCalled, true);

    // Only the unsupported file is allowed to continue downstream.
    assert.equal(req.body.entry[0].messaging.length, 1);
    assert.equal(
      req.body.entry[0].messaging[0].message.mid,
      "manual-media-file-1",
    );

    // Four unique supported Meta message IDs become terminal.
    const terminalEventIds = (
      res.locals as { metaWebhookTerminalEventIds?: string[] }
    ).metaWebhookTerminalEventIds ?? [];
    assert.equal(terminalEventIds.length, 4);
    assert.deepEqual(
      new Set(terminalEventIds),
      new Set(
        supported.map(
          ({ mid }) => `meta:page-manual-media:${mid}`,
        ),
      ),
    );

    // Persisted conversation contains exactly four unique supported media messages.
    const conversation = getServerConversation(
      "merchant-manual-media",
      "messenger-customer-media",
    );
    const customerMessages = conversation.messages.filter(
      (message) => message.sender === "customer",
    );

    assert.equal(customerMessages.length, 4);

    for (const { mid, marker } of supported) {
      const stored = customerMessages.find(
        (message) => message.external_message_id === mid,
      );
      assert.ok(stored, `missing persisted message ${mid}`);
      assert.equal(stored.text, marker);
      assert.equal(stored.status, "received");
      assert.equal(stored.counted_as_auto_reply, false);
    }

    // No raw attachment URL/payload is persisted in the message representation.
    const serializedMessages = JSON.stringify(customerMessages);
    assert.equal(serializedMessages.includes("example.invalid"), false);
    assert.equal(serializedMessages.includes("private-image"), false);
  } finally {
    if (previous === undefined) delete process.env.FAWRI_DATA_DIR;
    else process.env.FAWRI_DATA_DIR = previous;
    await rm(directory, { recursive: true, force: true });
  }
});
