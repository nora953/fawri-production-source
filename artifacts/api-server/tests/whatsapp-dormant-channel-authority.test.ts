import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  persistDormantWhatsAppChannelWithClient,
} from "../src/services/whatsappDormantChannelAuthority";
import type { OperationalSqlClient } from "../src/services/operationalPostgresAuthority";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "../../..");

function row(overrides: Record<string, unknown> = {}) {
  return {
    id: "e9e25333be84dc45cebe985daaa88f10",
    merchant_id: "merchant-123",
    platform: "whatsapp",
    status: "pending",
    version: 1,
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

function clientFrom(
  handler: (sql: string, values: unknown[]) => Promise<Record<string, unknown>[]>,
): OperationalSqlClient {
  return {
    async query<T extends Record<string, unknown>>(
      sql: string,
      values: unknown[] = [],
    ) {
      return { rows: (await handler(sql, values)) as T[] };
    },
  };
}

const input = {
  merchantId: "merchant-123",
  wabaId: "1234567890",
  phoneNumberId: "9876543210",
  displayPhoneNumber: "+964 770 000 0000",
};

test("persists only a pending credential-free WhatsApp identity with explicit dormant metadata", async () => {
  const queries: Array<{ sql: string; values: unknown[] }> = [];
  const client = clientFrom(async (sql, values) => {
    queries.push({ sql, values });
    assert.match(sql, /INSERT INTO merchant_channels/);
    assert.match(sql, /'whatsapp'::channel_platform/);
    assert.match(sql, /'pending'::channel_status/);
    assert.match(sql, /metadata/);
    return [row({ id: String(values[0]) })];
  });

  const result = await persistDormantWhatsAppChannelWithClient(client, input);
  assert.equal(queries.length, 1);
  assert.deepEqual(result, {
    id: String(queries[0].values[0]),
    merchant_id: "merchant-123",
    platform: "whatsapp",
    status: "pending",
    version: 1,
    waba_id: "1234567890",
    phone_number_id: "9876543210",
    display_phone_number: "+964 770 000 0000",
    integration_mode: "dormant_offline",
  });
  assert.equal(
    queries[0].values.includes(JSON.stringify({ integration_mode: "dormant_offline" })),
    true,
  );
  assert.equal(queries[0].values.includes("active"), false);
  assert.equal(queries[0].values.includes("connected"), false);
});

test("reconciles an idempotent dormant registration without creating a second row", async () => {
  let call = 0;
  let expectedId = "";
  const client = clientFrom(async (sql, values) => {
    call += 1;
    if (call === 1) {
      expectedId = String(values[0]);
      assert.match(sql, /ON CONFLICT \(id\) DO NOTHING/);
      return [];
    }
    assert.match(sql, /FOR UPDATE/);
    assert.match(sql, /metadata/);
    assert.deepEqual(values, ["merchant-123", expectedId]);
    return [row({ id: expectedId })];
  });

  const result = await persistDormantWhatsAppChannelWithClient(client, input);
  assert.equal(call, 2);
  assert.equal(result.id, expectedId);
  assert.equal(result.status, "pending");
});

test("fails closed if a supposedly dormant row contains live state", async () => {
  const client = clientFrom(async (_sql, values) => [
    row({
      id: String(values[0]),
      status: "connected",
      webhook_subscribed_at: new Date().toISOString(),
    }),
  ]);

  await assert.rejects(
    () => persistDormantWhatsAppChannelWithClient(client, input),
    (error: unknown) =>
      (error as { code?: string }).code === "WHATSAPP_DORMANT_STATE_VIOLATION",
  );
});

test("missing or non-dormant integration metadata fails closed", async () => {
  for (const metadata of [null, {}, { integration_mode: "live" }]) {
    const client = clientFrom(async (_sql, values) => [
      row({ id: String(values[0]), metadata }),
    ]);
    await assert.rejects(
      () => persistDormantWhatsAppChannelWithClient(client, input),
      (error: unknown) =>
        (error as { code?: string }).code === "WHATSAPP_CHANNEL_MODE_INVALID",
    );
  }
});

test("unsafe stored display number and conflicting display identity fail closed", async () => {
  const unsafe = clientFrom(async (_sql, values) => [
    row({ id: String(values[0]), whatsapp_display_phone_number: "bad\nvalue" }),
  ]);
  await assert.rejects(
    () => persistDormantWhatsAppChannelWithClient(unsafe, input),
    (error: unknown) =>
      (error as { code?: string }).code === "WHATSAPP_CHANNEL_STATE_INVALID",
  );

  const conflicting = clientFrom(async (_sql, values) => [
    row({ id: String(values[0]), whatsapp_display_phone_number: "+964 780 000 0000" }),
  ]);
  await assert.rejects(
    () => persistDormantWhatsAppChannelWithClient(conflicting, input),
    (error: unknown) =>
      (error as { code?: string }).code === "WHATSAPP_CHANNEL_MAPPING_CONFLICT",
  );
});

test("maps unique phone-number collisions without exposing another merchant", async () => {
  const client = clientFrom(async () => {
    throw Object.assign(new Error("duplicate key"), {
      code: "23505",
      detail: "hidden",
    });
  });

  await assert.rejects(
    () => persistDormantWhatsAppChannelWithClient(client, input),
    (error: unknown) => {
      const typed = error as { code?: string; message?: string };
      return (
        typed.code === "WHATSAPP_PHONE_NUMBER_ALREADY_MAPPED" &&
        typed.message === "WhatsApp phone number identity is already assigned"
      );
    },
  );
});

test("dormant authority has no provider transport or credential input path", () => {
  const source = fs.readFileSync(
    path.join(
      repoRoot,
      "artifacts/api-server/src/services/whatsappDormantChannelAuthority.ts",
    ),
    "utf8",
  );
  assert.doesNotMatch(source, /\bfetch\s*\(/);
  assert.doesNotMatch(source, /graph\.facebook\.com/i);
  assert.doesNotMatch(source, /Bearer\s/i);
  assert.doesNotMatch(source, /access[_-]?token/i);
  assert.doesNotMatch(source, /app[_-]?secret/i);
});

test("legacy Meta channel listing excludes dormant WhatsApp rows", () => {
  const source = fs.readFileSync(
    path.join(
      repoRoot,
      "artifacts/api-server/src/services/postgresMetaChannelAuthority.ts",
    ),
    "utf8",
  );
  assert.match(
    source,
    /WHERE merchant_id = \$1\s+AND platform IN \('messenger', 'instagram'\)\s+ORDER BY updated_at DESC, id/,
  );
});
