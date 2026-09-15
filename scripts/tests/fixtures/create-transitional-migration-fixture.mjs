import fs from "node:fs";
import path from "node:path";

const outputDirectory = path.resolve(process.argv[2] || "");
if (!process.argv[2]) {
  throw new Error("fixture output directory is required");
}
fs.mkdirSync(outputDirectory, { recursive: true });

function writeJson(fileName, value) {
  fs.writeFileSync(
    path.join(outputDirectory, fileName),
    `${JSON.stringify(value, null, 2)}\n`,
    "utf8",
  );
}

writeJson("fawri-runtime-db.json", {
  productsByMerchant: {},
  conversationsByMerchant: {
    "merchant-1": [
      {
        id: "conversation-1",
        merchant_id: "merchant-1",
        page_id: "page-1",
        channel_id: "channel-1",
        customer_external_id: "customer-1",
        customer_name: "Customer",
        status: "auto_replying",
        assigned_to_human: false,
        created_at: "2026-08-02T00:00:00.000Z",
        updated_at: "2026-08-02T00:00:00.000Z",
      },
    ],
  },
  metaPagesByPageId: {
    "page-1": {
      page_id: "page-1",
      page_name: "Merchant Page",
      merchant_id: "merchant-1",
      platform: "messenger",
      status: "connected",
      connected_at: "2026-08-01T00:00:00.000Z",
    },
  },
  ordersByMerchant: {
    "merchant-1": [
      {
        id: "order-1",
        merchant_id: "merchant-1",
        conversation_id: "conversation-1",
        customer_name: "Customer",
        customer_phone: "07700000003",
        customer_address: "Baghdad",
        status: "confirmed",
        payment_method: "cash_on_delivery",
        payment_status: "cash_on_delivery",
        subtotal_iqd: 10000,
        delivery_fee_iqd: 0,
        total_iqd: 10000,
        source_channel: "messenger",
        version: 1,
        created_at: "2026-08-02T00:00:00.000Z",
        updated_at: "2026-08-02T00:00:00.000Z",
      },
    ],
  },
  orderDraftsByConversation: {},
  lastSyncedMerchantId: "merchant-1",
});

writeJson("processed-meta-events.json", { events: {} });
writeJson("reply-reservations.json", { reservations: {} });
writeJson("background-jobs.json", { version: 1, jobs: [] });
writeJson("manual-conversation-operations.json", {
  version: 1,
  conversations: {
    "merchant-1": {
      "conversation-1": {
        status: "manual",
        assigned_to_human: true,
        page_id: "page-1",
        inbound_messages: [
          {
            id: "message-inbound-1",
            external_message_id: "external-message-inbound-1",
            conversation_id: "conversation-1",
            sender: "customer",
            text: "Is this available?",
            status: "received",
            counted_as_auto_reply: false,
            created_at: "2026-08-06T12:00:00.000Z",
          },
        ],
        manual_messages: [
          {
            id: "message-manual-1",
            conversation_id: "conversation-1",
            sender: "merchant",
            text: "Yes, it is available.",
            status: "sent",
            reply_type: "manual",
            counted_as_auto_reply: false,
            created_at: "2026-08-06T12:01:00.000Z",
          },
        ],
        requests: {
          "manual-request-key-0001": {
            id: "manual-request-1",
            idempotency_key: "manual-request-key-0001",
            text_sha256:
              "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
            status: "sent",
            message_id: "message-manual-1",
            created_at: "2026-08-06T12:00:30.000Z",
            updated_at: "2026-08-06T12:01:00.000Z",
          },
        },
        updated_at: "2026-08-06T12:01:00.000Z",
      },
    },
  },
});

writeJson("order-operations.json", {
  version: 2,
  orders: {
    "merchant-1": {
      "order-1": {
        version: 2,
        status: "confirmed",
        payment_status: "paid",
        payment_verified_at: "2026-08-06T12:05:00.000Z",
        payment_verified_by: "merchant-1",
        payment_rejection_reason: null,
        last_payment_decision_id: "payment-decision-1",
        updated_at: "2026-08-06T12:05:00.000Z",
      },
    },
  },
  payment_decisions: [
    {
      id: "payment-decision-1",
      merchant_id: "merchant-1",
      order_id: "order-1",
      operation: "confirm",
      payment_channel: "cash_on_delivery",
      outcome: "paid",
      previous_order_status: "confirmed",
      resulting_order_status: "confirmed",
      previous_payment_status: "cash_on_delivery",
      resulting_payment_status: "paid",
      actor_type: "merchant",
      actor_id: "merchant-1",
      expected_version: 1,
      resulting_version: 2,
      request_id: "fixture-payment-confirm-1",
      reason: null,
      decided_at: "2026-08-06T12:05:00.000Z",
    },
  ],
});

writeJson("merchant-settings.json", {
  version: 1,
  settings: {
    "merchant-1": {
      merchant_id: "merchant-1",
      version: 2,
      auto_reply_enabled: false,
      reply_language: "ku",
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

process.stdout.write(`${outputDirectory}\n`);
