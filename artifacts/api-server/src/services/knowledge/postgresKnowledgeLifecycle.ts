import {
  getPostgresKnowledgeSqlClient,
  KnowledgeRuntimeGateError,
  type KnowledgeSqlClient,
} from "./postgresKnowledgeRuntime.js";

export type MerchantKnowledgeDeletionSummary = {
  savedAnswers: number;
  trainingRequests: number;
  learnedAnswers: number;
};

function normalizeMerchantId(value: string): string {
  const merchantId = String(value || "").trim();
  if (!merchantId) {
    throw new KnowledgeRuntimeGateError(
      "KNOWLEDGE_MERCHANT_REQUIRED",
      "merchant is required",
      400,
    );
  }
  return merchantId;
}

export async function deleteMerchantKnowledgePostgresData(
  value: string,
  sql: KnowledgeSqlClient = getPostgresKnowledgeSqlClient(),
): Promise<MerchantKnowledgeDeletionSummary> {
  const merchantId = normalizeMerchantId(value);

  try {
    return await sql.transaction(async (tx) => {
      // Remove vectors first so no stale semantic records survive a partial cleanup.
      await tx.query(
        `DELETE FROM knowledge_embeddings WHERE merchant_id = $1`,
        [merchantId],
      );

      const learned = await tx.query<{ id: string }>(
        `DELETE FROM learned_answers WHERE merchant_id = $1 RETURNING id`,
        [merchantId],
      );
      const training = await tx.query<{ id: string }>(
        `DELETE FROM training_requests WHERE merchant_id = $1 RETURNING id`,
        [merchantId],
      );
      const saved = await tx.query<{ id: string }>(
        `DELETE FROM saved_answers WHERE merchant_id = $1 RETURNING id`,
        [merchantId],
      );

      // Audit is tenant-owned Knowledge data too. It is not part of the public
      // deletion counters, but must not survive permanent merchant deletion.
      await tx.query(
        `DELETE FROM knowledge_audit_events WHERE merchant_id = $1`,
        [merchantId],
      );

      return {
        savedAnswers: saved.rows.length,
        trainingRequests: training.rows.length,
        learnedAnswers: learned.rows.length,
      };
    });
  } catch (error) {
    if (error instanceof KnowledgeRuntimeGateError) throw error;
    throw new KnowledgeRuntimeGateError(
      "KNOWLEDGE_DATABASE_WRITE_FAILED",
      "knowledge database write failed",
    );
  }
}
