import assert from "node:assert/strict";
import test from "node:test";
import {
  parseWhatsAppWebhookPayload,
} from "../src/services/whatsappWebhookContract";

function messagesChange(input: {
  messages?: unknown[];
  statuses?: unknown[];
  errors?: unknown[];
  contacts?: unknown[];
}) {
  return {
    field: "messages",
    value: {
      metadata: { phone_number_id: "9876543210" },
      ...(input.messages ? { messages: input.messages } : {}),
      ...(input.statuses ? { statuses: input.statuses } : {}),
      ...(input.errors ? { errors: input.errors } : {}),
      ...(input.contacts ? { contacts: input.contacts } : {}),
    },
  };
}

function payload(entries: unknown[]) {
  return {
    object: "whatsapp_business_account",
    entry: entries,
  };
}

function rejectBudget(body: unknown) {
  const result = parseWhatsAppWebhookPayload(body);
  assert.equal(result.supported, true);
  assert.deepEqual(result.events, []);
  assert.equal(result.ignored_changes, 0);
  assert.equal(result.malformed_changes, 1);
}

test("rejects a webhook body with too many entries before normalization", () => {
  rejectBudget(
    payload(
      Array.from({ length: 101 }, (_, index) => ({
        id: String(1000 + index),
        changes: [],
      })),
    ),
  );
});

test("rejects an entry with too many changes before traversing event candidates", () => {
  rejectBudget(
    payload([
      {
        id: "1234567890",
        changes: Array.from({ length: 101 }, () => ({
          field: "not-messages",
          value: {},
        })),
      },
    ]),
  );
});

test("rejects more than 500 event candidates in a single messages change", () => {
  rejectBudget(
    payload([
      {
        id: "1234567890",
        changes: [
          messagesChange({
            messages: Array.from({ length: 501 }, () => ({})),
          }),
        ],
      },
    ]),
  );
});

test("rejects a payload whose distributed messages changes exceed the global event budget", () => {
  rejectBudget(
    payload([
      {
        id: "1234567890",
        changes: Array.from({ length: 5 }, () =>
          messagesChange({
            messages: Array.from({ length: 401 }, () => ({})),
          }),
        ),
      },
    ]),
  );
});

test("rejects an oversized provider contact-profile array before contact-name traversal", () => {
  rejectBudget(
    payload([
      {
        id: "1234567890",
        changes: [
          messagesChange({
            contacts: Array.from({ length: 1_001 }, () => ({})),
            messages: [
              {
                from: "9647711111111",
                id: "wamid.contact-budget",
                type: "text",
                text: { body: "hello" },
              },
            ],
          }),
        ],
      },
    ]),
  );
});

test("rejects a status event with an excessive nested provider error-code array", () => {
  const result = parseWhatsAppWebhookPayload(
    payload([
      {
        id: "1234567890",
        changes: [
          messagesChange({
            statuses: [
              {
                id: "wamid.status-budget",
                status: "failed",
                recipient_id: "9647711111111",
                errors: Array.from({ length: 101 }, (_, index) => ({
                  code: String(130000 + index),
                })),
              },
            ],
          }),
        ],
      },
    ]),
  );

  assert.equal(result.supported, true);
  assert.deepEqual(result.events, []);
  assert.equal(result.malformed_changes, 1);
});

test("normal sized batches remain eligible for ordinary normalization", () => {
  const result = parseWhatsAppWebhookPayload(
    payload([
      {
        id: "1234567890",
        changes: [
          messagesChange({
            messages: [
              {
                from: "9647711111111",
                id: "wamid.normal-1",
                type: "text",
                text: { body: "one" },
              },
              {
                from: "9647711111112",
                id: "wamid.normal-2",
                type: "text",
                text: { body: "two" },
              },
            ],
          }),
        ],
      },
    ]),
  );

  assert.equal(result.supported, true);
  assert.equal(result.malformed_changes, 0);
  assert.equal(result.events.length, 2);
  assert.deepEqual(
    result.events.map((event) => event.event_kind),
    ["message", "message"],
  );
});
