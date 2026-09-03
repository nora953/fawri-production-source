import assert from "node:assert/strict";
import test from "node:test";
import {
  buildWhatsAppPrivilegedJobPlan,
} from "../src/services/whatsappPrivilegedJobPlan";

function payload(overrides: Record<string, unknown> = {}) {
  return {
    event_id: "message-event",
    merchant_id: "merchant-1",
    channel_id: "channel-1",
    external_message_id: "wamid.in-1",
    text: "hello",
    ...overrides,
  };
}

function plan(value: Record<string, unknown>) {
  return buildWhatsAppPrivilegedJobPlan({
    type: "whatsapp_inbound_message",
    eventId: "message-event",
    merchantId: "merchant-1",
    channelId: "channel-1",
    payload: value,
    maxAttempts: 5,
  });
}

function expectPayloadCode(value: Record<string, unknown>, expectedCode: string) {
  assert.throws(
    () => plan(value),
    (error: unknown) => (error as { code?: string }).code === expectedCode,
  );
}

test("plain JSON payloads remain deterministic across object key insertion order", () => {
  const first = plan(
    payload({
      note: "السطر الأول\nالسطر الثاني\tOK",
      nested: { b: 2, a: 1, values: [true, null, "x"] },
    }),
  );
  const second = plan(
    payload({
      nested: { values: [true, null, "x"], a: 1, b: 2 },
      note: "السطر الأول\nالسطر الثاني\tOK",
    }),
  );

  assert.equal(first.job_row.payload_hash, second.job_row.payload_hash);
  assert.deepEqual(
    first.encrypted_payload.payload_for_encryption,
    payload({
      note: "السطر الأول\nالسطر الثاني\tOK",
      nested: { b: 2, a: 1, values: [true, null, "x"] },
    }),
  );
});

test("rejects non-JSON object families and proxies before cloning or hashing", () => {
  class CustomValue {
    value = "x";
  }

  for (const value of [
    new Date("2026-09-03T00:00:00.000Z"),
    new Map([["a", 1]]),
    new Set([1]),
    /pattern/,
    new Uint8Array([1, 2, 3]),
    new CustomValue(),
    new Proxy({ safe: "x" }, {}),
  ]) {
    expectPayloadCode(
      payload({ value }),
      "WHATSAPP_PRIVILEGED_JOB_PAYLOAD_INVALID",
    );
  }
});

test("rejects non-JSON scalars and ambiguous numeric values", () => {
  for (const value of [
    undefined,
    BigInt(1),
    Symbol("x"),
    () => "x",
    Number.NaN,
    Number.POSITIVE_INFINITY,
    Number.NEGATIVE_INFINITY,
    -0,
  ]) {
    expectPayloadCode(
      payload({ value }),
      "WHATSAPP_PRIVILEGED_JOB_PAYLOAD_INVALID",
    );
  }
});

test("rejects cycles and shared object aliases instead of hashing ambiguous graphs", () => {
  const cycle = payload();
  cycle.loop = cycle;
  expectPayloadCode(cycle, "WHATSAPP_PRIVILEGED_JOB_PAYLOAD_INVALID");

  const shared = { safe: "same-object" };
  expectPayloadCode(
    payload({ first: shared, second: shared }),
    "WHATSAPP_PRIVILEGED_JOB_PAYLOAD_INVALID",
  );
});

test("rejects enumerable accessors without invoking the getter", () => {
  let getterInvoked = false;
  const value = payload();
  Object.defineProperty(value, "trap", {
    enumerable: true,
    configurable: true,
    get() {
      getterInvoked = true;
      return "should-not-run";
    },
  });

  expectPayloadCode(value, "WHATSAPP_PRIVILEGED_JOB_PAYLOAD_INVALID");
  assert.equal(getterInvoked, false);
});

test("rejects hidden, symbol, dangerous-key, sparse-array, and extra-array-property shapes", () => {
  const hidden = payload();
  Object.defineProperty(hidden, "hidden", {
    value: "x",
    enumerable: false,
  });
  expectPayloadCode(hidden, "WHATSAPP_PRIVILEGED_JOB_PAYLOAD_INVALID");

  const symbolObject = { safe: "x" } as Record<PropertyKey, unknown>;
  symbolObject[Symbol("hidden")] = "x";
  expectPayloadCode(
    payload({ value: symbolObject }),
    "WHATSAPP_PRIVILEGED_JOB_PAYLOAD_INVALID",
  );

  for (const key of ["__proto__", "prototype", "constructor"]) {
    const unsafe: Record<string, unknown> = { safe: "x" };
    Object.defineProperty(unsafe, key, {
      value: "blocked",
      enumerable: true,
      configurable: true,
      writable: true,
    });
    expectPayloadCode(
      payload({ value: unsafe }),
      "WHATSAPP_PRIVILEGED_JOB_PAYLOAD_INVALID",
    );
  }

  const sparse = new Array(2);
  sparse[0] = "x";
  expectPayloadCode(
    payload({ value: sparse }),
    "WHATSAPP_PRIVILEGED_JOB_PAYLOAD_INVALID",
  );

  const extra = ["x"] as Array<unknown> & { extra?: string };
  extra.extra = "not-json-array-shape";
  expectPayloadCode(
    payload({ value: extra }),
    "WHATSAPP_PRIVILEGED_JOB_PAYLOAD_INVALID",
  );
});

test("rejects unsafe control bytes while allowing normal human newlines and tabs", () => {
  expectPayloadCode(
    payload({ note: "safe-start\u0000unsafe-end" }),
    "WHATSAPP_PRIVILEGED_JOB_PAYLOAD_INVALID",
  );

  const accepted = plan(payload({ note: "line one\nline two\tOK" }));
  assert.equal(
    accepted.encrypted_payload.payload_for_encryption.note,
    "line one\nline two\tOK",
  );
});

test("rejects excessive depth and container width as too complex", () => {
  let deep: Record<string, unknown> = { leaf: "x" };
  for (let index = 0; index < 33; index += 1) deep = { child: deep };
  expectPayloadCode(
    payload({ deep }),
    "WHATSAPP_PRIVILEGED_JOB_PAYLOAD_TOO_COMPLEX",
  );

  expectPayloadCode(
    payload({ wide: Array.from({ length: 2_001 }, (_, index) => index) }),
    "WHATSAPP_PRIVILEGED_JOB_PAYLOAD_TOO_COMPLEX",
  );
});

test("rejects canonical payloads beyond the 512 KiB internal byte budget", () => {
  expectPayloadCode(
    payload({ large: "x".repeat(513 * 1024) }),
    "WHATSAPP_PRIVILEGED_JOB_PAYLOAD_TOO_LARGE",
  );
});
