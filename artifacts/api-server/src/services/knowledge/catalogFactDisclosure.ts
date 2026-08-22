import type { CatalogCommerceFields } from "../catalogCommerceMetadata.js";

export function requestedCatalogQuantity(customerText: string): number | null {
  const normalized = String(customerText || "")
    .replace(/[٠-٩]/g, (digit) => String("٠١٢٣٤٥٦٧٨٩".indexOf(digit)))
    .replace(/[۰-۹]/g, (digit) => String("۰۱۲۳۴۵۶۷۸۹".indexOf(digit)))
    .toLocaleLowerCase("en-US");

  const patterns = [
    /(?:أريد|اريد|أحتاج|احتاج|خذلي|اعطني|أعطني|want|need|order|give\s+me)\s+(\d{1,6})(?=\s|$)/u,
    /(\d{1,6})\s*(?:قطعة|قطع|حبة|حبات|وحدة|وحدات|piece|pieces|pcs|unit|units)(?=\s|$)/u,
    /(?:كمية|الكمية|quantity|qty)\s*[:=]?\s*(\d{1,6})(?=\s|$)/u,
  ];

  for (const pattern of patterns) {
    const match = normalized.match(pattern);
    if (!match?.[1]) continue;
    const parsed = Number(match[1]);
    if (Number.isSafeInteger(parsed) && parsed > 0) return parsed;
  }
  return null;
}

export function catalogAvailabilityAnswer(params: {
  language: "ar" | "ku" | "en";
  itemName: string;
  status: string;
  authoritativeQuantity: number;
  commerce: CatalogCommerceFields;
  requestedQuantity: number | null;
}): string {
  const statusAvailable = params.status !== "out_of_stock";

  if (!params.commerce.track_inventory) {
    if (params.language === "en") {
      return `${params.itemName} is ${statusAvailable ? "currently available" : "currently unavailable"}.`;
    }
    if (params.language === "ku") {
      return `${params.itemName} ${statusAvailable ? "لە ئێستادا بەردەستە" : "لە ئێستادا بەردەست نییە"}.`;
    }
    return `${params.itemName} ${statusAvailable ? "متوفر حاليًا" : "غير متوفر حاليًا"}.`;
  }

  const availableQuantity = statusAvailable ? Math.max(0, params.authoritativeQuantity) : 0;
  if (!params.requestedQuantity) {
    if (params.language === "en") {
      return `${params.itemName} is ${availableQuantity > 0 ? "currently available" : "currently out of stock"}.`;
    }
    if (params.language === "ku") {
      return `${params.itemName} ${availableQuantity > 0 ? "لە ئێستادا بەردەستە" : "لە ئێستادا بەردەست نییە"}.`;
    }
    return `${params.itemName} ${availableQuantity > 0 ? "متوفر حاليًا" : "غير متوفر حاليًا"}.`;
  }

  const fulfillable = Math.min(params.requestedQuantity, availableQuantity);
  if (fulfillable === params.requestedQuantity) {
    if (params.language === "en") {
      return `Yes, ${params.requestedQuantity} of ${params.itemName} are available.`;
    }
    if (params.language === "ku") {
      return `بەڵێ، ${params.requestedQuantity} دانە لە ${params.itemName} بەردەستە.`;
    }
    return `نعم، ${params.requestedQuantity} من ${params.itemName} متوفرة حاليًا.`;
  }

  if (fulfillable > 0) {
    if (params.language === "en") {
      return `Only ${fulfillable} of ${params.itemName} are currently available.`;
    }
    if (params.language === "ku") {
      return `لە ئێستادا تەنها ${fulfillable} دانە لە ${params.itemName} بەردەستە.`;
    }
    return `المتوفر حاليًا من ${params.itemName} هو ${fulfillable} فقط.`;
  }

  if (params.language === "en") return `${params.itemName} is currently out of stock.`;
  if (params.language === "ku") return `${params.itemName} لە ئێستادا بەردەست نییە.`;
  return `${params.itemName} غير متوفر حاليًا.`;
}

export function catalogPriceAnswer(params: {
  language: "ar" | "ku" | "en";
  itemName: string;
  unitPriceIqd: number;
  commerce: CatalogCommerceFields;
}): string {
  const priceType = params.commerce.service_details?.price_type || "fixed";
  const amount = params.unitPriceIqd.toLocaleString("en-US");

  if (params.commerce.item_type === "service" && priceType === "free") {
    if (params.language === "en") return `${params.itemName} is free.`;
    if (params.language === "ku") return `${params.itemName} بەخۆڕاییە.`;
    return `خدمة ${params.itemName} مجانية.`;
  }
  if (params.commerce.item_type === "service" && priceType === "custom") {
    if (params.language === "en") return `The price of ${params.itemName} depends on the request details.`;
    if (params.language === "ku") return `نرخی ${params.itemName} بە پێی وردەکاریی داواکاری دیاری دەکرێت.`;
    return `سعر ${params.itemName} يُحدد حسب تفاصيل الطلب.`;
  }
  if (params.commerce.item_type === "service" && priceType === "from") {
    if (params.language === "en") return `${params.itemName} starts from ${amount} IQD.`;
    if (params.language === "ku") return `نرخی ${params.itemName} لە ${amount} دینارەوە دەست پێدەکات.`;
    return `سعر ${params.itemName} يبدأ من ${amount} دينار.`;
  }

  if (params.language === "en") return `${params.itemName} is ${amount} IQD.`;
  if (params.language === "ku") return `نرخی ${params.itemName} بریتییە لە ${amount} دینار.`;
  return `سعر ${params.itemName} هو ${amount} دينار.`;
}
