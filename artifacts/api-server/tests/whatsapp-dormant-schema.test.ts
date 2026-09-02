import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "../../..");

function read(relativePath: string): string {
  return fs.readFileSync(path.join(repoRoot, relativePath), "utf8");
}

test("migration adds explicit WhatsApp identity without enabling a live channel", () => {
  const migration = read(
    "lib/db/drizzle/0012_whatsapp_dormant_channel_identity.sql",
  );

  assert.match(migration, /ADD COLUMN "whatsapp_business_account_id" text/);
  assert.match(migration, /ADD COLUMN "whatsapp_phone_number_id" text/);
  assert.match(migration, /ADD COLUMN "whatsapp_display_phone_number" text/);
  assert.match(
    migration,
    /CREATE UNIQUE INDEX "merchant_channels_whatsapp_phone_number_unique"/,
  );
  assert.match(
    migration,
    /CONSTRAINT "merchant_channels_whatsapp_identity_scope_check"/,
  );
  assert.match(
    migration,
    /CONSTRAINT "merchant_channels_whatsapp_dormant_only_check"/,
  );
  assert.match(migration, /"merchant_channels"\."status" = 'pending'/);
  assert.match(migration, /"merchant_channels"\."platform" <> 'whatsapp'/);
  assert.match(migration, /"merchant_channels"\."webhook_subscribed_at" IS NULL/);
  assert.match(migration, /"merchant_channels"\."connected_at" IS NULL/);
  assert.match(migration, /"merchant_channels"\."credential_ciphertext" IS NULL/);
});

test("Drizzle channel schema mirrors the dormant WhatsApp database boundary", () => {
  const schema = read("lib/db/src/schema/channels.ts");

  assert.match(
    schema,
    /whatsappBusinessAccountId: text\("whatsapp_business_account_id"\)/,
  );
  assert.match(
    schema,
    /whatsappPhoneNumberId: text\("whatsapp_phone_number_id"\)/,
  );
  assert.match(
    schema,
    /whatsappDisplayPhoneNumber: text\("whatsapp_display_phone_number"\)/,
  );
  assert.match(schema, /merchant_channels_whatsapp_phone_number_unique/);
  assert.match(schema, /merchant_channels_whatsapp_identity_pair_check/);
  assert.match(schema, /merchant_channels_whatsapp_identity_format_check/);
  assert.match(schema, /merchant_channels_whatsapp_identity_scope_check/);
  assert.match(schema, /merchant_channels_whatsapp_channel_shape_check/);
  assert.match(schema, /merchant_channels_whatsapp_dormant_only_check/);
});

test("migration stage preserves the preimage and journal order", () => {
  const stage = JSON.parse(
    read("lib/db/migration-stages/0012/stage.json"),
  ) as { index?: number; name?: string; preimage_files?: unknown[] };
  assert.equal(stage.index, 12);
  assert.equal(stage.name, "whatsapp_dormant_channel_identity");
  assert.deepEqual(stage.preimage_files, ["channels.ts"]);

  const preimage = read(
    "lib/db/migration-stages/0012/preimage/channels.ts",
  );
  assert.equal(preimage.includes("whatsappBusinessAccountId"), false);
  assert.equal(preimage.includes("whatsapp_phone_number_id"), false);

  const journal = JSON.parse(read("lib/db/drizzle/meta/_journal.json")) as {
    entries?: Array<{ idx?: number; tag?: string }>;
  };
  const latest = journal.entries?.at(-1);
  assert.equal(latest?.idx, 12);
  assert.equal(latest?.tag, "0012_whatsapp_dormant_channel_identity");
});

test("existing channel platform enum already owns the WhatsApp platform value", () => {
  const enums = read("lib/db/src/schema/enums.ts");
  assert.match(
    enums,
    /channelPlatformEnum[\s\S]*"whatsapp"/,
  );
});
