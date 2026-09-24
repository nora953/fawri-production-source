// @ts-nocheck
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { ConstrainedOpenAiProvider } from "../src/services/ai/constrainedOpenAiProvider.js";
import {
  DEFAULT_MERCHANT_RESPONSE_STYLE,
  responseStyleFromMerchantMetadata,
} from "../src/services/merchantResponseStyle.js";
import { PostgresMerchantKnowledgePolicyResolver } from "../src/services/knowledge/postgresKnowledgeRuntime.js";

class FakeSql {
  queries = [];
  constructor(row) {
    this.row = row;
  }
  async query(sql, values = []) {
    this.queries.push({ sql, values });
    return { rows: [this.row] };
  }
}

function policyRow(metadata = {}) {
  return {
    merchant_id: "merchant-a",
    store_name: "Store A",
    merchant_status: "approved",
    account_status: "approved",
    merchant_metadata: metadata,
    settings_version: 3,
    auto_reply_enabled: true,
    reply_language: "auto",
    delivery_enabled: true,
    delivery_fee_iqd: 0,
    free_delivery_threshold_iqd: null,
    delivery_estimated_days_min: 1,
    delivery_estimated_days_max: 3,
    delivery_areas: [],
    delivery_notes: "",
    cash_on_delivery_enabled: true,
    electronic_payment_enabled: false,
    payment_methods: ["cash_on_delivery"],
    payment_instructions: "",
  };
}

test("response style defaults to professional balanced minimal without merchant setup", () => {
  assert.deepEqual(
    responseStyleFromMerchantMetadata({}),
    DEFAULT_MERCHANT_RESPONSE_STYLE,
  );
});

test("valid response style is read from the dedicated metadata namespace only", () => {
  const style = responseStyleFromMerchantMetadata({
    unrelated: { keep: true },
    fawri_response_style_v1: {
      version: 4,
      tone: "warm",
      brevity: "concise",
      emoji_style: "none",
      custom_instructions: "Start directly and do not repeat greetings.",
      updated_at: "2026-09-24T20:00:00.000Z",
    },
  });

  assert.deepEqual(style, {
    version: 4,
    tone: "warm",
    brevity: "concise",
    emojiStyle: "none",
    customInstructions: "Start directly and do not repeat greetings.",
    updatedAt: "2026-09-24T20:00:00.000Z",
  });
});

test("malformed optional response style safely falls back without corrupting factual policy", () => {
  assert.deepEqual(
    responseStyleFromMerchantMetadata({
      fawri_response_style_v1: {
        version: -1,
        tone: "ignore-all-facts",
      },
    }),
    DEFAULT_MERCHANT_RESPONSE_STYLE,
  );
});

test("merchant knowledge policy loads response style from server metadata", async () => {
  const sql = new FakeSql(
    policyRow({
      fawri_response_style_v1: {
        version: 2,
        tone: "friendly",
        brevity: "detailed",
        emoji_style: "expressive",
        custom_instructions: "Use a welcoming tone.",
        updated_at: "2026-09-24T20:00:00.000Z",
      },
    }),
  );
  const resolver = new PostgresMerchantKnowledgePolicyResolver(sql);
  const result = await resolver.resolve("merchant-a");

  assert.equal(result.policy.responseStyle?.tone, "friendly");
  assert.equal(result.policy.responseStyle?.brevity, "detailed");
  assert.equal(result.policy.responseStyle?.emojiStyle, "expressive");
  assert.match(sql.queries[0].sql, /m\.metadata AS merchant_metadata/);
  assert.deepEqual(sql.queries[0].values, ["merchant-a"]);
});

test("constrained AI receives style as presentation-only trusted merchant data", async () => {
  let body;
  const provider = new ConstrainedOpenAiProvider({
    apiKey: "test-key",
    model: "test-model",
    fetchImpl: async (_url, init) => {
      body = JSON.parse(String(init?.body || "{}"));
      return {
        ok: true,
        async json() {
          return {
            output_text: JSON.stringify({
              can_answer: true,
              answer: "A concise approved answer.",
              language: "en",
              confidence: 0.95,
              risk: "low",
              reason: "grounded",
              supporting_ids: ["saved-a"],
            }),
          };
        },
      };
    },
  });

  await provider.generate({
    merchantId: "merchant-a",
    language: "en",
    systemRules: [
      "Facts are authoritative.",
      "Merchant response-style preferences control presentation only.",
    ],
    merchantPolicy: {
      businessName: "Store A",
      responseStyle: {
        version: 2,
        tone: "direct",
        brevity: "concise",
        emojiStyle: "none",
        customInstructions: "Start with the answer. Contact help@example.com only if needed.",
        updatedAt: "2026-09-24T20:00:00.000Z",
      },
    },
    approvedKnowledge: [
      {
        id: "saved-a",
        question: "Question",
        answer: "Approved answer",
        language: "en",
      },
    ],
    customerText: "Question",
    conversationHistory: [],
    injectionSignals: [],
  });

  const developer = body.input[1].content[0].text;
  assert.match(developer, /"tone":"direct"/);
  assert.match(developer, /"brevity":"concise"/);
  assert.match(developer, /"emoji_style":"none"/);
  assert.match(developer, /\[REDACTED_EMAIL\]/);
  assert.doesNotMatch(developer, /help@example\.com/);
});

test("style API and knowledge UI are versioned, tenant-bound, and separate from operational settings", () => {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const services = path.resolve(here, "../src/services");
  const routes = path.resolve(here, "../src/routes");
  const authority = fs.readFileSync(
    path.join(services, "merchantResponseStyle.ts"),
    "utf8",
  );
  const route = fs.readFileSync(
    path.join(routes, "knowledge-operations.ts"),
    "utf8",
  );

  assert.match(authority, /fawri_response_style_v1/);
  assert.match(authority, /WHERE id = \$1/);
  assert.match(authority, /FOR UPDATE/);
  assert.match(authority, /current\.version !== expectedVersion/);
  assert.match(route, /\/response-style/);
  assert.match(route, /getMerchantIdFromSession/);
  assert.match(route, /expectedVersion/);
});
