// @ts-nocheck
import assert from "node:assert/strict";
import test from "node:test";
import {
  createOpenAiApprovedKnowledgeTranslationProvider,
  getOpenAiApprovedKnowledgeTranslationReadiness,
  OPENAI_APPROVED_TRANSLATION_PROVIDER_ID,
} from "../src/services/knowledge/openAiApprovedKnowledgeTranslationProvider.js";

function payload(result, usage = { input_tokens: 11, output_tokens: 7, total_tokens: 18 }) {
  return { output_text: JSON.stringify(result), usage };
}

test("approved translation provider requires an API key and response model", () => {
  assert.equal(getOpenAiApprovedKnowledgeTranslationReadiness({ apiKey: "", model: "model-a" }).ready, false);
  assert.equal(getOpenAiApprovedKnowledgeTranslationReadiness({ apiKey: "test-key", model: "" }).ready, false);
  assert.throws(
    () => createOpenAiApprovedKnowledgeTranslationProvider({ apiKey: "", model: "model-a" }),
    (error) => error?.code === "KNOWLEDGE_TRANSLATION_CONFIG_INVALID",
  );
});

test("translation request is constrained, store=false, professional, and preserves approved facts", async () => {
  let capturedUrl = "";
  let captured;
  const provider = createOpenAiApprovedKnowledgeTranslationProvider({
    apiKey: "test-key",
    model: "test-model",
    fetchImpl: async (url, init) => {
      capturedUrl = String(url);
      captured = JSON.parse(String(init?.body || "{}"));
      return {
        ok: true,
        async json() {
          return payload({
            translation: "This product costs 250,000 IQD and includes SKU-RED.",
            faithful: true,
          });
        },
      };
    },
  });
  const result = await provider.translate({
    merchantId: "merchant-a",
    recordId: "saved-a",
    sourceLanguage: "ar",
    targetLanguage: "en",
    sourceText: "سعر هذا المنتج 250,000 IQD ويتضمن SKU-RED.",
  });
  assert.equal(provider.providerId, OPENAI_APPROVED_TRANSLATION_PROVIDER_ID);
  assert.equal(capturedUrl, "https://api.openai.com/v1/responses");
  assert.equal(captured.store, false);
  assert.equal(captured.model, "test-model");
  assert.match(captured.input[0].content[0].text, /Preserve the exact meaning/);
  assert.match(captured.input[1].content[0].text, /professional English/);
  assert.equal(captured.text.format.strict, true);
  assert.equal(result?.answerText, "This product costs 250,000 IQD and includes SKU-RED.");
  assert.equal(result?.language, "en");
  assert.equal(result?.faithful, true);
  assert.deepEqual(result?.usage, { inputTokens: 11, outputTokens: 7, totalTokens: 18 });
});

test("translation fails closed if a factual token is dropped or provider marks it unfaithful", async () => {
  for (const result of [
    { translation: "The product has a listed price.", faithful: true },
    { translation: "The product costs 250,000 IQD and includes SKU-RED.", faithful: false },
  ]) {
    const provider = createOpenAiApprovedKnowledgeTranslationProvider({
      apiKey: "test-key",
      model: "test-model",
      fetchImpl: async () => ({ ok: true, async json() { return payload(result); } }),
    });
    assert.equal(
      await provider.translate({
        merchantId: "merchant-a",
        recordId: "saved-a",
        sourceLanguage: "ar",
        targetLanguage: "en",
        sourceText: "السعر 250,000 IQD والرمز SKU-RED.",
      }),
      null,
    );
  }
});

test("translation transport failure returns no translation", async () => {
  const provider = createOpenAiApprovedKnowledgeTranslationProvider({
    apiKey: "test-key",
    model: "test-model",
    fetchImpl: async () => { throw new Error("transport failed"); },
  });
  assert.equal(
    await provider.translate({
      merchantId: "merchant-a",
      recordId: "saved-a",
      sourceLanguage: "ar",
      targetLanguage: "en",
      sourceText: "نص معتمد 12345",
    }),
    null,
  );
});
