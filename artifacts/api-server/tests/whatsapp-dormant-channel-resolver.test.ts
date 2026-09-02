import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  resolveDormantWhatsAppChannelWithClient,
} from "../src/services/whatsappDormantChannelResolver";
import type { OperationalSqlClient } from "../src/services/operationalPostgresAuthority";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "../../..");

function row(overrides: Record<string, unknown> = {}) {
  return {
    id: "channel-1",
    merchant_id: "merchant-123",
    platform: "whatsapp",
    status: "pending",
    version: 2,
    whatsapp_business_account_id: "1234567890",
    whatsapp_phone_number_id: "9876543210",
    whatsapp_display_phone_number: "+964 770 000 0000",
    credential_ciphertext: null,
    credential_nonce: null,
    credential_auth_tag: null,
    credential_key_id: null,
    credential_algorithm: null,
    credential_expires_at: null,
    webhook_subscribed_at: null,
    last_webhook_at: null,
    connected_at: null,
    metadata: { integration_mode: "dormant_offline" },
    ...overrides,
  };
}

function clientWith(rows: Record<string, unknown>[]): OperationalSqlClient {
  return {
    async query<T extends Record<string, unknown>>(
      sql: string,
      values: unknown[] = [],
    ) {
      assert.match(sql, /platform = 'whatsapp'/);
      assert.match(sql, /whatsapp_business_account_id = \$1/);
      assert.match(sql, /whatsapp_phone_number_id = \$2/);
      assert.deepEqual(values, ["1234567890", "9876543210"]);
      return { rows: rows as T[] };
    },
  };
}

test("resolves exactly one dormant WABA and phone-number mapping", async () => {
  const result = await resolveDormantWhatsAppChannelWithClient(clientWith([row()]), {
    wabaId: "1234567890",
    phoneNumberId: "9876543210",
  });
  assert.deepEqual(result, {
    id: "channel-1",
    merchant_id: "merchant-123",
    platform: "whatsapp",
    status: "pending",
    version: 2,
    waba_id: "1234567890",
    phone_number_id: "9876543210",
    display_phone_number: "+964 770 000 0000",
    integration_mode: "dormant_offline",
  });
});

test("fails closed when the external identity is unmapped or ambiguous", async () => {
  await assert.rejects(
    () =>
      resolveDormantWhatsAppChannelWithClient(clientWith([]), {
        wabaId: "1234567890",
        phoneNumberId: "9876543210",
      }),
    (error: unknown) =>
      (error as { code?: string }).code === "WHATSAPP_CHANNEL_NOT_MAPPED",
  );
  await assert.rejects(
    () =>
      resolveDormantWhatsAppChannelWithClient(clientWith([row(), row({ id: "channel-2" })]), {
        wabaId: "1234567890",
        phoneNumberId: "9876543210",
      }),
    (error: unknown) =>
      (error as { code?: string }).code === "WHATSAPP_CHANNEL_MAPPING_AMBIGUOUS",
  );
});

test("rejects a mapped row that contains any live integration state", async () => {
  for (const override of [
    { status: "connected" },
    { credential_ciphertext: "ciphertext" },
    { webhook_subscribed_at: new Date().toISOString() },
    { last_webhook_at: new Date().toISOString() },
    { connected_at: new Date().toISOString() },
    { metadata: { integration_mode: "live" } },
  ]) {
    await assert.rejects(
      () =>
        resolveDormantWhatsAppChannelWithClient(clientWith([row(override)]), {
          wabaId: "1234567890",
          phoneNumberId: "9876543210",
        }),
      (error: unknown) => {
        const code = (error as { code?: string }).code;
        return (
          code === "WHATSAPP_DORMANT_STATE_VIOLATION" ||
          code === "WHATSAPP_CHANNEL_MODE_INVALID"
        );
      },
    );
  }
});

test("rejects malformed provider identifiers before database use", async () => {
  let queried = false;
  const client: OperationalSqlClient = {
    async query<T extends Record<string, unknown>>() {
      queried = true;
      return { rows: [] as T[] };
    },
  };
  await assert.rejects(
    () =>
      resolveDormantWhatsAppChannelWithClient(client, {
        wabaId: "bad",
        phoneNumberId: "9876543210",
      }),
    (error: unknown) =>
      (error as { code?: string }).code === "WHATSAPP_CHANNEL_IDENTITY_INVALID",
  );
  assert.equal(queried, false);
});

test("resolver never exposes transport or credential capability", () => {
  const source = fs.readFileSync(
    path.join(
      repoRoot,
      "artifacts/api-server/src/services/whatsappDormantChannelResolver.ts",
    ),
    "utf8",
  );
  assert.doesNotMatch(source, /\bfetch\s*\(/);
  assert.doesNotMatch(source, /graph\.facebook\.com/i);
  assert.doesNotMatch(source, /Bearer\s/i);
  assert.doesNotMatch(source, /access[_-]?token/i);
  assert.doesNotMatch(source, /app[_-]?secret/i);
});
