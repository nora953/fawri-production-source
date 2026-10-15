// @ts-nocheck
import assert from "node:assert/strict";
import test from "node:test";
import {
  classifyWarrantyAuthorityDomain,
  isFawriSubscriptionServiceGuaranteeQuestion,
  isMerchantProductWarrantyQuestion,
} from "../src/services/knowledge/subscriptionGuaranteeClassification.js";
import { KnowledgeDecisionEngine } from "../src/services/ai/knowledgeDecisionEngine.js";
import { PostgresOperationalFactResolver } from "../src/services/knowledge/postgresOperationalFactResolver.js";
import { isAuthoritativeFactQuestion } from "../src/services/knowledge/postgresKnowledgeRuntime.js";

class RejectingSql {
  queries = [];
  async query(statement, values = []) {
    this.queries.push({ statement, values: [...values] });
    throw new Error("merchant operational authority must not answer warranty/service guarantee");
  }
}

test("Fawri SaaS guarantee wording is classified separately and stays authoritative", () => {
  for (const question of [
    "شنو ضمان فوري؟",
    "شلون ضمان الاشتراك؟",
    "أستحق تعويض العطل؟",
    "أكدر أطلب استرجاع الاشتراك؟",
    "What is the subscription service guarantee?",
    "Do I get outage compensation?",
  ]) {
    assert.equal(
      classifyWarrantyAuthorityDomain(question),
      "fawri_subscription_service_guarantee",
      question,
    );
    assert.equal(isFawriSubscriptionServiceGuaranteeQuestion(question), true);
    assert.equal(isMerchantProductWarrantyQuestion(question), false);
    assert.equal(isAuthoritativeFactQuestion(question), true, question);
  }
});

test("merchant product warranty is classified separately but may use approved merchant knowledge", () => {
  for (const question of [
    "شنو ضمان هذا المنتج؟",
    "هل اكو كفالة على الجهاز؟",
    "Does this product have a warranty?",
  ]) {
    assert.equal(
      classifyWarrantyAuthorityDomain(question),
      "merchant_product_warranty",
      question,
    );
    assert.equal(isMerchantProductWarrantyQuestion(question), true);
    assert.equal(isFawriSubscriptionServiceGuaranteeQuestion(question), false);
    assert.equal(isAuthoritativeFactQuestion(question), false, question);
  }
});

test("merchant product warranty can resolve through an approved Saved Answer", async () => {
  const savedAnswer = {
    id: "saved-warranty-a",
    merchantId: "merchant-a",
    category: "warranty",
    questionPattern: "شنو ضمان هذا المنتج؟",
    answerText: "ضمان هذا المنتج سنة واحدة حسب سياسة المتجر.",
    language: "ar",
    source: "merchant_approved",
    active: true,
    version: 1,
    createdAt: "2026-09-24T00:00:00.000Z",
    updatedAt: "2026-09-24T00:00:00.000Z",
  };

  const engine = new KnowledgeDecisionEngine({
    runtime: {
      authorityId: "warranty-approved-test",
      legacyFallbackEnabled: false,
      async findApprovedSavedAnswer({ merchantId, customerText, language }) {
        assert.equal(merchantId, "merchant-a");
        assert.equal(customerText, "شنو ضمان هذا المنتج؟");
        assert.equal(language, "ar");
        return savedAnswer;
      },
      async listApprovedSemanticDocuments() {
        return [];
      },
      async retrieveSemanticMatch() {
        return null;
      },
      async createTrainingRequest() {
        throw new Error("approved warranty must not create training");
      },
      async recordGeneratedCandidate() {
        throw new Error("approved warranty must not invoke generated candidate flow");
      },
      async appendAudit() {
        return undefined;
      },
    },
    factResolver: {
      async resolve() {
        return null;
      },
    },
    policyResolver: null,
  });

  const result = await engine.decide({
    merchantId: "merchant-a",
    customerText: "شنو ضمان هذا المنتج؟",
    languageHint: "ar",
  });

  assert.equal(result.action, "reply");
  assert.equal(result.stage, "approved_saved_answer");
  assert.equal(result.source, "merchant_approved");
  assert.equal(result.matchedRecordId, "saved-warranty-a");
  assert.equal(result.answerText, savedAnswer.answerText);
});

test("merchant operational fact resolver does not answer either warranty authority", async () => {
  const sql = new RejectingSql();
  const resolver = new PostgresOperationalFactResolver(sql);

  assert.equal(
    await resolver.resolve({
      merchantId: "merchant-a",
      customerText: "شنو ضمان هذا المنتج؟",
      language: "ar",
    }),
    null,
  );
  assert.equal(
    await resolver.resolve({
      merchantId: "merchant-a",
      customerText: "شنو ضمان فوري للاشتراك؟",
      language: "ar",
    }),
    null,
  );
  assert.equal(sql.queries.length, 0);
});

test("service-guarantee terms without generic warranty wording cannot fall through", async () => {
  const sql = new RejectingSql();
  const resolver = new PostgresOperationalFactResolver(sql);
  const question = "أريد تعويض العطل عن اشتراكي";
  assert.equal(
    await resolver.resolve({
      merchantId: "merchant-a",
      customerText: question,
      language: "ar",
    }),
    null,
  );
  assert.equal(isAuthoritativeFactQuestion(question), true);
  assert.equal(sql.queries.length, 0);
});
