import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { AuthAccountRepository } from "../src/services/authAccountRepository";

test("account identity is separated from merchant/admin profiles and cross-login fails", () => {
  const directory = mkdtempSync(path.join(os.tmpdir(), "fawri-auth-accounts-"));
  const filePath = path.join(directory, "merchants.json");
  try {
    writeFileSync(filePath, JSON.stringify({
      merchants: [
        {
          id: "merchant-a",
          owner_name: "Merchant Owner",
          store_name: "Store A",
          phone: "07111111111",
          password: "merchant-hash",
          activity_type: "retail",
          status: "approved",
          account_status: "approved",
          otp_verified: true,
          language: "en",
          created_at: "2026-08-01T00:00:00.000Z"
        },
        {
          id: "admin-a",
          owner_name: "Assistant",
          store_name: "Fawri Admin",
          phone: "07222222222",
          password: "admin-hash",
          activity_type: "admin",
          status: "approved",
          is_admin: true,
          admin_role: "assistant_admin",
          admin_enabled: true,
          otp_verified: true,
          permissions: ["view_logs"],
          language: "en",
          created_at: "2026-08-01T00:00:00.000Z"
        },
        {
          id: "owner-a",
          owner_name: "Owner",
          phone: "07333333333",
          password: "owner-hash",
          status: "approved",
          is_admin: true,
          admin_role: "owner_admin",
          admin_enabled: true,
          otp_verified: true,
          created_at: "2026-08-01T00:00:00.000Z"
        }
      ],
      otps: []
    }), "utf8");
    const repository = new AuthAccountRepository(filePath);
    const merchant = repository.findByPhone("07111111111", "merchant");
    assert.ok(merchant?.merchantProfile);
    assert.equal(merchant?.adminProfile, undefined);
    assert.equal(repository.findByPhone("07111111111", "admin"), null);
    const merchantVersion = merchant!.account.sessionVersion;
    assert.equal(
      repository.updatePassword("merchant-a", "merchant", "merchant-new-hash"),
      true,
    );
    assert.equal(
      repository.findById("merchant-a", "merchant")?.account.sessionVersion,
      merchantVersion + 1,
    );

    const assistant = repository.findByPhone("07222222222", "admin");
    assert.ok(assistant?.adminProfile);
    assert.equal(assistant?.merchantProfile, undefined);
    assert.equal(repository.findByPhone("07222222222", "merchant"), null);

    const beforeVersion = assistant!.account.sessionVersion;
    assert.equal(repository.setAssistantPermissions("admin-a", ["manage_support"]), true);
    const updated = repository.findById("admin-a", "admin")!;
    assert.deepEqual(updated.adminProfile?.permissions, ["manage_support"]);
    assert.equal(updated.account.sessionVersion, beforeVersion + 1);
    assert.equal(repository.setAssistantPermissions("owner-a", ["manage_support"]), false);

    const created = repository.createAssistantAdmin({
      ownerName: "New Assistant",
      phone: "07555555555",
      passwordHash: "temporary-hash",
      language: "ar",
    });
    assert.equal(created.adminProfile?.role, "assistant_admin");
    assert.equal(created.adminProfile?.mustChangePassword, true);
    assert.equal(repository.findByPhone("07555555555", "merchant"), null);
    repository.updatePassword(
      created.account.id,
      "admin",
      "permanent-hash",
      { mustChangePassword: false },
    );
    assert.equal(
      repository.findById(created.account.id, "admin")?.adminProfile?.mustChangePassword,
      false,
    );

    const persisted = JSON.parse(readFileSync(filePath, "utf8"));
    const persistedAssistant = persisted.merchants.find(
      (record: { id: string }) => record.id === "admin-a",
    );
    assert.equal(persistedAssistant.auth_session_version, beforeVersion + 1);
    assert.equal(persistedAssistant.admin_session_version, beforeVersion + 1);
    const persistedMerchant = persisted.merchants.find(
      (record: { id: string }) => record.id === "merchant-a",
    );
    assert.equal(persistedMerchant.auth_session_version, merchantVersion + 1);
    assert.equal(persistedMerchant.admin_session_version, undefined);
    assert.equal(persisted.otps.length, 0);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
