import assert from "node:assert/strict";
import test from "node:test";
import {
  buildSafeWhatsAppFailureMetadata,
} from "../src/services/whatsappDataPolicy";

test("diagnostic code fallbacks never coerce arbitrary objects", () => {
  let coercions = 0;
  const hostile = {
    toString() {
      coercions += 1;
      return "WHATSAPP_SHOULD_NOT_RUN";
    },
    valueOf() {
      coercions += 1;
      return 1;
    },
  };

  const metadata = buildSafeWhatsAppFailureMetadata({
    jobType: hostile,
    reasonCode: hostile,
    attemptNumber: 1,
  });

  assert.equal(metadata.job_type, "whatsapp_unknown_job");
  assert.equal(metadata.reason_code, "WHATSAPP_FAILURE_REDACTED");
  assert.equal(coercions, 0);
});

test("diagnostic payload accessors are not invoked", () => {
  let getterInvoked = false;
  const payload: Record<string, unknown> = {
    merchant_id: "merchant-1",
    channel_id: "channel-1",
  };
  Object.defineProperty(payload, "event_id", {
    enumerable: true,
    configurable: true,
    get() {
      getterInvoked = true;
      return "event-secret";
    },
  });

  const metadata = buildSafeWhatsAppFailureMetadata({
    jobType: "whatsapp_inbound_message",
    reasonCode: "WHATSAPP_PROCESSING_FAILED",
    attemptNumber: 1,
    payload,
  });

  assert.equal(getterInvoked, false);
  assert.equal(metadata.event_hash, undefined);
  assert.match(metadata.merchant_hash || "", /^[a-f0-9]{24}$/);
  assert.match(metadata.channel_hash || "", /^[a-f0-9]{24}$/);
});

test("diagnostic payload proxies are ignored without entering proxy traps", () => {
  let traps = 0;
  const payload = new Proxy(
    { event_id: "event-secret" },
    {
      get() {
        traps += 1;
        throw new Error("proxy get must not run");
      },
      getPrototypeOf() {
        traps += 1;
        throw new Error("proxy prototype trap must not run");
      },
      getOwnPropertyDescriptor() {
        traps += 1;
        throw new Error("proxy descriptor trap must not run");
      },
    },
  );

  const metadata = buildSafeWhatsAppFailureMetadata({
    jobType: "whatsapp_inbound_message",
    reasonCode: "WHATSAPP_PROCESSING_FAILED",
    attemptNumber: 1,
    payload,
  });

  assert.equal(traps, 0);
  assert.equal(metadata.event_hash, undefined);
  assert.equal(metadata.merchant_hash, undefined);
  assert.equal(metadata.channel_hash, undefined);
});

test("oversized and control-bearing identifiers are omitted instead of hashed", () => {
  const metadata = buildSafeWhatsAppFailureMetadata({
    jobType: "whatsapp_delivery_status",
    reasonCode: "WHATSAPP_STATUS_FAILED",
    attemptNumber: 2,
    payload: {
      event_id: "x".repeat(513),
      merchant_id: "merchant\u0000spoof",
      channel_id: "channel\nspoof",
      external_message_id: "wamid\tspoof",
      waba_id: "1".repeat(41),
      phone_number_id: "2".repeat(41),
    },
  });

  assert.equal(metadata.event_hash, undefined);
  assert.equal(metadata.merchant_hash, undefined);
  assert.equal(metadata.channel_hash, undefined);
  assert.equal(metadata.external_message_hash, undefined);
});

test("attempt number validation is strict and does not invoke value coercion", () => {
  let coercions = 0;
  const hostileAttempt = {
    valueOf() {
      coercions += 1;
      return 1;
    },
    toString() {
      coercions += 1;
      return "1";
    },
  };

  for (const attemptNumber of ["1", hostileAttempt, Number.NaN, 0, -1]) {
    assert.throws(
      () =>
        buildSafeWhatsAppFailureMetadata({
          jobType: "whatsapp_inbound_message",
          reasonCode: "WHATSAPP_PROCESSING_FAILED",
          attemptNumber,
        }),
      (error: unknown) =>
        (error as { code?: string }).code === "WHATSAPP_FAILURE_METADATA_INVALID",
    );
  }
  assert.equal(coercions, 0);
});
