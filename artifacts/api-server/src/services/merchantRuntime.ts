export type MerchantRuntimeDeletionSummary = {
  products: number;
  conversations: number;
  orders: number;
  orderDrafts: number;
  metaPages: number;
};

type MerchantRuntimeDeletionHandler = (
  merchantId: string,
) => MerchantRuntimeDeletionSummary;

let deletionHandler: MerchantRuntimeDeletionHandler | undefined;

export function registerMerchantRuntimeDeletion(
  handler: MerchantRuntimeDeletionHandler,
): void {
  deletionHandler = handler;
}

export function deleteMerchantRuntimeData(
  merchantId: string,
): MerchantRuntimeDeletionSummary {
  if (!deletionHandler) {
    throw new Error("Merchant runtime deletion handler is not registered");
  }

  return deletionHandler(merchantId);
}
