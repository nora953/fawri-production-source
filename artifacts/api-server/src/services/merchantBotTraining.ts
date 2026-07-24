export type MerchantBotTrainingDeletionSummary = {
  trainingRequests: number;
  learnedAnswers: number;
};

type MerchantBotTrainingDeletionHandler = (
  merchantId: string,
) => MerchantBotTrainingDeletionSummary;

let deletionHandler: MerchantBotTrainingDeletionHandler | undefined;

export function registerMerchantBotTrainingDeletion(
  handler: MerchantBotTrainingDeletionHandler,
): void {
  deletionHandler = handler;
}

export function deleteMerchantBotTrainingData(
  merchantId: string,
): MerchantBotTrainingDeletionSummary {
  if (!deletionHandler) {
    throw new Error("Merchant bot-training deletion handler is not registered");
  }

  return deletionHandler(merchantId);
}
