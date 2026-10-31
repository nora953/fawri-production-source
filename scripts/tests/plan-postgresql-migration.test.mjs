import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { fileURLToPath } from "node:url";

const testDirectory = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(testDirectory, "../..");
const plannerPath = path.join(
  repositoryRoot,
  "scripts",
  "plan-postgresql-migration.mjs",
);

function makeDataDirectory() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "fawri-migration-plan-"));
}

function writeJson(directory, fileName, value) {
  fs.writeFileSync(
    path.join(directory, fileName),
    `${JSON.stringify(value, null, 2)}\n`,
    "utf8",
  );
}

function directorySnapshot(directory) {
  return Object.fromEntries(
    fs
      .readdirSync(directory)
      .sort()
      .map((fileName) => {
        const bytes = fs.readFileSync(path.join(directory, fileName));
        return [
          fileName,
          {
            size: bytes.length,
            sha256: crypto.createHash("sha256").update(bytes).digest("hex"),
          },
        ];
      }),
  );
}

function runPlanner(directory) {
  return spawnSync(process.execPath, [plannerPath, directory], {
    cwd: repositoryRoot,
    encoding: "utf8",
    env: {
      ...process.env,
      DATABASE_URL: "postgresql://must-not-be-used.invalid/fawri",
    },
  });
}

