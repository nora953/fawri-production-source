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

writeJson("merchants.json", {
  merchants: [
    {
      id: "merchant-1",
      owner_name: "Merchant Owner",
      store_name: "Merchant Store",
      activity_type: "retail",
      phone: "07700000001",
      password_hash: "merchant-password-hash",
      status: "approved",
      account_status: "approved",
      onboarding_status: "channel_connected",
      trial_status: "active",
      signup_source: "direct",
      language: "ar",
      otp_verified: true,
      created_at: "2026-01-01T00:00:00.000Z",
    },
    {
      id: "admin-1",
      owner_name: "Owner Admin",
      store_name: "Fawri",
      phone: "07700000002",
      password_hash: "admin-password-hash",
      status: "approved",
      is_admin: true,
      admin_role: "owner_admin",
      permissions: ["manage_support"],
      language: "en",
      otp_verified: true,
      created_at: "2026-01-01T00:00:00.000Z",
    },
  ],
  subscriptions: [
    {
      id: "subscription-1",
      merchant_id: "merchant-1",
      plan: "gold",
      status: "active",
      price_iqd: 49000,
      billing_anchor_day: 1,
      reply_limit: 8000,
      replies_used: 10,
      base_replies_remaining: 7990,
      auto_reply_enabled: true,
      activated_at: "2026-08-01T00:00:00.000Z",
      starts_at: "2026-08-01T00:00:00.000Z",
      expires_at: "2026-09-01T00:00:00.000Z",
    },
  ],
  support_tickets: [
    {
      id: "ticket-1",
      merchant_id: "merchant-1",
      subject: "Test ticket",
      category: "technical",
      status: "in_progress",
      assigned_admin_id: "admin-1",
      waiting_on: "admin",
      messages: [
        {
          id: "support-message-1",
          sender_type: "merchant",
          sender_id: "merchant-1",
          sender_name: "Merchant Store",
          body: "Help",
          created_at: "2026-08-02T00:00:00.000Z",
        },
      ],
      inspection_requests: [
        {
          id: "inspection-1",
          admin_id: "admin-1",
          mode: "independent_read_only",
          reason: "Diagnose issue",
          status: "approved",
          consent_decision: "approved",
          request_expires_at: "2026-08-03T00:30:00.000Z",
        },
      ],
    },
  ],
});

writeJson("bot-runtime.json", {
  products: [
    {
      id: "product-1",
      merchant_id: "merchant-1",
      name: "Product",
      description: "Product description",
      price_iqd: 10000,
      quantity: 5,
      active: true,
    },
  ],
  metaPages: [
    {
      id: "channel-1",
      merchant_id: "merchant-1",
      platform: "messenger",
      status: "connected",
      page_id: "page-1",
      page_name: "Merchant Page",
    },
  ],
  conversations: [
    {
      id: "conversation-1",
      merchant_id: "merchant-1",
      channel_id: "channel-1",
      external_conversation_id: "external-conversation-1",
      customer_external_id: "customer-1",
      customer_name: "Customer",
      status: "auto_replying",
    },
  ],
  orders: [
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
      total_iqd: 10000,
      source_channel: "messenger",
    },
  ],
  orderDrafts: [
    {
      id: "draft-1",
      merchant_id: "merchant-1",
      conversation_id: "conversation-1",
      customer_external_id: "customer-1",
      awaiting_field: "address",
      draft_data: { product_id: "product-1" },
      expires_at: "2099-08-03T01:00:00.000Z",
    },
  ],
});

writeJson("saved-answers.json", {
  answers: [
    {
      id: "saved-answer-1",
      merchant_id: "merchant-1",
      category: "delivery",
      question_pattern: "How much is delivery?",
      answer_text: "Delivery is 5,000 IQD.",
      language: "en",
      approved: true,
      active: true,
    },
  ],
});

writeJson("training-requests.json", {
  requests: [
    {
      id: "training-1",
      merchantId: "merchant-1",
      customerId: "customer-1",
      customerMessage: "Is it available?",
      normalizedMessage: "is it available",
      detectedIntent: "availability",
      detectedLanguage: "en",
      reason: "low_confidence",
      suggestedReply: "Yes, it is available.",
      suggestedReplySource: "merchant_draft",
      status: "approved",
    },
  ],
});

writeJson("learned-answers.json", {
  answers: [
    {
      id: "learned-1",
      merchantId: "merchant-1",
      trainingRequestId: "training-1",
      intent: "availability",
      language: "en",
      examples: ["Is it available?"],
      keywords: ["available"],
      reply: "Yes, it is available.",
      source: "merchant_approved",
      confidence: 0.96,
      safeToAutoReply: true,
      requiresHumanApproval: false,
      conditions: {},
    },
  ],
});

writeJson("support-preview-sessions.json", {
  sessions: [
    {
      id: "preview-1",
      request_id: "inspection-1",
      ticket_id: "ticket-1",
      merchant_id: "merchant-1",
      admin_id: "admin-1",
      status: "active",
      started_at: "2026-08-03T00:00:00.000Z",
      expires_at: "2026-08-03T00:30:00.000Z",
      last_seen_at: "2026-08-03T00:05:00.000Z",
      viewed_sections: ["snapshot"],
    },
  ],
});

writeJson("emergency-read-access.json", {
  authorizations: [
    {
      admin_id: "admin-1",
      can_request: true,
      can_critical_self_activate: false,
      granted_by_owner_id: "admin-1",
      granted_at: "2026-08-01T00:00:00.000Z",
      updated_at: "2026-08-01T00:00:00.000Z",
    },
  ],
  requests: [
    {
      id: "emergency-request-1",
      merchant_id: "merchant-1",
      requested_by_admin_id: "admin-1",
      incident_reference: "INC-001",
      severity: "high",
      reason: "Service incident",
      duration_minutes: 15,
      read_only: true,
      status: "ended",
      activation_mode: "owner_approval",
      started_at: "2026-08-01T00:00:00.000Z",
      expires_at: "2026-08-01T00:15:00.000Z",
      ended_at: "2026-08-01T00:15:00.000Z",
      created_at: "2026-08-01T00:00:00.000Z",
    },
  ],
  owner_alerts: [
    {
      id: "owner-alert-1",
      request_id: "emergency-request-1",
      type: "approval_required",
      title: "Approval required",
      details: "Test",
      created_at: "2026-08-01T00:00:00.000Z",
    },
  ],
  merchant_notices: [
    {
      id: "merchant-notice-1",
      merchant_id: "merchant-1",
      request_id: "emergency-request-1",
      incident_reference: "INC-001",
      activation_mode: "owner_approval",
      started_at: "2026-08-01T00:00:00.000Z",
      ended_at: "2026-08-01T00:15:00.000Z",
      created_at: "2026-08-01T00:16:00.000Z",
    },
  ],
  audit_events: [
    {
      id: "emergency-audit-1",
      event_type: "emergency_access_ended",
      request_id: "emergency-request-1",
      actor_admin_id: "admin-1",
      merchant_id: "merchant-1",
      metadata: {},
      previous_hash: "GENESIS",
      hash: "test-hash",
      created_at: "2026-08-01T00:15:00.000Z",
    },
  ],
});

process.stdout.write(`${outputDirectory}\n`);
