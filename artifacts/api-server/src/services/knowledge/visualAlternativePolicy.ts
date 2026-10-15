import { boundedText } from "./normalization.js";
import type { KnowledgeLanguage } from "./types.js";

export type TrustedVisualAlternative = {
  productId: string;
  variantId?: string;
  confidence: number;
};

const MAX_VISUAL_ALTERNATIVES = 3;

const VISUAL_ALTERNATIVE_QUALIFICATION_CUES = [
  /\b(?:similar|alternative|close match|closest option|comparable option)\b/i,
  /(?:مشابه|مشابهة|شبيه|شبيهة|بديل|بديلة|خيار قريب|أقرب خيار)/i,
  /(?:هاوشێوە|نزیک|جێگرەوە)/i,
] as const;

const VISUAL_ALTERNATIVE_EXACT_IDENTITY_CUES = [
  /\b(?:this|it)\s+(?:is|'s)\s+(?:the\s+)?(?:same|exact)\b/i,
  /\b(?:same|exact)\s+(?:product|item|model)\b/i,
  /(?:هذا|هذه|هذي|هو|هي)\s+(?:هو\s+|هي\s+)?(?:نفس|ذات)(?=\s|[،,.؛:!?؟]|$)/i,
  /(?:نفس|ذات)\s+(?:المنتج|القطعة|الموديل)(?=\s|[،,.؛:!?؟]|$)/i,
  /(?:ئەمە|ئەوە)\s+(?:هەمان|خودی)(?=\s|[،,.؛:!?؟]|$)/i,
  /(?:هەمان|خودی)\s+(?:بەرهەم|کاڵا|مۆدێل)(?=\s|[،,.؛:!?؟]|$)/i,
] as const;

function normalizeOneVisualAlternative(
  value:
    | {
        productId?: unknown;
        variantId?: unknown;
        confidence?: unknown;
      }
    | null
    | undefined,
): TrustedVisualAlternative | null {
  const productId = boundedText(value?.productId, 160);
  const variantId = boundedText(value?.variantId, 160);
  const confidence = value?.confidence;

  if (
    !productId ||
    typeof confidence !== "number" ||
    !Number.isFinite(confidence) ||
    confidence < 0 ||
    confidence > 1
  ) {
    return null;
  }

  return {
    productId,
    ...(variantId ? { variantId } : {}),
    confidence,
  };
}

export function normalizeTrustedVisualAlternatives(input: {
  trustedVisualAlternative?: {
    productId?: unknown;
    variantId?: unknown;
    confidence?: unknown;
  } | null;
  trustedVisualAlternatives?: Array<{
    productId?: unknown;
    variantId?: unknown;
    confidence?: unknown;
  }> | null;
}): {
  alternatives: TrustedVisualAlternative[];
  primary: TrustedVisualAlternative | null;
} {
  const singular = normalizeOneVisualAlternative(
    input.trustedVisualAlternative,
  );

  if (input.trustedVisualAlternatives === undefined) {
    const alternatives = singular ? [singular] : [];
    return {
      alternatives,
      primary: alternatives[0] || null,
    };
  }

  if (!Array.isArray(input.trustedVisualAlternatives)) {
    return { alternatives: [], primary: null };
  }

  const alternatives: TrustedVisualAlternative[] = [];
  const seen = new Set<string>();

  for (const candidate of input.trustedVisualAlternatives) {
    const normalized = normalizeOneVisualAlternative(candidate);
    if (!normalized) {
      return { alternatives: [], primary: null };
    }

    if (alternatives.length >= MAX_VISUAL_ALTERNATIVES) continue;

    const key = `${normalized.productId}\\u0000${normalized.variantId || ""}`;
    if (seen.has(key)) continue;
    seen.add(key);
    alternatives.push(normalized);
  }

  return {
    alternatives,
    primary: alternatives[0] || null,
  };
}

export function resolveTrustedVisualAlternativeContext(input: {
  catalogConversationRef?: {
    productId: string;
    variantId?: string;
  } | null;
  trustedVisualAlternative?: {
    productId?: unknown;
    variantId?: unknown;
    confidence?: unknown;
  } | null;
  trustedVisualAlternatives?: Array<{
    productId?: unknown;
    variantId?: unknown;
    confidence?: unknown;
  }> | null;
}) {
  const { alternatives, primary } =
    normalizeTrustedVisualAlternatives(input);

  // Exact conversation identity always wins. Visual alternatives remain
  // similar-product hints and never become exact customer identity.
  return {
    alternatives,
    primary,
    catalogHintRef: input.catalogConversationRef || primary,
    usingTrustedVisualAlternative:
      Boolean(primary && !input.catalogConversationRef),
  };
}

export function visualAlternativeReplyIsQualified(
  answerText: string,
): boolean {
  const normalized = boundedText(answerText, 2_000);
  if (!normalized) return false;

  const hasQualification =
    VISUAL_ALTERNATIVE_QUALIFICATION_CUES.some((pattern) =>
      pattern.test(normalized),
    );
  const claimsExactIdentity =
    VISUAL_ALTERNATIVE_EXACT_IDENTITY_CUES.some((pattern) =>
      pattern.test(normalized),
    );

  return hasQualification && !claimsExactIdentity;
}

export function qualifyVisualAlternativeStockAnswer(
  factAnswerText: string,
  language: KnowledgeLanguage,
): string {
  const answer = boundedText(factAnswerText, 2_000);

  return language === "ar"
    ? `بالنسبة لخيار مشابه للصورة: ${answer}`
    : language === "ku"
      ? `بۆ هەڵبژاردەیەکی هاوشێوەی وێنەکە: ${answer}`
      : `For a similar option to the image: ${answer}`;
}

export function safeVisualAlternativeCatalogAnswer(
  productName: string,
  language: KnowledgeLanguage,
): string {
  const name = boundedText(productName, 300);

  return language === "ar"
    ? `عندنا خيار مشابه: ${name}.`
    : language === "ku"
      ? `هەڵبژاردەیەکی هاوشێوەمان هەیە: ${name}.`
      : `We have a similar option: ${name}.`;
}
