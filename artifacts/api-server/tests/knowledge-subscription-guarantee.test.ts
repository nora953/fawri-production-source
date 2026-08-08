// @ts-nocheck
import assert from "node:assert/strict";
import test from "node:test";
import {
  classifyWarrantyAuthorityDomain,
  isFawriSubscriptionServiceGuaranteeQuestion,
  isMerchantProductWarrantyQuestion,
} from "../src/services/knowledge/subscriptionGuaranteeClassification.js";
import { PostgresOperationalFactResolver } from "../src/services/knowledge/postgresOperationalFactResolver.js";

class RejectingSql {
  queries = [];
  async query(statement, values = []) {
    this.queries.push({ statement, values: [...values] });
    throw new Error("merchant operational authority must not answer warranty/service guarantee");
  }
}

test("Fawri SaaS guarantee wording is classified separately from merchant product warranty", () => {
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
  }
});

test("merchant product warranty remains its own fail-closed authoritative domain", () => {
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
  }
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

test("service-guarantee terms without generic warranty wording cannot become merchant facts", async () => {
  const sql = new RejectingSql();
  const resolver = new PostgresOperationalFactResolver(sql);
  assert.equal(
    await resolver.resolve({
      merchantId: "merchant-a",
      customerText: "أريد تعويض العطل عن اشتراكي",
      language: "ar",
    }),
    null,
  );
  assert.equal(sql.queries.length, 0);
});
