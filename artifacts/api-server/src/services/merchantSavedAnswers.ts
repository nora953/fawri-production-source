type MerchantSavedAnswersDeletionHandler = (
  merchantId: string,
) => number;

let deletionHandler: MerchantSavedAnswersDeletionHandler | undefined;

export function registerMerchantSavedAnswersDeletion(
  handler: MerchantSavedAnswersDeletionHandler,
): void {
  deletionHandler = handler;
}

export function deleteMerchantSavedAnswersData(
  merchantId: string,
): number {
  if (!deletionHandler) {
    throw new Error("Merchant saved-answers deletion handler is not registered");
  }

  return deletionHandler(merchantId);
}
