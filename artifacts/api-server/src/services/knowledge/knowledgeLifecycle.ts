import { registerMerchantSavedAnswersDeletion } from "../merchantSavedAnswers.js";
import { registerMerchantBotTrainingDeletion } from "../merchantBotTraining.js";
import { getKnowledgeRepository } from "./knowledgeRepository.js";

registerMerchantSavedAnswersDeletion((merchantId) =>
  getKnowledgeRepository().deleteMerchantSavedAnswers(merchantId),
);

registerMerchantBotTrainingDeletion((merchantId) =>
  getKnowledgeRepository().deleteMerchantTrainingData(merchantId),
);
