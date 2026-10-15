import { LanguageCode } from "./agentTypes";

export function normalizeText(input: string): string {
  return input
    .toLowerCase()
    .replace(/[أإآ]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/ة/g, "ه")
    .replace(/ؤ/g, "و")
    .replace(/ئ/g, "ي")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function detectLanguage(input: string): LanguageCode {
  const text = input.trim();

  if (!text) return "unknown";

  const hasArabic = /[\u0600-\u06FF]/.test(text);
  const hasEnglish = /[a-zA-Z]/.test(text);

  const soraniHints = [
    "بە",
    "دە",
    "چۆن",
    "نرخ",
    "بەردەست",
    "داواکاری",
    "گەیاندن",
    "سوپاس",
    "تکایە",
  ];

  if (soraniHints.some((word) => text.includes(word))) {
    return "ku_sorani";
  }

  const iraqiHints = [
    "شلون",
    "شكد",
    "بيش",
    "اريد",
    "اكو",
    "عدكم",
    "يوصل",
    "توصيل",
    "حجز",
    "ثبتلي",
  ];

  if (
    iraqiHints.some((word) => normalizeText(text).includes(normalizeText(word)))
  ) {
    return "ar_iq";
  }

  if (hasEnglish && !hasArabic) {
    return "en";
  }

  if (hasArabic) {
    return "ar_iq";
  }

  return "unknown";
}

export function tokenize(input: string): string[] {
  return normalizeText(input)
    .split(" ")
    .map((word) => word.trim())
    .filter(Boolean);
}

export function keywordScore(message: string, keywords: string[]): number {
  const normalizedMessage = normalizeText(message);
  const normalizedKeywords = keywords.map(normalizeText).filter(Boolean);

  if (normalizedKeywords.length === 0) return 0;

  let hits = 0;

  for (const keyword of normalizedKeywords) {
    if (normalizedMessage.includes(keyword)) {
      hits += 1;
    }
  }

  return hits / normalizedKeywords.length;
}

export function similarityScore(a: string, b: string): number {
  const aTokens = new Set(tokenize(a));
  const bTokens = new Set(tokenize(b));

  if (aTokens.size === 0 || bTokens.size === 0) return 0;

  let intersection = 0;

  for (const token of aTokens) {
    if (bTokens.has(token)) {
      intersection += 1;
    }
  }

  const union = new Set([...aTokens, ...bTokens]).size;

  return intersection / union;
}

export function isCancelOrChangeMessage(input: string): boolean {
  const text = normalizeText(input);

  const patterns = [
    "لا اريد",
    "ما اريد",
    "غيرت رايي",
    "غيرت رائي",
    "بدلت رايي",
    "الغاء",
    "الغي",
    "الغيه",
    "خليها",
    "اترك",
    "ما احتاج",
    "اريد غير",
    "اريد الثاني",
    "اريد لون ثاني",
    "مو هذا",
    "هذا لا",
  ];

  return patterns.some((pattern) => text.includes(normalizeText(pattern)));
}

export function makeId(prefix: string): string {
  const random = Math.random().toString(36).slice(2, 10);
  const time = Date.now().toString(36);
  return `${prefix}_${time}_${random}`;
}
