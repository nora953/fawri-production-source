import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  AuthSecurityStore,
  AuthSecurityStoreError,
} from "../src/services/authSecurityStore";

function fixture(options: Record<string, unknown> = {}) {
  const directory = mkdtempSync(path.join(os.tmpdir(), "fawri-auth-security-"));
  const filePath = path.join(directory, "auth-security.json");
  let now = Date.parse("2026-08-07T00:00:00.000Z");
  const store = new AuthSecurityStore({
    filePath,
    secret: "test-auth-security-secret-that-is-long-enough",
    now: () => now,
    sessionTtlMs: 1_000,
    sessionAbsoluteTtlMs: 5_000,
    sessionRotationMs: 500,
    otpTtlMs: 2_000,
    otpResendMs: 100,
    otpMaxAttempts: 3,
    ...options,
  });
  return {
    directory,
    filePath,
    store,
    advance(milliseconds: number) { now += milliseconds; },
    cleanup() { rmSync(directory, { recursive: true, force: true }); },
  };
}

test("sessions rotate, revoke immediately, expire, and reject role/device confusion", () => {
  const f = fixture();
  try {
    const issued = f.store.issueSession({
      accountId: "merchant-a",
      accountKind: "merchant",
      tenantId: "merchant-a",
      accountVersion: 4,
      deviceId: "device-a-1234567890",
      deviceLabel: "Phone A",
    });
    assert.equal(f.store.validateSession({
      token: issued.token,
      expectedKind: "merchant",
      deviceId: "device-a-1234567890",
    })?.session.account_id, "merchant-a");
    assert.equal(f.store.validateSession({
      token: issued.token,
      expectedKind: "admin",
      deviceId: "device-a-1234567890",
    }), null);
    assert.equal(f.store.validateSession({
      token: issued.token,
      expectedKind: "merchant",
      deviceId: "stolen-device-123456",
    }), null);

    f.advance(600);
    const rotated = f.store.rotateSession({
      token: issued.token,
      expectedKind: "merchant",
      deviceId: "device-a-1234567890",
    });
    assert.ok(rotated);
    assert.notEqual(rotated.token, issued.token);
    assert.equal(f.store.validateSession({
      token: issued.token,
      expectedKind: "merchant",
      deviceId: "device-a-1234567890",
    }), null);
    assert.ok(f.store.validateSession({
      token: rotated.token,
      expectedKind: "merchant",
      deviceId: "device-a-1234567890",
    }));

    assert.equal(f.store.revokeSession(rotated.token, "logout"), true);
    assert.equal(f.store.validateSession({
      token: rotated.token,
      expectedKind: "merchant",
      deviceId: "device-a-1234567890",
    }), null);

    const expiring = f.store.issueSession({
      accountId: "merchant-a",
      accountKind: "merchant",
      tenantId: "merchant-a",
    });
    f.advance(1_001);
    assert.equal(f.store.validateSession({
      token: expiring.token,
      expectedKind: "merchant",
    }), null);
  } finally {
    f.cleanup();
  }
});

test("logout-all and trusted-device revocation invalidate the next request", () => {
  const f = fixture({ sessionTtlMs: 10_000 });
  try {
    const device = f.store.registerDevice({
      accountId: "admin-a",
      accountKind: "admin",
      deviceId: "admin-device-123456",
      deviceLabel: "Admin laptop",
    });
    f.store.setDeviceTrust({
      deviceRecordId: device.id,
      trusted: true,
      actorAccountId: "owner-a",
    });
    const first = f.store.issueSession({
      accountId: "admin-a",
      accountKind: "admin",
      tenantId: "admin-a",
      adminRole: "assistant_admin",
      deviceId: "admin-device-123456",
    });
    const second = f.store.issueSession({
      accountId: "admin-a",
      accountKind: "admin",
      tenantId: "admin-a",
      adminRole: "assistant_admin",
      deviceId: "admin-device-123456",
    });
    assert.equal(f.store.revokeAllSessions({
      accountId: "admin-a",
      accountKind: "admin",
      reason: "logout_all",
    }), 2);
    assert.equal(f.store.validateSession({
      token: first.token,
      expectedKind: "admin",
      deviceId: "admin-device-123456",
    }), null);
    assert.equal(f.store.validateSession({
      token: second.token,
      expectedKind: "admin",
      deviceId: "admin-device-123456",
    }), null);

    const third = f.store.issueSession({
      accountId: "admin-a",
      accountKind: "admin",
      tenantId: "admin-a",
      adminRole: "assistant_admin",
      deviceId: "admin-device-123456",
    });
    f.store.setDeviceTrust({
      deviceRecordId: device.id,
      trusted: false,
      actorAccountId: "owner-a",
    });
    assert.equal(f.store.validateSession({
      token: third.token,
      expectedKind: "admin",
      deviceId: "admin-device-123456",
    }), null);
  } finally {
    f.cleanup();
  }
});

