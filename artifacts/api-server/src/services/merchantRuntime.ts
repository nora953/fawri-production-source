export type MerchantRuntimeDeletionSummary = {
  products: number;
  conversations: number;
  orders: number;
  orderDrafts: number;
  metaPages: number;
  [key: string]: number;
};

type MerchantRuntimeDeletionHandler = (
  merchantId: string,
) => Partial<MerchantRuntimeDeletionSummary> & Record<string, number>;

const deletionHandlers: MerchantRuntimeDeletionHandler[] = [];

export function registerMerchantRuntimeDeletion(
  handler: MerchantRuntimeDeletionHandler,
): void {
  if (!deletionHandlers.includes(handler)) deletionHandlers.push(handler);
}

export function deleteMerchantRuntimeData(
  merchantId: string,
): MerchantRuntimeDeletionSummary {
  if (deletionHandlers.length === 0) {
    throw new Error("Merchant runtime deletion handler is not registered");
  }

  const summary: MerchantRuntimeDeletionSummary = {
    products: 0,
    conversations: 0,
    orders: 0,
    orderDrafts: 0,
    metaPages: 0,
  };
  for (const handler of deletionHandlers) {
    const result = handler(merchantId);
    for (const [key, value] of Object.entries(result)) {
      const numericValue = Number(value);
      if (!Number.isFinite(numericValue) || numericValue < 0) {
        throw new Error(`Invalid merchant runtime deletion count for ${key}`);
      }
      summary[key] = (summary[key] || 0) + numericValue;
    }
  }
  return summary;
}
