import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  failManualReply,
  getServerConversation,
  ManualConversationError,
  prepareManualReply,
  recordManualInboundMessage,
  returnConversationToFawri,
  takeOverConversation,
} from "../src/services/manualConversationRuntime";
import {
  deleteMerchantRuntimeData,
  registerMerchantRuntimeDeletion,
} from "../src/services/merchantRuntime";
import "../src/services/manualConversationDeletion";

function makeDirectory(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "fawri-manual-runtime-"));
}

function writeJson(directory: string, fileName: string, value: unknown): void {
  fs.writeFileSync(
    path.join(directory, fileName),
    `${JSON.stringify(value, null, 2)}\n`,
    "utf8",
  );
}

function runtimeDatabase(options: { explicitPageId?: string } = {}) {
  return {
    productsByMerchant: {},
    conversationsByMerchant: {
      "merchant-1": [
        {
          id: "messenger-customer-1",
          merchant_id: "merchant-1",
          platform: "messenger",
          ...(options.explicitPageId
            ? { page_id: options.explicitPageId }
            : {}),
          customer_name: "Customer",
          customer_handle: "customer-1",
          status: "auto_replying",
          assigned_to_human: false,
          needs_training: false,
          updated_at: "2026-08-06T10:00:00.000Z",
          messages: [],
        },
      ],
    },
    metaPagesByPageId: {
      "page-1": {
        merchant_id: "merchant-1",
        page_id: "page-1",
        page_access_token: "token-1",
        platform: "messenger",
      },
      "page-2": {
        merchant_id: "merchant-1",
        page_id: "page-2",
        page_access_token: "token-2",
        platform: "messenger",
      },
    },
    ordersByMerchant: {},
    orderDraftsByConversation: {},
    lastSyncedMerchantId: null,
  };
}

function withDataDirectory(directory: string): () => void {
  const previous = process.env.FAWRI_DATA_DIR;
  process.env.FAWRI_DATA_DIR = directory;
  return () => {
    if (previous === undefined) delete process.env.FAWRI_DATA_DIR;
    else process.env.FAWRI_DATA_DIR = previous;
  };
}

function assertManualError(
  callback: () => unknown,
  code: string,
): ManualConversationError {
  let thrown: unknown;
  try {
    callback();
  } catch (error) {
    thrown = error;
  }
  assert.ok(thrown instanceof ManualConversationError);
  assert.equal(thrown.code, code);
  return thrown;
}

