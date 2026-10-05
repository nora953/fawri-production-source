import assert from "node:assert/strict";
import test from "node:test";

import {
  normalizeTrustedVisualAlternatives,
  resolveTrustedVisualAlternativeContext,
  qualifyVisualAlternativeStockAnswer,
  safeVisualAlternativeCatalogAnswer,
  visualAlternativeReplyIsQualified,
} from "../src/services/knowledge/visualAlternativePolicy.js";

test("visual alternative normalization deduplicates, bounds, and preserves ranking", () => {
  const result = normalizeTrustedVisualAlternatives({
    trustedVisualAlternative: {
      productId: "legacy",
      confidence: 0.7,
    },
    trustedVisualAlternatives: [
      { productId: "prd-a", variantId: "var-a", confidence: 0.91 },
      { productId: "prd-a", variantId: "var-a", confidence: 0.8 },
      { productId: "prd-b", confidence: 0.84 },
      { productId: "prd-c", confidence: 0.8 },
      { productId: "prd-d", confidence: 0.79 },
    ],
  });

  assert.deepEqual(result.alternatives, [
    { productId: "prd-a", variantId: "var-a", confidence: 0.91 },
    { productId: "prd-b", confidence: 0.84 },
    { productId: "prd-c", confidence: 0.8 },
  ]);
  assert.deepEqual(result.primary, {
    productId: "prd-a",
    variantId: "var-a",
    confidence: 0.91,
  });
});

test("malformed ranked visual alternatives fail closed and cannot fall back to singular trust", () => {
  const result = normalizeTrustedVisualAlternatives({
    trustedVisualAlternative: {
      productId: "legacy",
      confidence: 0.9,
    },
    trustedVisualAlternatives: [
      { productId: "prd-safe", confidence: 0.9 },
      { productId: "", confidence: 0.8 },
    ],
  });

  assert.deepEqual(result.alternatives, []);
  assert.equal(result.primary, null);
});

test("singular trusted visual alternative remains backward compatible when ranked set is absent", () => {
  const result = normalizeTrustedVisualAlternatives({
    trustedVisualAlternative: {
      productId: " legacy-product ",
      variantId: " legacy-variant ",
      confidence: 0.77,
    },
  });

  assert.deepEqual(result.alternatives, [
    {
      productId: "legacy-product",
      variantId: "legacy-variant",
      confidence: 0.77,
    },
  ]);
  assert.deepEqual(result.primary, result.alternatives[0]);
});

test("exact catalog conversation identity takes precedence over visual alternatives", () => {
  const result = resolveTrustedVisualAlternativeContext({
    catalogConversationRef: {
      productId: "exact-product",
      variantId: "exact-variant",
    },
    trustedVisualAlternatives: [
      { productId: "similar-product", confidence: 0.91 },
    ],
  });

  assert.deepEqual(result.catalogHintRef, {
    productId: "exact-product",
    variantId: "exact-variant",
  });
  assert.equal(result.usingTrustedVisualAlternative, false);
  assert.equal(result.primary?.productId, "similar-product");
});

test("visual alternative becomes only a similar-product hint when exact identity is absent", () => {
  const result = resolveTrustedVisualAlternativeContext({
    catalogConversationRef: null,
    trustedVisualAlternatives: [
      { productId: "similar-product", confidence: 0.91 },
    ],
  });

  assert.deepEqual(result.catalogHintRef, {
    productId: "similar-product",
    confidence: 0.91,
  });
  assert.equal(result.usingTrustedVisualAlternative, true);
});

test("visual alternative semantic guard requires similarity language and rejects exact identity claims", () => {
  assert.equal(
    visualAlternativeReplyIsQualified(
      "Yes, we have a similar option: PowerMax 65W Charger.",
    ),
    true,
  );
  assert.equal(
    visualAlternativeReplyIsQualified(
      "نعم، عندنا خيار مشابه: PowerMax 65W Charger.",
    ),
    true,
  );
  assert.equal(
    visualAlternativeReplyIsQualified(
      "هەڵبژاردەیەکی هاوشێوەمان هەیە: PowerMax 65W Charger.",
    ),
    true,
  );

  assert.equal(
    visualAlternativeReplyIsQualified(
      "This is the exact product and a similar option.",
    ),
    false,
  );
  assert.equal(
    visualAlternativeReplyIsQualified(
      "هذا هو نفس المنتج وعندنا خيار مشابه.",
    ),
    false,
  );
  assert.equal(
    visualAlternativeReplyIsQualified(
      "ئەمە هەمان بەرهەمە و هەڵبژاردەیەکی هاوشێوەیە.",
    ),
    false,
  );
});

test("visual alternative stock qualification identifies the item as similar without changing the fact answer", () => {
  assert.equal(
    qualifyVisualAlternativeStockAnswer("3 are currently available.", "en"),
    "For a similar option to the image: 3 are currently available.",
  );
  assert.equal(
    qualifyVisualAlternativeStockAnswer("3 متوفرة حاليًا.", "ar"),
    "بالنسبة لخيار مشابه للصورة: 3 متوفرة حاليًا.",
  );
  assert.equal(
    qualifyVisualAlternativeStockAnswer("3 دانە بەردەستە.", "ku"),
    "بۆ هەڵبژاردەیەکی هاوشێوەی وێنەکە: 3 دانە بەردەستە.",
  );
});

test("deterministic visual alternative catalog fallback exposes only a similar product name", () => {
  assert.equal(
    safeVisualAlternativeCatalogAnswer("PowerMax 65W Charger", "en"),
    "We have a similar option: PowerMax 65W Charger.",
  );
  assert.equal(
    safeVisualAlternativeCatalogAnswer("PowerMax 65W Charger", "ar"),
    "عندنا خيار مشابه: PowerMax 65W Charger.",
  );
  assert.equal(
    safeVisualAlternativeCatalogAnswer("PowerMax 65W Charger", "ku"),
    "هەڵبژاردەیەکی هاوشێوەمان هەیە: PowerMax 65W Charger.",
  );
});

test("visual alternative policy bounds untrusted text inputs", () => {
  const oversizedId = "x".repeat(161);
  const result = normalizeTrustedVisualAlternatives({
    trustedVisualAlternatives: [
      { productId: oversizedId, confidence: 0.9 },
    ],
  });

  assert.equal(result.alternatives.length, 1);
  assert.equal(result.alternatives[0]?.productId.length, 160);
  assert.equal(result.primary?.productId.length, 160);
});