function createCompleteFixture(directory) {
  writeJson(directory, "merchants.json", {
    merchants: [
      {
        id: "merchant-1",
        owner_name: "Merchant Owner",
        store_name: "Merchant Store",
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
        reply_limit: 8000,
        replies_used: 10,
        base_replies_remaining: 7990,
        auto_reply_enabled: true,
        activated_at: "2026-08-01T00:00:00.000Z",
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

  writeJson(directory, "bot-runtime.json", {
    products: [
      {
        id: "product-1",
        merchant_id: "merchant-1",
        name: "Product",
        price_iqd: 10000,
        active: true,
      },
    ],
    conversations: [
      {
        id: "conversation-1",
        merchant_id: "merchant-1",
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
        expires_at: "2026-08-03T01:00:00.000Z",
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
  });

  writeJson(directory, "saved-answers.json", {
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

  writeJson(directory, "training-requests.json", {
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
        status: "approved",
      },
    ],
  });

  writeJson(directory, "learned-answers.json", {
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

  writeJson(directory, "support-preview-sessions.json", {
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

  writeJson(directory, "emergency-read-access.json", {
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
        status: "ended",
        activation_mode: "owner_approval",
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
}

test("dry-run builds a complete plan without changing source files", () => {
  const directory = makeDataDirectory();
  try {
    createCompleteFixture(directory);
    const before = directorySnapshot(directory);
    const result = runPlanner(directory);
    const after = directorySnapshot(directory);

    assert.equal(result.status, 0, result.stderr || result.stdout);
    assert.deepEqual(after, before, "dry-run changed one or more source files");

    const report = JSON.parse(result.stdout);
    assert.equal(report.ok, true);
    assert.equal(report.mode, "dry_run");
    assert.equal(report.writes_performed, false);
    assert.equal(report.database_connection_used, false);
    assert.equal(report.summary.errors, 0);
    assert.equal(report.table_counts.accounts, 2);
    assert.equal(report.table_counts.merchants, 1);
    assert.equal(report.table_counts.admin_profiles, 1);
    assert.equal(report.table_counts.admin_permissions, 1);
    assert.equal(report.table_counts.subscriptions, 1);
    assert.equal(report.table_counts.products, 1);
    assert.equal(report.table_counts.conversations, 1);
    assert.equal(report.table_counts.orders, 1);
    assert.equal(report.table_counts.order_drafts, 1);
    assert.equal(report.table_counts.merchant_channels, 1);
    assert.equal(report.table_counts.saved_answers, 1);
    assert.equal(report.table_counts.training_requests, 1);
    assert.equal(report.table_counts.learned_answers, 1);
    assert.equal(report.table_counts.support_tickets, 1);
    assert.equal(report.table_counts.support_messages, 1);
    assert.equal(report.table_counts.support_inspection_requests, 1);
    assert.equal(report.table_counts.support_preview_sessions, 1);
    assert.equal(report.table_counts.emergency_authorizations, 1);
    assert.equal(report.table_counts.emergency_access_requests, 1);
    assert.equal(report.table_counts.emergency_owner_alerts, 1);
    assert.equal(report.table_counts.emergency_merchant_notices, 1);
    assert.equal(report.table_counts.audit_events, 1);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test("dry-run rejects orphan merchant references without writing", () => {
  const directory = makeDataDirectory();
  try {
    writeJson(directory, "merchants.json", {
      merchants: [],
      subscriptions: [
        {
          id: "subscription-orphan",
          merchant_id: "missing-merchant",
          plan: "silver",
        },
      ],
    });
    writeJson(directory, "bot-runtime.json", {
      products: [
        {
          id: "product-orphan",
          merchant_id: "missing-merchant",
          name: "Orphan product",
        },
      ],
    });

    const before = directorySnapshot(directory);
    const result = runPlanner(directory);
    const after = directorySnapshot(directory);

    assert.equal(result.status, 2, result.stderr || result.stdout);
    assert.deepEqual(after, before, "failed dry-run changed source files");

    const report = JSON.parse(result.stdout);
    assert.equal(report.ok, false);
    assert.equal(report.writes_performed, false);
    assert.equal(report.database_connection_used, false);
    assert.ok(
      report.errors.some((item) => item.code === "ORPHAN_SUBSCRIPTION"),
    );
    assert.ok(
      report.errors.some(
        (item) =>
          item.code === "ORPHAN_MERCHANT_REFERENCE" &&
          item.table === "products",
      ),
    );
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test("dry-run fails safely for invalid JSON", () => {
  const directory = makeDataDirectory();
  try {
    const invalidPath = path.join(directory, "merchants.json");
    fs.writeFileSync(invalidPath, "{ invalid json", "utf8");
    const before = directorySnapshot(directory);

    const result = runPlanner(directory);
    const after = directorySnapshot(directory);

    assert.equal(result.status, 1, result.stderr || result.stdout);
    assert.deepEqual(after, before, "fatal dry-run changed source files");

    const report = JSON.parse(result.stderr);
    assert.equal(report.ok, false);
    assert.equal(report.mode, "dry_run");
    assert.equal(report.writes_performed, false);
    assert.match(report.fatal_error, /SyntaxError/);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});


function runCompletePlanner(directory) {
  const program = [
    'import { buildValidatedMigrationPlan } from "./scripts/lib/postgresql-migration-plan-complete.mjs";',
    'const { report } = buildValidatedMigrationPlan({ dataDirectory: process.argv[1] });',
    'process.stdout.write(JSON.stringify(report));',
    'process.exitCode = report.ok ? 0 : 2;',
  ].join("\n");
  return spawnSync(process.execPath, ["--input-type=module", "-e", program, directory], {
    cwd: repositoryRoot,
    encoding: "utf8",
    env: { ...process.env, DATABASE_URL: "postgresql://must-not-be-used.invalid/fawri" },
  });
}

test("dry-run rejects impossible legacy draft calendar dates without source mutation", () => {
  const directory = makeDataDirectory();
  try {
    createCompleteFixture(directory);
    const runtimePath = path.join(directory, "bot-runtime.json");
    const runtime = JSON.parse(fs.readFileSync(runtimePath, "utf8"));
    runtime.orderDraftsByConversation = {
      "conversation-1": {
        id: "legacy-draft-invalid-calendar",
        merchant_id: "merchant-1",
        customer_id: "customer-1",
        awaiting: "product",
        started_at: "2026-02-30T00:00:00.000Z",
        updated_at: "2026-02-30T00:00:00.000Z",
        expires_at: "2026-03-01T00:00:00.000Z",
      },
    };
    runtime.conversations[0].channel_id = "channel-1";
    writeJson(directory, "bot-runtime.json", runtime);
    writeJson(directory, "fawri-runtime-db.json", { orderDraftsByConversation: runtime.orderDraftsByConversation });
    const before = directorySnapshot(directory);
    const result = runCompletePlanner(directory);
    const after = directorySnapshot(directory);
    assert.equal(result.status, 2, result.stderr || result.stdout);
    assert.deepEqual(after, before, "rejected draft mutated source files");
    const report = JSON.parse(result.stdout);
    assert.equal(report.ok, false);
    assert.equal(report.writes_performed, false);
    assert.equal(report.database_connection_used, false);
    assert.ok(
      report.errors.some((issue) => issue.code === "LEGACY_DRAFT_TIME_PROVENANCE_INVALID"),
      "invalid calendar day must be rejected by the complete migration planner",
    );
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test("dry-run rejects invalid legacy draft clock values without source mutation", () => {
  const directory = makeDataDirectory();
  try {
    createCompleteFixture(directory);
    const runtimePath = path.join(directory, "bot-runtime.json");
    const runtime = JSON.parse(fs.readFileSync(runtimePath, "utf8"));
    runtime.orderDraftsByConversation = {
      "conversation-1": {
        id: "legacy-draft-invalid-clock",
        merchant_id: "merchant-1",
        customer_id: "customer-1",
        awaiting: "product",
        started_at: "2026-02-28T25:00:00.000Z",
        updated_at: "2026-02-28T25:00:00.000Z",
        expires_at: "2026-03-01T00:00:00.000Z",
      },
    };
    runtime.conversations[0].channel_id = "channel-1";
    writeJson(directory, "bot-runtime.json", runtime);
    writeJson(directory, "fawri-runtime-db.json", { orderDraftsByConversation: runtime.orderDraftsByConversation });
    const before = directorySnapshot(directory);
    const result = runCompletePlanner(directory);
    const after = directorySnapshot(directory);
    assert.equal(result.status, 2, result.stderr || result.stdout);
    assert.deepEqual(after, before, "rejected draft mutated source files");
    const report = JSON.parse(result.stdout);
    assert.equal(report.ok, false);
    assert.equal(report.writes_performed, false);
    assert.equal(report.database_connection_used, false);
    assert.ok(
      report.errors.some((issue) => issue.code === "LEGACY_DRAFT_TIME_PROVENANCE_INVALID"),
      "invalid clock hour must be rejected by the complete migration planner",
    );
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test("dry-run rejects invalid legacy draft timezone offsets without source mutation", () => {
  const directory = makeDataDirectory();
  try {
    createCompleteFixture(directory);
    const runtimePath = path.join(directory, "bot-runtime.json");
    const runtime = JSON.parse(fs.readFileSync(runtimePath, "utf8"));
    runtime.orderDraftsByConversation = {
      "conversation-1": {
        id: "legacy-draft-invalid-offset",
        merchant_id: "merchant-1",
        customer_id: "customer-1",
        awaiting: "product",
        started_at: "2026-02-28T12:00:00.000+02:99",
        updated_at: "2026-02-28T12:00:00.000+02:99",
        expires_at: "2026-03-01T00:00:00.000Z",
      },
    };
    runtime.conversations[0].channel_id = "channel-1";
    writeJson(directory, "bot-runtime.json", runtime);
    writeJson(directory, "fawri-runtime-db.json", { orderDraftsByConversation: runtime.orderDraftsByConversation });
    const before = directorySnapshot(directory);
    const result = runCompletePlanner(directory);
    const after = directorySnapshot(directory);
    assert.equal(result.status, 2, result.stderr || result.stdout);
    assert.deepEqual(after, before, "rejected draft mutated source files");
    const report = JSON.parse(result.stdout);
    assert.equal(report.ok, false);
    assert.equal(report.writes_performed, false);
    assert.equal(report.database_connection_used, false);
    assert.ok(
      report.errors.some((issue) => issue.code === "LEGACY_DRAFT_TIME_PROVENANCE_INVALID"),
      "invalid timezone offset must be rejected by the complete migration planner",
    );
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test("dry-run rejects legacy draft last update earlier than creation without source mutation", () => {
  const directory = makeDataDirectory();
  try {
    createCompleteFixture(directory);
    const runtime = JSON.parse(fs.readFileSync(path.join(directory, "bot-runtime.json"), "utf8"));
    runtime.conversations[0].channel_id = "channel-1";
    writeJson(directory, "bot-runtime.json", runtime);
    writeJson(directory, "fawri-runtime-db.json", {
      orderDraftsByConversation: {
        "conversation-1": {
          id: "legacy-draft-reversed-update",
          merchant_id: "merchant-1",
          customer_id: "customer-1",
          awaiting: "product",
          started_at: "2026-02-28T10:00:00.000Z",
          updated_at: "2026-02-28T09:00:00.000Z",
          expires_at: "2026-02-28T13:00:00.000Z",
        },
      },
    });
    const before = directorySnapshot(directory);
    const result = runCompletePlanner(directory);
    assert.deepEqual(directorySnapshot(directory), before, "rejected draft mutated source files");
    assert.equal(result.status, 2, result.stderr || result.stdout);
    const report = JSON.parse(result.stdout);
    assert.equal(report.ok, false);
    assert.equal(report.writes_performed, false);
    assert.equal(report.database_connection_used, false);
    assert.ok(report.errors.some(
      (issue) => issue.code === "LEGACY_DRAFT_TIME_PROVENANCE_INVALID",
    ), "historical update before creation must block migration readiness");
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test("dry-run rejects legacy draft expiry earlier than last update without source mutation", () => {
  const directory = makeDataDirectory();
  try {
    createCompleteFixture(directory);
    const runtime = JSON.parse(fs.readFileSync(path.join(directory, "bot-runtime.json"), "utf8"));
    runtime.conversations[0].channel_id = "channel-1";
    writeJson(directory, "bot-runtime.json", runtime);
    writeJson(directory, "fawri-runtime-db.json", {
      orderDraftsByConversation: {
        "conversation-1": {
          id: "legacy-draft-reversed-expiry",
          merchant_id: "merchant-1",
          customer_id: "customer-1",
          awaiting: "product",
          started_at: "2026-02-28T10:00:00.000Z",
          updated_at: "2026-02-28T12:00:00.000Z",
          expires_at: "2026-02-28T11:00:00.000Z",
        },
      },
    });
    const before = directorySnapshot(directory);
    const result = runCompletePlanner(directory);
    assert.deepEqual(directorySnapshot(directory), before, "rejected draft mutated source files");
    assert.equal(result.status, 2, result.stderr || result.stdout);
    const report = JSON.parse(result.stdout);
    assert.equal(report.ok, false);
    assert.equal(report.writes_performed, false);
    assert.equal(report.database_connection_used, false);
    assert.ok(report.errors.some(
      (issue) => issue.code === "LEGACY_DRAFT_TIME_PROVENANCE_INVALID",
    ), "historical expiry before last update must block migration readiness");
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test("dry-run blocks legacy drafts when channel ownership is unverified", () => {
  const directory = makeDataDirectory();
  try {
    createCompleteFixture(directory);
    const runtime = JSON.parse(fs.readFileSync(path.join(directory, "bot-runtime.json"), "utf8"));
    runtime.conversations[0].channel_id = "channel-not-in-source";
    writeJson(directory, "bot-runtime.json", runtime);
    runtime.orderDraftsByConversation = {
      "conversation-1": {
        id: "legacy-draft-channel-unverified",
        merchant_id: "merchant-1",
        customer_id: "customer-1",
        awaiting: "product",
        started_at: "2026-02-28T12:00:00.000Z",
        updated_at: "2026-02-28T12:00:00.000Z",
        expires_at: "2026-03-01T00:00:00.000Z",
      },
    };
    writeJson(directory, "fawri-runtime-db.json", {
      orderDraftsByConversation: runtime.orderDraftsByConversation,
    });
    const before = directorySnapshot(directory);
    const result = runCompletePlanner(directory);
    assert.deepEqual(directorySnapshot(directory), before, "rejected draft mutated source files");
    assert.equal(result.status, 2, result.stderr || result.stdout);
    const report = JSON.parse(result.stdout);
    assert.equal(report.ok, false);
    assert.equal(report.writes_performed, false);
    assert.equal(report.database_connection_used, false);
    assert.ok(report.errors.some(
      (issue) => issue.code === "LEGACY_DRAFT_CHANNEL_OWNERSHIP_UNVERIFIED",
    ), "draft without proven merchant channel must block migration");
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test("dry-run blocks legacy drafts when channel belongs to another merchant", () => {
  const directory = makeDataDirectory();
  try {
    createCompleteFixture(directory);
    const runtime = JSON.parse(fs.readFileSync(path.join(directory, "bot-runtime.json"), "utf8"));
    runtime.conversations[0].channel_id = "channel-1";
    runtime.metaPages[0].merchant_id = "admin-1";
    writeJson(directory, "bot-runtime.json", runtime);
    writeJson(directory, "fawri-runtime-db.json", {
      orderDraftsByConversation: {
        "conversation-1": {
          id: "legacy-draft-foreign-channel",
          merchant_id: "merchant-1",
          customer_id: "customer-1",
          awaiting: "product",
          started_at: "2026-02-28T12:00:00.000Z",
          updated_at: "2026-02-28T12:00:00.000Z",
          expires_at: "2026-03-01T00:00:00.000Z",
        },
      },
    });
    const before = directorySnapshot(directory);
    const result = runCompletePlanner(directory);
    assert.deepEqual(directorySnapshot(directory), before, "rejected draft mutated source files");
    assert.equal(result.status, 2, result.stderr || result.stdout);
    const report = JSON.parse(result.stdout);
    assert.equal(report.ok, false);
    assert.equal(report.writes_performed, false);
    assert.equal(report.database_connection_used, false);
    assert.ok(report.errors.some(
      (issue) => issue.code === "LEGACY_DRAFT_CHANNEL_OWNERSHIP_UNVERIFIED",
    ), "draft must not inherit a channel owned by another merchant");
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test("dry-run rejects legacy draft without historical expiry even with verified channel", () => {
  const directory = makeDataDirectory();
  try {
    createCompleteFixture(directory);
    const runtime = JSON.parse(fs.readFileSync(path.join(directory, "bot-runtime.json"), "utf8"));
    runtime.conversations[0].channel_id = "channel-1";
    writeJson(directory, "bot-runtime.json", runtime);
    writeJson(directory, "fawri-runtime-db.json", {
      orderDraftsByConversation: {
        "conversation-1": {
          id: "legacy-draft-expiry-unproven",
          merchant_id: "merchant-1",
          customer_id: "customer-1",
          awaiting: "product",
          started_at: "2026-02-28T12:00:00.000Z",
          updated_at: "2026-02-28T12:00:00.000Z",
        },
      },
    });
    const before = directorySnapshot(directory);
    const result = runCompletePlanner(directory);
    assert.deepEqual(directorySnapshot(directory), before, "rejected draft mutated source files");
    assert.equal(result.status, 2, result.stderr || result.stdout);
    const report = JSON.parse(result.stdout);
    assert.equal(report.ok, false);
    assert.equal(report.writes_performed, false);
    assert.equal(report.database_connection_used, false);
    assert.ok(report.errors.some(
      (issue) => issue.code === "LEGACY_DRAFT_TIME_PROVENANCE_INVALID",
    ), "planner must not invent historical expiry from current TTL configuration");
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test("dry-run rejects duplicate conversation drafts with different IDs", () => {
  const directory = makeDataDirectory();
  try {
    createCompleteFixture(directory);
    const runtime = JSON.parse(fs.readFileSync(path.join(directory, "bot-runtime.json"), "utf8"));
    runtime.conversations[0].channel_id = "channel-1";
    writeJson(directory, "bot-runtime.json", runtime);
    writeJson(directory, "fawri-runtime-db.json", {
      orderDraftsByConversation: {
        "conversation-1": {
          id: "legacy-draft-conflicting-id",
          merchant_id: "merchant-1",
          customer_id: "customer-1",
          awaiting: "product",
          started_at: "2026-02-28T12:00:00.000Z",
          updated_at: "2026-02-28T12:00:00.000Z",
          expires_at: "2026-03-01T00:00:00.000Z",
        },
      },
    });
    const before = directorySnapshot(directory);
    const result = runCompletePlanner(directory);
    assert.deepEqual(directorySnapshot(directory), before, "rejected draft mutated source files");
    assert.equal(result.status, 2, result.stderr || result.stdout);
    const report = JSON.parse(result.stdout);
    assert.equal(report.ok, false);
    assert.equal(report.writes_performed, false);
    assert.equal(report.database_connection_used, false);
    assert.ok(report.errors.some(
      (issue) => issue.code === "LEGACY_DRAFT_CONVERSATION_CONFLICT",
    ), "planner must reject distinct draft IDs for the same conversation");
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test("dry-run rejects same-ID conflicting legacy draft state", () => {
  const directory = makeDataDirectory();
  try {
    createCompleteFixture(directory);
    const runtime = JSON.parse(fs.readFileSync(path.join(directory, "bot-runtime.json"), "utf8"));
    runtime.conversations[0].channel_id = "channel-1";
    writeJson(directory, "bot-runtime.json", runtime);
    writeJson(directory, "fawri-runtime-db.json", {
      orderDraftsByConversation: {
        "conversation-1": {
          id: "draft-1",
          merchant_id: "merchant-1",
          customer_id: "customer-1",
          awaiting: "product",
          started_at: "2026-02-28T12:00:00.000Z",
          updated_at: "2026-02-28T12:00:00.000Z",
          expires_at: "2026-03-01T00:00:00.000Z",
        },
      },
    });
    const before = directorySnapshot(directory);
    const result = runCompletePlanner(directory);
    assert.deepEqual(directorySnapshot(directory), before, "rejected draft mutated source files");
    assert.equal(result.status, 2, result.stderr || result.stdout);
    const report = JSON.parse(result.stdout);
    assert.equal(report.ok, false);
    assert.equal(report.writes_performed, false);
    assert.equal(report.database_connection_used, false);
    assert.ok(report.errors.some(
      (issue) => issue.code === "DUPLICATE_TARGET_IDENTITY_CONFLICT",
    ), "planner must reject a conflicting legacy payload for the same draft ID");
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});
