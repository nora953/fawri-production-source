import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  createWhatsAppDeliveryState,
  reduceWhatsAppDeliveryStatus,
} from "../src/services/whatsappDeliveryLifecycle";
import type { NormalizedWhatsAppStatusEvent } from "../src/services/whatsappWebhookContract";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "../../..");

function statusEvent(
  status: string,
  overrides: Partial<NormalizedWhatsAppStatusEvent> = {},
): NormalizedWhatsAppStatusEvent {
  return {
    event_id: `whatsapp:1234567890:9876543210:status:wamid.out-1:${status}`,
    event_kind: "status",
    waba_id: "1234567890",
    phone_number_id: "9876543210",
    external_message_id: "wamid.out-1",
    recipient_id: "9647711111111",
    status,
    timestamp: "1788390000",
    error_codes: [],
    ...overrides,
  };
}

function sentState() {
  return createWhatsAppDeliveryState({
    attemptId: "attempt-1",
    wabaId: "1234567890",
    phoneNumberId: "9876543210",
    recipientId: "9647711111111",
    outcome: {
      status: "sent" as const,
      provider_message_id: "wamid.out-1",
    },
  });
}

test("delivery status advances monotonically from sent to delivered to read", () => {
  const sent = sentState();
  assert.equal(sent.local_attempt_id, "attempt-1");
  const delivered = reduceWhatsAppDeliveryStatus(sent, statusEvent("delivered"));
  assert.equal(delivered.changed, true);
  assert.equal(delivered.state.phase, "delivered");

  const read = reduceWhatsAppDeliveryStatus(
    delivered.state,
    statusEvent("read", {
      event_id: "whatsapp:1234567890:9876543210:status:wamid.out-1:read",
      timestamp: "1788390100",
    }),
  );
  assert.equal(read.changed, true);
  assert.equal(read.state.phase, "read");
  assert.equal(read.state.provider_timestamp, "1788390100");
});

test("late success status cannot regress a more advanced successful state", () => {
  const read = reduceWhatsAppDeliveryStatus(sentState(), statusEvent("read")).state;
  const lateDelivered = reduceWhatsAppDeliveryStatus(
    read,
    statusEvent("delivered", {
      event_id: "late-delivered",
      timestamp: "1788389999",
    }),
  );
  assert.equal(lateDelivered.changed, false);
  assert.equal(lateDelivered.state.phase, "read");
  assert.equal(lateDelivered.state.last_status_event_id, read.last_status_event_id);
});

test("failed status after send becomes terminal and preserves provider error codes", () => {
  const failed = reduceWhatsAppDeliveryStatus(
    sentState(),
    statusEvent("failed", {
      error_codes: ["131047", "131047", "131000"],
    }),
  );
  assert.equal(failed.changed, true);
  assert.equal(failed.state.phase, "failed");
  assert.deepEqual(failed.state.error_codes, ["131047", "131000"]);
});

test("success after terminal failure fails closed to uncertain", () => {
  const failed = reduceWhatsAppDeliveryStatus(
    sentState(),
    statusEvent("failed", { error_codes: ["131047"] }),
  ).state;
  const contradictory = reduceWhatsAppDeliveryStatus(
    failed,
    statusEvent("delivered", { event_id: "contradictory-delivered" }),
  );
  assert.equal(contradictory.changed, true);
  assert.equal(contradictory.state.phase, "uncertain");
  assert.equal(
    contradictory.state.conflict_code,
    "WHATSAPP_DELIVERY_CONTRADICTORY_TERMINAL_STATUS",
  );
});

test("failure after delivered or read fails closed to uncertain", () => {
  for (const success of ["delivered", "read"]) {
    const advanced = reduceWhatsAppDeliveryStatus(
      sentState(),
      statusEvent(success),
    ).state;
    const result = reduceWhatsAppDeliveryStatus(
      advanced,
      statusEvent("failed", {
        event_id: `failed-after-${success}`,
        error_codes: ["131000"],
      }),
    );
    assert.equal(result.state.phase, "uncertain");
    assert.equal(
      result.state.conflict_code,
      "WHATSAPP_DELIVERY_CONTRADICTORY_TERMINAL_STATUS",
    );
  }
});

test("once uncertain, later webhooks cannot silently restore certainty", () => {
  const failed = reduceWhatsAppDeliveryStatus(
    sentState(),
    statusEvent("failed", { error_codes: ["131047"] }),
  ).state;
  const uncertain = reduceWhatsAppDeliveryStatus(
    failed,
    statusEvent("delivered", { event_id: "contradictory-delivered" }),
  ).state;
  const laterRead = reduceWhatsAppDeliveryStatus(
    uncertain,
    statusEvent("read", { event_id: "later-read" }),
  );
  assert.equal(laterRead.state.phase, "uncertain");
  assert.equal(
    laterRead.state.conflict_code,
    "WHATSAPP_DELIVERY_CONTRADICTORY_TERMINAL_STATUS",
  );
});

test("failed or uncertain send without provider id never invents one", () => {
  for (const outcome of [
    { status: "confirmed_failed" as const, code: "WHATSAPP_GRAPH_HTTP_400", http_status: 400 },
    { status: "uncertain" as const, code: "WHATSAPP_GRAPH_HTTP_503", http_status: 503 },
  ]) {
    const state = createWhatsAppDeliveryState({
      attemptId: `attempt-${outcome.status}`,
      wabaId: "1234567890",
      phoneNumberId: "9876543210",
      outcome,
    });
    assert.equal(state.external_message_id, undefined);
    assert.throws(
      () => reduceWhatsAppDeliveryStatus(state, statusEvent("delivered")),
      (error: unknown) =>
        (error as { code?: string }).code ===
        "WHATSAPP_DELIVERY_PROVIDER_ID_UNAVAILABLE",
    );
  }
});

test("unknown status is observed without inventing a transition", () => {
  const state = sentState();
  const result = reduceWhatsAppDeliveryStatus(state, statusEvent("warning"));
  assert.equal(result.changed, false);
  assert.equal(result.state, state);
  assert.equal(result.ignored_status, "warning");
});

test("status event must match WABA, phone number, and provider message id", () => {
  assert.throws(
    () =>
      reduceWhatsAppDeliveryStatus(
        sentState(),
        statusEvent("delivered", { phone_number_id: "1111111111" }),
      ),
    (error: unknown) =>
      (error as { code?: string }).code === "WHATSAPP_DELIVERY_MAPPING_MISMATCH",
  );
  assert.throws(
    () =>
      reduceWhatsAppDeliveryStatus(
        sentState(),
        statusEvent("delivered", { external_message_id: "wamid.other" }),
      ),
    (error: unknown) =>
      (error as { code?: string }).code === "WHATSAPP_DELIVERY_MAPPING_MISMATCH",
  );
});

test("delivery lifecycle stays pure and credential-free", () => {
  const source = fs.readFileSync(
    path.join(
      repoRoot,
      "artifacts/api-server/src/services/whatsappDeliveryLifecycle.ts",
    ),
    "utf8",
  );
  assert.doesNotMatch(source, /\bfetch\s*\(/);
  assert.doesNotMatch(source, /graph\.facebook\.com/i);
  assert.doesNotMatch(source, /Bearer\s/i);
  assert.doesNotMatch(source, /access[_-]?token/i);
  assert.doesNotMatch(source, /app[_-]?secret/i);
});
