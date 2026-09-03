import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  previewDormantWhatsAppTextSend,
} from "../src/services/whatsappOutboundPolicy";
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

test("dormant channel can shape a pinned-version request but can never authorize transport", () => {
  const result = previewDormantWhatsAppTextSend({
    merchantId: "merchant-1",
    channel,
    to: "+9647711111111",
    messageText: "hello",
    graphVersion,
  });
  assert.equal(result.decision, "blocked");
  assert.equal(result.code, "WHATSAPP_CHANNEL_DORMANT");
  assert.equal(result.transport_authorized, false);
  assert.equal(result.credential_required, false);
  assert.equal(result.request_preview.path, "/v30.0/9876543210/messages");
  assert.equal("access_token" in result.request_preview, false);
});

test("cross-merchant outbound planning stays blocked without producing a request preview", () => {
  const result = previewDormantWhatsAppTextSend({
    merchantId: "merchant-2",
    channel,
    to: "9647711111111",
    messageText: "hello",
    graphVersion,
  });
  assert.equal(result.code, "WHATSAPP_MERCHANT_MAPPING_MISMATCH");
  assert.equal(result.transport_authorized, false);
  assert.equal("request_preview" in result, false);
});

test("requested live cutover with blockers remains explicitly blocked", () => {
  const result = previewDormantWhatsAppTextSend({
    merchantId: "merchant-1",
    channel,
    to: "9647711111111",
    messageText: "hello",
    graphVersion,
    readiness: {
      mode: "blocked",
      environment: "staging",
      offline_foundation_enabled: true,
      live_cutover_requested: true,
      ready_for_external_activation: false,
      blockers: ["WHATSAPP_DORMANT_DATABASE_BARRIER_ACTIVE"],
    },
  });
  assert.equal(result.code, "WHATSAPP_EXTERNAL_ACTIVATION_NOT_READY");
  assert.equal(result.transport_authorized, false);
});

test("missing or unpinned Graph version fails closed", () => {
  assert.throws(
    () =>
      previewDormantWhatsAppTextSend({
        merchantId: "merchant-1",
        channel,
        to: "9647711111111",
        messageText: "hello",
        graphVersion: "",
      }),
    (error: unknown) =>
      (error as { code?: string }).code === "WHATSAPP_GRAPH_VERSION_INVALID",
  );
});

test("outbound policy has no transport or credential path", () => {
  const source = fs.readFileSync(
    path.join(
      repoRoot,
      "artifacts/api-server/src/services/whatsappOutboundPolicy.ts",
    ),
    "utf8",
  );
  assert.doesNotMatch(source, /\bfetch\s*\(/);
  assert.doesNotMatch(source, /graph\.facebook\.com/i);
  assert.doesNotMatch(source, /Bearer\s/i);
  assert.doesNotMatch(source, /access[_-]?token/i);
  assert.doesNotMatch(source, /app[_-]?secret/i);
});
