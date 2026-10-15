import {
  normalizeKnowledgeText,
  tokenizeKnowledgeText,
} from "./normalization.js";
import type {
  KnowledgeLanguage,
  SemanticDocument,
  SemanticMatch,
} from "./types.js";

function ngrams(text: string, width = 3): Set<string> {
  const normalized = normalizeKnowledgeText(text).replace(/\s+/g, " ");
  const result = new Set<string>();
  if (normalized.length <= width) {
    if (normalized) result.add(normalized);
    return result;
  }

  for (let index = 0; index <= normalized.length - width; index += 1) {
    result.add(normalized.slice(index, index + width));
  }
  return result;
}

function jaccard(left: Set<string>, right: Set<string>): number {
  if (left.size === 0 || right.size === 0) return 0;
  let intersection = 0;
  for (const value of left) {
    if (right.has(value)) intersection += 1;
  }
  return intersection / (left.size + right.size - intersection);
}

function tokenCoverage(query: string[], document: string[]): number {
  if (query.length === 0 || document.length === 0) return 0;
  const documentSet = new Set(document);
  const matched = query.filter((token) => documentSet.has(token)).length;
  return matched / query.length;
}

export function scoreSemanticDocument(
  query: string,
  language: KnowledgeLanguage,
  document: SemanticDocument,
): number {
  const normalizedQuery = normalizeKnowledgeText(query);
  const normalizedQuestion = normalizeKnowledgeText(document.question);
  if (!normalizedQuery || !normalizedQuestion) return 0;

  if (normalizedQuery === normalizedQuestion) return 1;

  const queryTokens = tokenizeKnowledgeText(normalizedQuery);
  const documentTokens = tokenizeKnowledgeText(normalizedQuestion);
  const coverage = tokenCoverage(queryTokens, documentTokens);
  const reverseCoverage = tokenCoverage(documentTokens, queryTokens);
  const gramScore = jaccard(ngrams(normalizedQuery), ngrams(normalizedQuestion));
  const languageBoost = document.language === language ? 0.08 : -0.08;
  const containmentBoost =
    normalizedQuery.includes(normalizedQuestion) ||
    normalizedQuestion.includes(normalizedQuery)
      ? 0.18
      : 0;

  return Math.min(
    1,
    Math.max(
      0,
      coverage * 0.45 + reverseCoverage * 0.2 + gramScore * 0.35 + languageBoost + containmentBoost,
    ),
  );
}

export function retrieveSemanticMatch(params: {
  merchantId: string;
  query: string;
  language: KnowledgeLanguage;
  documents: SemanticDocument[];
  threshold?: number;
}): SemanticMatch | null {
  const threshold = params.threshold ?? 0.58;
  const candidates = params.documents
    .filter((document) => document.merchantId === params.merchantId)
    .map((document) => ({
      document,
      score: scoreSemanticDocument(params.query, params.language, document),
    }))
    .sort((left, right) => right.score - left.score);

  const best = candidates[0];
  if (!best || best.score < threshold) return null;

  const second = candidates[1];
  if (second && best.score < 0.9 && best.score - second.score < 0.06) {
    return null;
  }

  return best;
}
