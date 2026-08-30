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

test("irreversible merchant deletion must retire raw Meta/provider identifiers from retained evidence", () => {
  const management = source(
    "artifacts/api-server/src/services/postgresMerchantManagementAuthority.ts",
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
    /Completed\/dead-letter jobs referenced by inbound[\s\S]*stay as non-sensitive anchors/,
    "merchant deletion explicitly classifies retained job anchors as non-sensitive",
  );
  assert.match(
    purge,
    /Retained financial\/entitlement\/audit rows keep only non-PII proof fields/,
    "merchant deletion explicitly classifies retained entitlement evidence as non-PII",
  );

  const backgroundJobUpdate = purge.match(
    /UPDATE background_jobs[\s\S]*?WHERE merchant_id = \$1/,
  )?.[0];
  assert.ok(backgroundJobUpdate, "merchant deletion must scrub retained background jobs");
  assert.match(
    backgroundJobUpdate,
    /dedupe_key\s*=/,
    "retained Meta background jobs can keep a raw meta:<pageId>:<provider-id> dedupe key after merchant deletion",
  );

  const replyLedgerUpdate = purge.match(
    /UPDATE reply_ledger[\s\S]*?WHERE merchant_id = \$1/,
  )?.[0];
  assert.ok(replyLedgerUpdate, "merchant deletion must scrub retained reply ledger rows");
  assert.match(
    replyLedgerUpdate,
    /external_event_id\s*=/,
    "retained reply ledger rows can keep a raw Meta Page/provider event identifier after merchant deletion",
  );

  assert.match(
    purge,
    /UPDATE channel_inbound_events[\s\S]*?external_event_id\s*=/,
    "retained channel inbound evidence must replace raw provider event identity with non-reversible linkage",
  );
  assert.match(
    purge,
    /UPDATE outbound_deliveries[\s\S]*?provider_message_id\s*=\s*NULL/,
    "retained outbound delivery evidence must not keep the provider message ID after irreversible deletion",
  );
});