test("OTP challenges are single-use, attempt-limited, and superseded on resend", () => {
  const f = fixture();
  try {
    const first = f.store.issueOtpChallenge({
      target: "07111111111",
      purpose: "password_reset",
      ip: "127.0.0.1",
    });
    f.advance(101);
    const replacement = f.store.issueOtpChallenge({
      target: "07111111111",
      purpose: "password_reset",
      ip: "127.0.0.1",
    });
    assert.equal(f.store.verifyOtpChallenge({
      challengeId: first.challengeId,
      target: "07111111111",
      purpose: "password_reset",
      code: first.code,
      ip: "127.0.0.1",
    }), "invalid");
    assert.equal(f.store.verifyOtpChallenge({
      challengeId: replacement.challengeId,
      target: "07111111111",
      purpose: "password_reset",
      code: replacement.code,
      ip: "127.0.0.1",
    }), "verified");
    assert.equal(f.store.verifyOtpChallenge({
      challengeId: replacement.challengeId,
      target: "07111111111",
      purpose: "password_reset",
      code: replacement.code,
      ip: "127.0.0.1",
    }), "used");

    f.advance(101);
    const locked = f.store.issueOtpChallenge({
      target: "07222222222",
      purpose: "signup",
      ip: "127.0.0.2",
    });
    for (let attempt = 0; attempt < 2; attempt += 1) {
      assert.equal(f.store.verifyOtpChallenge({
        challengeId: locked.challengeId,
        target: "07222222222",
        purpose: "signup",
        code: "000000",
        ip: "127.0.0.2",
      }), "invalid");
    }
    assert.equal(f.store.verifyOtpChallenge({
      challengeId: locked.challengeId,
      target: "07222222222",
      purpose: "signup",
      code: "000000",
      ip: "127.0.0.2",
    }), "locked");
    assert.equal(f.store.verifyOtpChallenge({
      challengeId: locked.challengeId,
      target: "07222222222",
      purpose: "signup",
      code: locked.code,
      ip: "127.0.0.2",
    }), "locked");
  } finally {
    f.cleanup();
  }
});

test("security audit drops passwords, OTPs, hashes, and tokens", () => {
  const f = fixture();
  try {
    f.store.audit({
      event_type: "sensitive_test",
      actor_account_id: "merchant-a",
      actor_kind: "merchant",
      metadata: {
        password: "NeverLog1",
        otp_code: "123456",
        token_hash: "secret",
        result: "denied",
        attempt_count: 2,
      },
    });
    const event = f.store.readAuditEvents()[0];
    assert.deepEqual(event.metadata, { result: "denied", attempt_count: 2 });
  } finally {
    f.cleanup();
  }
});

test("a corrupted security store fails closed instead of resetting revocations", () => {
  const f = fixture();
  try {
    writeFileSync(f.filePath, "{not-json", "utf8");
    assert.throws(
      () => f.store.listActiveSessions("merchant-a", "merchant"),
      /refusing to reset security state/,
    );
    assert.equal(readFileSync(f.filePath, "utf8"), "{not-json");
  } finally {
    f.cleanup();
  }
});

test("login and OTP issuance rate limits stop credential and delivery flooding", () => {
  const f = fixture({ otpResendMs: 10 });
  try {
    for (let attempt = 0; attempt < 5; attempt += 1) {
      assert.deepEqual(f.store.checkLoginAllowed({
        target: "07111111111",
        accountKind: "merchant",
        ip: "10.0.0.1",
      }), { allowed: true });
      f.store.recordLoginAttempt({
        target: "07111111111",
        accountKind: "merchant",
        ip: "10.0.0.1",
        success: false,
        reason: "invalid_credentials",
      });
    }
    assert.equal(f.store.checkLoginAllowed({
      target: "07111111111",
      accountKind: "merchant",
      ip: "10.0.0.1",
    }).allowed, false);

    for (let issue = 0; issue < 5; issue += 1) {
      f.store.issueOtpChallenge({
        target: "07444444444",
        purpose: "password_reset",
        ip: "10.0.0.2",
      });
      f.advance(11);
    }
    assert.throws(
      () => f.store.issueOtpChallenge({
        target: "07444444444",
        purpose: "password_reset",
        ip: "10.0.0.2",
      }),
      /OTP_TARGET_RATE_LIMITED/,
    );
  } finally {
    f.cleanup();
  }
});

test("trusted devices are capped per account", () => {
  const f = fixture();
  try {
    const first = f.store.registerDevice({
      accountId: "admin-limit",
      accountKind: "admin",
      deviceId: "admin-device-first-1234",
      deviceLabel: "First",
    });
    const second = f.store.registerDevice({
      accountId: "admin-limit",
      accountKind: "admin",
      deviceId: "admin-device-second-123",
      deviceLabel: "Second",
    });
    const third = f.store.registerDevice({
      accountId: "admin-limit",
      accountKind: "admin",
      deviceId: "admin-device-third-1234",
      deviceLabel: "Third",
    });
    f.store.setDeviceTrust({
      deviceRecordId: first.id,
      trusted: true,
      actorAccountId: "owner-a",
    });
    f.store.setDeviceTrust({
      deviceRecordId: second.id,
      trusted: true,
      actorAccountId: "owner-a",
    });
    assert.throws(
      () => f.store.setDeviceTrust({
        deviceRecordId: third.id,
        trusted: true,
        actorAccountId: "owner-a",
      }),
      (error: unknown) =>
        error instanceof AuthSecurityStoreError &&
        error.code === "TRUSTED_DEVICE_LIMIT_REACHED",
    );
  } finally {
    f.cleanup();
  }
});
