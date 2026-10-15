export type MerchantAuthDeletionSummary = {
  merchant: number;
  otps: number;
  phone: string;
};

type MerchantAuthDeletionHandler = (
  merchantId: string,
) => MerchantAuthDeletionSummary;

let deletionHandler: MerchantAuthDeletionHandler | undefined;

export function registerMerchantAuthDeletion(
  handler: MerchantAuthDeletionHandler,
): void {
  deletionHandler = handler;
}

export function deleteMerchantAuthData(
  merchantId: string,
): MerchantAuthDeletionSummary {
  if (!deletionHandler) {
    throw new Error("Merchant auth deletion handler is not registered");
  }

  return deletionHandler(merchantId);
}