test("legacy conversation with multiple pages is rejected instead of guessed", () => {
  const directory = makeDirectory();
  const restore = withDataDirectory(directory);
  try {
    writeJson(directory, "fawri-runtime-db.json", runtimeDatabase());
    assertManualError(
      () => takeOverConversation("merchant-1", "messenger-customer-1"),
      "CONVERSATION_CHANNEL_UNRESOLVED",
    );
    assert.equal(
      fs.existsSync(path.join(directory, "manual-conversation-operations.json")),
      false,
      "ambiguous takeover created an overlay",
    );
  } finally {
    restore();
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test("explicit conversation page permits takeover across multiple pages", () => {
  const directory = makeDirectory();
  const restore = withDataDirectory(directory);
  try {
    writeJson(
      directory,
      "fawri-runtime-db.json",
      runtimeDatabase({ explicitPageId: "page-2" }),
    );
    const conversation = takeOverConversation(
      "merchant-1",
      "messenger-customer-1",
    );
    assert.equal(conversation.status, "manual");
    assert.equal(conversation.assigned_to_human, true);
    assert.equal(conversation.page_id, "page-2");
  } finally {
    restore();
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test("customer messages during takeover are persisted and deduplicated", () => {
  const directory = makeDirectory();
  const restore = withDataDirectory(directory);
  try {
    writeJson(
      directory,
      "fawri-runtime-db.json",
      runtimeDatabase({ explicitPageId: "page-1" }),
    );
    takeOverConversation("merchant-1", "messenger-customer-1");
    const first = recordManualInboundMessage({
      merchantId: "merchant-1",
      conversationId: "messenger-customer-1",
      externalMessageId: "meta-inbound-1",
      messageText: "Customer message during takeover",
      createdAt: 1786039200000,
    });
    const duplicate = recordManualInboundMessage({
      merchantId: "merchant-1",
      conversationId: "messenger-customer-1",
      externalMessageId: "meta-inbound-1",
      messageText: "Customer message during takeover",
      createdAt: 1786039200000,
    });
    assert.equal(duplicate.id, first.id);

    const conversation = getServerConversation(
      "merchant-1",
      "messenger-customer-1",
    );
    const customerMessages = conversation.messages.filter(
      (message) => message.sender === "customer",
    );
    assert.equal(customerMessages.length, 1);
    assert.equal(customerMessages[0].external_message_id, "meta-inbound-1");
    assert.equal(customerMessages[0].text, "Customer message during takeover");
  } finally {
    restore();
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test("uncertain manual delivery is never retried or returned to automation", () => {
  const directory = makeDirectory();
  const restore = withDataDirectory(directory);
  try {
    writeJson(
      directory,
      "fawri-runtime-db.json",
      runtimeDatabase({ explicitPageId: "page-1" }),
    );
    takeOverConversation("merchant-1", "messenger-customer-1");
    const key = "manual-uncertain-request-0001";
    const prepared = prepareManualReply({
      merchantId: "merchant-1",
      conversationId: "messenger-customer-1",
      idempotencyKey: key,
      messageText: "Message with unknown outcome",
    });
    assert.equal(prepared.deduplicated, false);
    assert.equal(prepared.pageId, "page-1");

    failManualReply({
      merchantId: "merchant-1",
      conversationId: "messenger-customer-1",
      idempotencyKey: key,
      errorCode: "META_MANUAL_REPLY_TRANSPORT_UNCERTAIN",
      uncertain: true,
    });

    assertManualError(
      () =>
        prepareManualReply({
          merchantId: "merchant-1",
          conversationId: "messenger-customer-1",
          idempotencyKey: key,
          messageText: "Message with unknown outcome",
        }),
      "MANUAL_REPLY_OUTCOME_UNCERTAIN",
    );
    assertManualError(
      () => returnConversationToFawri("merchant-1", "messenger-customer-1"),
      "MANUAL_REPLY_RECONCILIATION_REQUIRED",
    );
    const conversation = getServerConversation(
      "merchant-1",
      "messenger-customer-1",
    );
    assert.deepEqual(
      conversation.messages.filter((message) => message.sender === "merchant"),
      [],
    );
    assert.equal(conversation.status, "manual");
  } finally {
    restore();
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test("merchant deletion aggregates stores and removes manual overlay", () => {
  const directory = makeDirectory();
  const restore = withDataDirectory(directory);
  try {
    writeJson(
      directory,
      "manual-conversation-operations.json",
      {
        version: 1,
        conversations: {
          "merchant-1": {
            "messenger-customer-1": {
              status: "manual",
              assigned_to_human: true,
              page_id: "page-1",
              updated_at: "2026-08-06T12:00:00.000Z",
              inbound_messages: [
                {
                  id: "customer-message-1",
                  external_message_id: "meta-inbound-1",
                  conversation_id: "messenger-customer-1",
                  sender: "customer",
                  text: "incoming",
                  created_at: "2026-08-06T11:59:00.000Z",
                  counted_as_auto_reply: false,
                  status: "received",
                },
              ],
              manual_messages: [
                {
                  id: "message-1",
                  conversation_id: "messenger-customer-1",
                  sender: "merchant",
                  text: "sent",
                  created_at: "2026-08-06T12:00:00.000Z",
                  counted_as_auto_reply: false,
                  reply_type: "manual",
                  status: "sent",
                },
              ],
              requests: {
                "manual-delete-request-0001": {
                  idempotency_key: "manual-delete-request-0001",
                  text_sha256:
                    "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
                  status: "sent",
                  created_at: "2026-08-06T12:00:00.000Z",
                  updated_at: "2026-08-06T12:00:00.000Z",
                  message_id: "message-1",
                },
              },
            },
          },
          "merchant-2": {
            "messenger-customer-2": {
              status: "manual",
              assigned_to_human: true,
              page_id: "page-2",
              updated_at: "2026-08-06T12:00:00.000Z",
              inbound_messages: [],
              manual_messages: [],
              requests: {},
            },
          },
        },
      },
    );

    registerMerchantRuntimeDeletion(() => ({
      products: 2,
      conversations: 3,
      orders: 4,
      orderDrafts: 5,
      metaPages: 1,
    }));
    const summary = deleteMerchantRuntimeData("merchant-1");
    assert.equal(summary.products, 2);
    assert.equal(summary.conversations, 3);
    assert.equal(summary.manualConversations, 1);
    assert.equal(summary.manualInboundMessages, 1);
    assert.equal(summary.manualMessages, 1);
    assert.equal(summary.manualReplyRequests, 1);

    const overlay = JSON.parse(
      fs.readFileSync(
        path.join(directory, "manual-conversation-operations.json"),
        "utf8",
      ),
    );
    assert.equal(Object.hasOwn(overlay.conversations, "merchant-1"), false);
    assert.equal(Object.hasOwn(overlay.conversations, "merchant-2"), true);
  } finally {
    restore();
    fs.rmSync(directory, { recursive: true, force: true });
  }
});
