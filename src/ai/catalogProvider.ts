import fs from "fs/promises";
import path from "path";
import { ProductRecord, StorePolicy } from "./agentTypes";
import { normalizeText, similarityScore } from "./textUtils";

async function readJsonFile<T>(filePath: string, fallback: T): Promise<T> {
  try {
    const raw = await fs.readFile(filePath, "utf8");
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function merchantFilePath(fileName: string, merchantId: string): string {
  return path.join(process.cwd(), "data", `${fileName}.${merchantId}.json`);
}

function defaultFilePath(fileName: string): string {
  return path.join(process.cwd(), "data", `${fileName}.json`);
}

export async function getMerchantProducts(
  merchantId: string,
): Promise<ProductRecord[]> {
  const merchantFile = merchantFilePath("products", merchantId);
  const defaultFile = defaultFilePath("products");

  const merchantProducts = await readJsonFile<ProductRecord[] | null>(
    merchantFile,
    null,
  );

  if (Array.isArray(merchantProducts)) {
    return merchantProducts;
  }

  return readJsonFile<ProductRecord[]>(defaultFile, []);
}

export async function getStorePolicy(merchantId: string): Promise<StorePolicy> {
  const fallback: StorePolicy = {
    merchantName: "المتجر",
    language: "ar_iq",
    tone: "لبق، مختصر، محترم، مثل موظف مبيعات خبير",
    deliveryInfo:
      "التوصيل يعتمد على المنطقة. اسأل العميل عن منطقته عند الحاجة.",
    paymentInfo: "طرق الدفع حسب سياسة المتجر.",
    returnPolicy: "الاستبدال والاسترجاع حسب سياسة المتجر وبعد مراجعة الطلب.",
    bookingPolicy: "تثبيت الطلب يحتاج المنتج، الكمية، رقم الهاتف، والعنوان.",
    requiredOrderFields: ["productName", "quantity", "phone", "address"],
    humanHandoffText: "حتى نساعدك بشكل أدق، راح أحوّل طلبك للفريق المختص.",
  };

  const merchantFile = merchantFilePath("store-policy", merchantId);
  const defaultFile = defaultFilePath("store-policy");

  const merchantPolicy = await readJsonFile<StorePolicy | null>(
    merchantFile,
    null,
  );

  if (merchantPolicy) {
    return {
      ...fallback,
      ...merchantPolicy,
    };
  }

  const defaultPolicy = await readJsonFile<StorePolicy | null>(
    defaultFile,
    null,
  );

  if (defaultPolicy) {
    return {
      ...fallback,
      ...defaultPolicy,
    };
  }

  return fallback;
}

export async function findProductByMessage(params: {
  merchantId: string;
  message: string;

  /*
    عند تغيير المنتج:
    - preferLastMention يجعل النظام يفضّل آخر منتج مذكور في الرسالة.
    - excludeProductIds يستثني المنتج القديم إذا نريد تركه.
  */
  preferLastMention?: boolean;
  excludeProductIds?: string[];
}): Promise<{
  product: ProductRecord | null;
  score: number;
}> {
  const products = await getMerchantProducts(params.merchantId);

  const excludedIds = new Set(params.excludeProductIds ?? []);

  let bestProduct: ProductRecord | null = null;
  let bestScore = 0;
  let bestMentionIndex = -1;

  const normalizedMessage = normalizeText(params.message);

  for (const product of products) {
    if (excludedIds.has(product.id)) {
      continue;
    }

    const namesToCheck = [
      product.name,
      ...(product.aliases ?? []),
      ...(product.colors ?? []),
      ...(product.sizes ?? []),
      product.category ?? "",
    ].filter(Boolean);

    let productScore = 0;
    let productMentionIndex = -1;

    for (const name of namesToCheck) {
      const normalizedName = normalizeText(name);

      if (!normalizedName) continue;

      const mentionIndex = normalizedMessage.lastIndexOf(normalizedName);

      if (mentionIndex >= 0) {
        productMentionIndex = Math.max(productMentionIndex, mentionIndex);

        /*
          إذا الرسالة تحتوي أكثر من منتج، نعطي أفضلية بسيطة للمنتج المذكور لاحقاً.
          مثال: "لا أريد المنتج الأول، أريد المنتج الثاني"
          هنا المنتج الثاني لازم يفوز.
        */
        const positionBonus = params.preferLastMention
          ? Math.min(
              0.04,
              (mentionIndex / Math.max(1, normalizedMessage.length)) * 0.04,
            )
          : 0;

        productScore = Math.max(productScore, 0.95 + positionBonus);
      } else {
        productScore = Math.max(
          productScore,
          similarityScore(normalizedMessage, normalizedName),
        );
      }
    }

    const isBetterScore = productScore > bestScore;

    const isTieButLaterMention =
      params.preferLastMention === true &&
      Math.abs(productScore - bestScore) < 0.0001 &&
      productMentionIndex > bestMentionIndex;

    if (isBetterScore || isTieButLaterMention) {
      bestScore = productScore;
      bestMentionIndex = productMentionIndex;
      bestProduct = product;
    }
  }

  if (bestScore < 0.45) {
    return {
      product: null,
      score: bestScore,
    };
  }

  return {
    product: bestProduct,
    score: bestScore,
  };
}

export function formatProductPrice(product: ProductRecord): string | null {
  if (
    product.price === null ||
    product.price === undefined ||
    product.price === ""
  ) {
    return null;
  }

  const currency = product.currency || "IQD";

  return `${product.price} ${currency}`;
}

export function isProductAvailable(product: ProductRecord): boolean | null {
  if (typeof product.available === "boolean") {
    return product.available;
  }

  return null;
}

export function getProductDisplayName(product: ProductRecord): string {
  return product.name;
}
