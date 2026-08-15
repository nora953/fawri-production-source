import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { buildValidatedMigrationPlan } from "../lib/postgresql-migration-plan.mjs";

function makeDataDirectory() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "fawri-legacy-normalization-"));
}

function writeJson(directory, fileName, value) {
  fs.writeFileSync(
    path.join(directory, fileName),
    `${JSON.stringify(value, null, 2)}\n`,
    "utf8",
  );
}

function writeFixture(directory, emergencyStatus = "expired") {
  writeJson(directory, "merchants.json", {
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
        created_at: "2026-08-01T00:00:00.000Z",
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
        language: "ar",
        otp_verified: true,
        created_at: "2026-08-01T00:00:00.000Z",
      },
    ],
    subscriptions: [
      {
        id: "subscription-1",
        merchant_id: "merchant-1",
        plan_name: "silver",
        status: "active",
        price_iqd: 25000,
        billing_anchor_day: 2,
        base_reply_limit: 4000,
        base_replies_used: 0,
        base_replies_remaining: 4000,
        start_date: "2026-08-02T11:47:00.782Z",
        expires_at: "2026-09-02T11:47:00.782Z",
      },
    ],
    support_tickets: [
      {
        id: "ticket-1",
        merchant_id: "merchant-1",
        subject: "Legacy support ticket",
        category: "technical",
        status: "closed",
        messages: [
          {
            id: "system-message-1",
            sender_type: "system",
            sender_id: "system",
            sender_name: "Fawri",
            body: "Ticket closed automatically.",
            created_at: "2026-08-03T00:00:00.000Z",
          },
        ],
      },
    ],
  });

  writeJson(directory, "emergency-read-access.json", {
    requests: [
      {
        id: "emergency-request-1",
        merchant_id: "merchant-1",
        requested_by_admin_id: "admin-1",
        incident_reference: "INC-LEGACY-001",
        severity: "high",
        reason: "Legacy emergency read-only diagnostic session.",
        duration_minutes: 15,
        read_only: true,
        status: emergencyStatus,
        activation_mode: "owner_approval",
        admin_session_id: "legacy-session-that-is-not-migrated",
        requested_at: "2026-08-03T00:00:00.000Z",
        reviewed_by_owner_id: "admin-1",
        reviewed_at: "2026-08-03T00:01:00.000Z",
        started_at: "2026-08-03T00:01:00.000Z",
        expires_at: "2026-08-03T00:16:00.000Z",
        ...(emergencyStatus === "active"
          ? {}
          : {
              ended_at: "2026-08-03T00:16:00.000Z",
              end_reason: "duration_expired",
            }),
      },
    ],
  });
}

test("validated migration normalizes legacy terminal records without losing durable business history", () => {
  const directory = makeDataDirectory();
  try {
    writeFixture(directory, "expired");
    const { report } = buildValidatedMigrationPlan({
      dataDirectory: directory,
      includeRows: true,
    });

    assert.equal(report.ok, true, JSON.stringify(report.errors));
    assert.equal(report.rows.subscriptions[0].starts_at, "2026-08-02T11:47:00.782Z");
    assert.equal(report.rows.support_messages[0].sender_type, "system");
    assert.equal(report.rows.support_messages[0].sender_account_id, null);
    assert.equal(report.rows.emergency_access_requests[0].status, "expired");
    assert.equal(report.rows.emergency_access_requests[0].admin_session_id, null);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test("validated migration remains fail-closed for an active emergency request bound to an unmigrated login session", () => {
  const directory = makeDataDirectory();
  try {
    writeFixture(directory, "active");
    const { report } = buildValidatedMigrationPlan({
      dataDirectory: directory,
      includeRows: true,
    });

    assert.equal(report.ok, false);
    assert.equal(
      report.rows.emergency_access_requests[0].admin_session_id,
      "legacy-session-that-is-not-migrated",
    );
    assert.ok(
      report.errors.some(
        (error) =>
          error.code === "ORPHAN_TARGET_REFERENCE" &&
          error.table === "emergency_access_requests" &&
          error.foreign_key ===
            "emergency_access_requests_admin_session_id_account_sessions_id_fk",
      ),
      JSON.stringify(report.errors),
    );
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});
