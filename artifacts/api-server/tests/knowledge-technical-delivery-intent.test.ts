import assert from "node:assert/strict";
import test from "node:test";
import {
  isAuthoritativeFactQuestion,
  PostgresKnowledgeFactResolver,
  type KnowledgeSqlExecutor,
} from "../src/services/knowledge/postgresKnowledgeRuntime.js";
import { PostgresOperationalFactResolver } from "../src/services/knowledge/postgresOperationalFactResolver.js";

const technicalQuestions = [
  "Does it support Power Delivery?",
  "Explain USB-C POWER DELIVERY compatibility",
  "How much power does the charger deliver?",
  "هل اي شاحن سريع يشحن بسرعة",
  "شنو الفرق بين watt volt amp وهل اي شاحن سريع يشحن بسرعة؟",
  "هل البطارية تشحن بسرعة بهذا الكابل؟",
];

test("electrical charging questions do not become delivery-policy questions", async () => {
  const sql: KnowledgeSqlExecutor = {
    async query() { throw new Error("technical questions must not load operational delivery policy"); },
  };
  for (const customerText of technicalQuestions) {
    assert.equal(isAuthoritativeFactQuestion(customerText), false, customerText);
    for (const resolver of [new PostgresKnowledgeFactResolver(sql), new PostgresOperationalFactResolver(sql)]) {
      assert.equal(await resolver.resolve({ merchantId: "merchant-a", customerText, language: "ar" }), null, customerText);
    }
  }
});

test("technical product terms never exempt mixed commercial questions from authority", () => {
  for (const customerText of [
    "Does Power Delivery work, and is delivery available?",
    "What is the price of the Power Delivery charger?",
    "How much is the PowerMax 65W Charger?",
    "What are the shipping fees for the Power Delivery charger?",
    "هل الشاحن يشحن بسرعة وكم سعره؟",
    "هل البطارية تشحن بسرعة وهل متوفر توصيل؟",
    "هل الشاحن يشحن الى بغداد؟",
    "هل يشحن الشاحن للعراق؟",
    "كم رسوم شحن الشاحن؟",
    "شحن الشاحن",
    "Do you offer delivery?",
    "هل يوجد شحن؟",
    "گەیاندن هەیە؟",
  ]) assert.equal(isAuthoritativeFactQuestion(customerText), true, customerText);
});
