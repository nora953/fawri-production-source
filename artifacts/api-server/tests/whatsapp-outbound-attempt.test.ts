import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  buildWhatsAppTextSendPlan,
} from "../src/services/whatsappOfflineContracts";
import {
  createWhatsAppOutboundAttemptPlan,
} from "../src/services/whatsappOutboundAttempt";
import type { ResolvedDormantWhatsAppChannel } from "../src/services/whatsappDormantChannelResolver";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "../../..");

const channel: ResolvedDormantWhatsAppChannel = {
  id: "channel-1",
  merchant_id: "merchant-1",
  platform: "whatsapp",
  status: "pending",
  version: 1,
  waba_id: "1234567890",
  phone_number_id: "9876543210",
  integration_mode: "dormant_offline",
};

const graphVersion = "v30.0";

function request(messageText = "hello") {
  return buildWhatsAppTextSendPlan({
    phoneNumberId: channel.phone_number_id,
    to: "+9647711111111",
    messageText,
    graphVersion,
  });
}

test("same logical attempt is deterministic and transport remains unauthorized", () => {
  const input = {
    merchantId: "merchant-1",
    replyIntentId: "reply-intent-1",
    attemptNumber: 1,
    channel,
    request: request(),
  };
  const first = createWhatsAppOutboundAttemptPlan(input);
  const second = createWhatsAppOutboundAttemptPlan(input);
  assert.deepEqual(first, second);
  assert.equal(first.boundary, "not_sent");
  assert.equal(first.transport_authorized, false);
  assert.match(first.logical_send_id, /^whatsapp-send-[a-f0-9]{40}$/);
  assert.match(first.attempt_id, /^whatsapp-attempt-[a-f0-9]{40}$/);
  assert.match(first.dedupe_key, /^whatsapp-send:[a-f0-9]{64}$/);
  assert.match(first.recipient_hash, /^[a-f0-9]{24}$/);
});

test("later attempt number keeps logical send identity but changes attempt identity", () => {
  const first = createWhatsAppOutboundAttemptPlan({
    merchantId: "merchant-1",
    replyIntentId: "reply-intent-1",
    attemptNumber: 1,
    channel,
    request: request(),
  });
  const second = createWhatsAppOutboundAttemptPlan({
    merchantId: "merchant-1",
    replyIntentId: "reply-intent-1",
    attemptNumber: 2,
    channel,
    request: request("corrected text"),
  });
  assert.equal(first.logical_send_id, second.logical_send_id);
  assert.notEqual(first.attempt_id, second.attempt_id);
  assert.notEqual(first.dedupe_key, second.dedupe_key);
});

test("channel/request and merchant mismatches fail closed", () => {
  assert.throws(
    () =>
      createWhatsAppOutboundAttemptPlan({
        merchantId: "merchant-2",
        replyIntentId: "reply-intent-1",
        attemptNumber: 1,
        channel,
        request: request(),
      }),
    (error: unknown) =>
      (error as { code?: string }).code ===
      "WHATSAPP_OUTBOUND_ATTEMPT_MERCHANT_MISMATCH",
  );

  const wrongRequest = buildWhatsAppTextSendPlan({
    phoneNumberId: "1111111111",
    to: "+9647711111111",
    messageText: "hello",
    graphVersion,
  });
  assert.throws(
    () =>
      createWhatsAppOutboundAttemptPlan({
        merchantId: "merchant-1",
        replyIntentId: "reply-intent-1",
        attemptNumber: 1,
        channel,
        request: wrongRequest,
      }),
    (error: unknown) =>
      (error as { code?: string }).code ===
      "WHATSAPP_OUTBOUND_REQUEST_CHANNEL_MISMATCH",
  );
});

test("outbound attempt contract has no transport or credentials", () => {
  const source = fs.readFileSync(
    path.join(
      repoRoot,
      "artifacts/api-server/src/services/whatsappOutboundAttempt.ts",
    ),
    "utf8",
  );
  assert.doesNotMatch(source, /\bfetch\s*\(/);
  assert.doesNotMatch(source, /graph\.facebook\.com/i);
  assert.doesNotMatch(source, /Bearer\s/i);
  assert.doesNotMatch(source, /access[_-]?token/i);
  assert.doesNotMatch(source, /enqueueDurableJob/);
});
