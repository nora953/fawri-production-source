import { getKnowledgeDecisionEngine } from "./ai/knowledgeDecisionEngine";

export async function decideMetaKnowledgeReply(
  input: Parameters<ReturnType<typeof getKnowledgeDecisionEngine>["decide"]>[0],
  decide = (decisionInput: typeof input) => getKnowledgeDecisionEngine().decide(decisionInput),
) {
  try {
    return await decide(input);
  } catch {
    throw Object.assign(new Error("Knowledge reply decision is unavailable"), {
      code: "META_REPLY_DECISION_UNAVAILABLE",
    });
  }
}
