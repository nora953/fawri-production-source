import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const testDirectory = path.dirname(fileURLToPath(import.meta.url));
const apiRoot = path.resolve(testDirectory, "..");
const repositoryRoot = path.resolve(apiRoot, "../..");

function source(relativePath) {
  return fs.readFileSync(path.join(repositoryRoot, relativePath), "utf8");
}

function between(text, startMarker, endMarker) {
  const start = text.indexOf(startMarker);
  const end = text.indexOf(endMarker, start + startMarker.length);
  assert.notEqual(start, -1, `missing source marker: ${startMarker}`);
  assert.notEqual(end, -1, `missing source marker: ${endMarker}`);
  return text.slice(start, end);
}

test("irreversible merchant deletion retires raw Meta/provider identifiers from retained evidence", () => {
  const management = source(
    "artifacts/api-server/src/services/postgresMerchantManagementAuthority.ts",
  );
  const retirement = source(
    "artifacts/api-server/src/services/merchantDeletionProviderIdentifierRetirement.ts",
  );
  const webhookSecurity = source(
    "artifacts/api-server/src/middleware/metaWebhookSecurity.ts",
  );
  const jobsSchema = source("lib/db/src/schema/jobs.ts");
  const channelSchema = source("lib/db/src/schema/channel-messaging.ts");
  const subscriptionSchema = source("lib/db/src/schema/subscriptions.ts");

  assert.match(
    webhookSecurity,
    /return `meta:\$\{pageId\}:\$\{externalId\}`/,
    "Meta event IDs embed the external Page ID and provider event/message ID",
  );
  assert.match(
    jobsSchema,
    /dedupeKey:\s*text\("dedupe_key"\)\.notNull\(\)/,
    "retained durable job rows carry a persistent dedupe key",
  );
  assert.match(
    channelSchema,
    /externalEventId:\s*text\("external_event_id"\)\.notNull\(\)/,
    "channel inbound evidence stores the external event ID",
  );
  assert.match(
    channelSchema,
    /replyReservations[\s\S]*externalEventId:\s*text\("external_event_id"\)\.notNull\(\)/,
    "reply reservations store the external event ID",
  );
  assert.match(
    channelSchema,
    /providerMessageId:\s*text\("provider_message_id"\)/,
    "outbound delivery evidence stores the provider message ID",
  );
  assert.match(
    subscriptionSchema,
    /externalEventId:\s*text\("external_event_id"\)/,
    "reply ledger evidence stores the external event ID",
  );

  const purge = between(
    management,
    "async function purgeMerchantOperationalData(",
    "export async function completeMerchantDeletionPostgres(",
  );

  assert.match(
    purge,
    /retireMerchantProviderIdentifiers\(target, merchantId\)/,
    "canonical merchant deletion must invoke provider-identifier retirement inside its transaction",
  );

  assert.match(
    retirement,
    /UPDATE channel_inbound_events[\s\S]*external_event_id = 'deleted:event:' \|\| id[\s\S]*WHERE merchant_id = \$1/,
    "retained inbound evidence must replace raw provider event identity with an internal deletion token",
  );
  assert.match(
    retirement,
    /UPDATE reply_reservations[\s\S]*external_event_id = 'deleted:event:' \|\| inbound_event_id[\s\S]*WHERE merchant_id = \$1/,
    "retained reservations must replace raw provider event identity with the inbound internal token",
  );
  assert.match(
    retirement,
    /UPDATE reply_ledger l[\s\S]*'deleted:event:' \|\| r\.inbound_event_id[\s\S]*'deleted:ledger:' \|\| l\.id[\s\S]*WHERE l\.merchant_id = \$1/,
    "reply ledger evidence must retain only internal deletion-safe linkage",
  );
  assert.match(
    retirement,
    /UPDATE background_jobs[\s\S]*dedupe_key = 'deleted:job:' \|\| id[\s\S]*WHERE merchant_id = \$1/,
    "retained durable jobs must not keep provider-derived dedupe keys",
  );
  assert.match(
    retirement,
    /UPDATE outbound_deliveries[\s\S]*provider_message_id = NULL[\s\S]*WHERE merchant_id = \$1/,
    "retained outbound delivery evidence must not keep the provider message ID",
  );

  assert.doesNotMatch(
    retirement,
    /sha256|md5|digest\s*\(/i,
    "deletion tokens should derive from Fawri-owned internal row identifiers, not hashed provider identifiers",
  );
});
