import type { CatalogCommerceFields } from "../catalogCommerceMetadata.js";
import {
  currencyFractionDigits,
  minorUnitsToMajorCurrencyString,
  normalizeCurrencyCode,
} from "../currencyMoneyRuntime.js";

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

  const fulfillable = availableQuantity >= params.requestedQuantity;
  if (fulfillable) {
    if (params.language === "en") {
      return `Yes, ${params.requestedQuantity} of ${params.itemName} are available.`;
    }
    if (params.language === "ku") {
      return `بەڵێ، ${params.requestedQuantity} دانە لە ${params.itemName} بەردەستە.`;
    }
    return `نعم، ${params.requestedQuantity} من ${params.itemName} متوفرة حاليًا.`;
  }

  if (params.language === "en") {
    return `No, the requested quantity of ${params.itemName} is not currently available.`;
  }
  if (params.language === "ku") {
    return `نەخێر، بڕی داواکراو لە ${params.itemName} لە ئێستادا بەردەست نییە.`;
  }
  return `لا، الكمية المطلوبة من ${params.itemName} غير متوفرة حاليًا.`;
}

function currencyLabel(language: "ar" | "ku" | "en", currencyCode: string): string {
  if (currencyCode === "IQD") {
    if (language === "en") return "IQD";
    return "دينار";
  }
  return currencyCode;
}

function formatMinorNumber(amountMinor: number, currencyCodeValue: string): string {
  const currencyCode = normalizeCurrencyCode(currencyCodeValue);
  const digits = currencyFractionDigits(currencyCode);
  const major = minorUnitsToMajorCurrencyString(amountMinor, currencyCode);
  const numeric = Number(major);
  return new Intl.NumberFormat("en-US", {
    useGrouping: true,
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(numeric);
}

export function catalogPriceAnswer(params: {
  language: "ar" | "ku" | "en";
  itemName: string;
  /** Legacy field name; value is merchant-currency minor units. */
  unitPriceIqd: number;
  /** Legacy field name; value is merchant-currency minor units. */
  baseUnitPriceIqd?: number;
  currencyCode?: string;
  promotionApplied?: boolean;
  commerce: CatalogCommerceFields;
}): string {
  const priceType = params.commerce.service_details?.price_type || "fixed";
  const currencyCode = normalizeCurrencyCode(params.currencyCode || "IQD");
  const currency = currencyLabel(params.language, currencyCode);
  const amount = formatMinorNumber(params.unitPriceIqd, currencyCode);
  const basePrice = params.baseUnitPriceIqd ?? params.unitPriceIqd;
  const baseAmount = formatMinorNumber(basePrice, currencyCode);
  const promoted =
    params.promotionApplied === true &&
    basePrice > params.unitPriceIqd;

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

  if (promoted) {
    if (params.commerce.item_type === "service" && priceType === "from") {
      if (params.language === "en") {
        return `${params.itemName} currently starts from ${amount} ${currency} on offer, instead of ${baseAmount} ${currency}.`;
      }
      if (params.language === "ku") {
        return `نرخی ${params.itemName} لە ئێستادا لە ژێر ئۆفەر لە ${amount} ${currency} دەست پێدەکات، لەبری ${baseAmount} ${currency}.`;
      }
      return `سعر ${params.itemName} يبدأ حاليًا ضمن العرض من ${amount} ${currency} بدل ${baseAmount} ${currency}.`;
    }
    if (params.language === "en") {
      return `${params.itemName} is currently ${amount} ${currency} on offer, instead of ${baseAmount} ${currency}.`;
    }
    if (params.language === "ku") {
      return `نرخی ${params.itemName} لە ئێستادا لە ژێر ئۆفەر ${amount} ${currency}ە، لەبری ${baseAmount} ${currency}.`;
    }
    return `سعر ${params.itemName} حاليًا ضمن العرض ${amount} ${currency} بدل ${baseAmount} ${currency}.`;
  }

  if (params.commerce.item_type === "service" && priceType === "from") {
    if (params.language === "en") return `${params.itemName} starts from ${amount} ${currency}.`;
    if (params.language === "ku") return `نرخی ${params.itemName} لە ${amount} ${currency}ەوە دەست پێدەکات.`;
    return `سعر ${params.itemName} يبدأ من ${amount} ${currency}.`;
  }

  if (params.language === "en") return `${params.itemName} is ${amount} ${currency}.`;
  if (params.language === "ku") return `نرخی ${params.itemName} بریتییە لە ${amount} ${currency}.`;
  return `سعر ${params.itemName} هو ${amount} ${currency}.`;
}
