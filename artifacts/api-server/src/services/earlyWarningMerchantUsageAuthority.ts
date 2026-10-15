import { withOperationalTransaction, type OperationalSqlClient } from "./operationalPostgresAuthority";
import { normalizeEarlyWarningCostMonth } from "./earlyWarningCostAuthority";

const DAY_MS = 24 * 60 * 60 * 1_000;

type Row = Record<string, unknown>;

export type MerchantUsageDailyRow = {
  date: string;
  ai_input_tokens: number;
  ai_output_tokens: number;
  ai_total_tokens: number;
  outbound_messages: number;
  attachments_created_bytes: number;
};

export type MerchantUsageTrend = {
  merchant_id: string;
  store_name: string;
  support_storage_bytes: number;
  ai_input_tokens: number;
  ai_output_tokens: number;
  ai_total_tokens: number;
  outbound_messages: number;
  attachments_created_bytes: number;
  daily: MerchantUsageDailyRow[];
};

export type MerchantUsageReport = {
  month: string;
  generated_at: string;
  merchants: MerchantUsageTrend[];
};

function text(value: unknown): string {
  return String(value ?? "").trim();
}

function numberValue(value: unknown): number {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
}

function tokenSql(path: "input_tokens" | "output_tokens" | "total_tokens"): string {
  return `CASE
    WHEN COALESCE(metadata->'ai_usage'->>'${path}', '') ~ '^[0-9]+$'
      THEN (metadata->'ai_usage'->>'${path}')::bigint
    ELSE 0
  END`;
}

function monthBounds(month: string, now: Date): { start: Date; end: Date; snapshotAt: Date; dayCount: number } {
  const [year, monthNumber] = month.split("-").map(Number);
  const start = new Date(Date.UTC(year!, monthNumber! - 1, 1));
  const end = new Date(Date.UTC(year!, monthNumber!, 1));
  const current = now.toISOString().slice(0, 7) === month;
  const snapshotAt = current ? now : new Date(end.getTime() - 1);
  const monthDays = Math.round((end.getTime() - start.getTime()) / DAY_MS);
  const dayCount = current ? Math.min(monthDays, snapshotAt.getUTCDate()) : monthDays;
  return { start, end, snapshotAt, dayCount };
}

function dayKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export async function loadEarlyWarningMerchantUsageReport(input?: {
  month?: string;
  now?: Date;
}): Promise<MerchantUsageReport> {
  const now = input?.now || new Date();
  const month = normalizeEarlyWarningCostMonth(input?.month, now);
  const bounds = monthBounds(month, now);

  const result = await withOperationalTransaction(async (client: OperationalSqlClient) => {
    const merchants = await client.query<Row>(
      `SELECT id AS merchant_id, store_name
       FROM merchants
       WHERE status = 'approved' AND account_status = 'approved'
       ORDER BY store_name, id`,
    );

    const messages = await client.query<Row>(
      `SELECT merchant_id, created_at::date::text AS day,
         COALESCE(SUM(${tokenSql("input_tokens")}), 0) AS ai_input_tokens,
         COALESCE(SUM(${tokenSql("output_tokens")}), 0) AS ai_output_tokens,
         COALESCE(SUM(${tokenSql("total_tokens")}), 0) AS ai_total_tokens,
         COUNT(*) FILTER (WHERE sender = 'fawri') AS outbound_messages
       FROM messages
       WHERE created_at >= $1::timestamptz AND created_at < $2::timestamptz
       GROUP BY merchant_id, created_at::date
       ORDER BY merchant_id, created_at::date`,
      [bounds.start.toISOString(), bounds.end.toISOString()],
    );

    const attachments = await client.query<Row>(
      `SELECT merchant_id, created_at::date::text AS day,
         COALESCE(SUM(size_bytes), 0) AS attachments_created_bytes
       FROM support_attachments
       WHERE created_at >= $1::timestamptz AND created_at < $2::timestamptz
       GROUP BY merchant_id, created_at::date
       ORDER BY merchant_id, created_at::date`,
      [bounds.start.toISOString(), bounds.end.toISOString()],
    );

    const storage = await client.query<Row>(
      `SELECT merchant_id, COALESCE(SUM(size_bytes), 0) AS support_storage_bytes
       FROM support_attachments
       WHERE created_at <= $1::timestamptz
         AND (deleted_at IS NULL OR deleted_at > $1::timestamptz)
       GROUP BY merchant_id`,
      [bounds.snapshotAt.toISOString()],
    );

    return {
      merchants: merchants.rows,
      messages: messages.rows,
      attachments: attachments.rows,
      storage: storage.rows,
    };
  });

  const messageByMerchantDay = new Map<string, Row>();
  for (const row of result.messages) {
    messageByMerchantDay.set(`${text(row.merchant_id)}:${text(row.day)}`, row);
  }
  const attachmentByMerchantDay = new Map<string, Row>();
  for (const row of result.attachments) {
    attachmentByMerchantDay.set(`${text(row.merchant_id)}:${text(row.day)}`, row);
  }
  const storageByMerchant = new Map(
    result.storage.map((row) => [text(row.merchant_id), numberValue(row.support_storage_bytes)]),
  );

  const merchants = result.merchants.map((merchant): MerchantUsageTrend => {
    const merchantId = text(merchant.merchant_id);
    const daily: MerchantUsageDailyRow[] = [];
    let inputTokens = 0;
    let outputTokens = 0;
    let totalTokens = 0;
    let outboundMessages = 0;
    let attachmentsCreatedBytes = 0;

    for (let day = 1; day <= bounds.dayCount; day += 1) {
      const date = dayKey(new Date(Date.UTC(
        bounds.start.getUTCFullYear(),
        bounds.start.getUTCMonth(),
        day,
      )));
      const messageRow = messageByMerchantDay.get(`${merchantId}:${date}`) || {};
      const attachmentRow = attachmentByMerchantDay.get(`${merchantId}:${date}`) || {};
      const aiInput = numberValue(messageRow.ai_input_tokens);
      const aiOutput = numberValue(messageRow.ai_output_tokens);
      const aiTotal = numberValue(messageRow.ai_total_tokens);
      const messages = numberValue(messageRow.outbound_messages);
      const attachmentBytes = numberValue(attachmentRow.attachments_created_bytes);
      inputTokens += aiInput;
      outputTokens += aiOutput;
      totalTokens += aiTotal;
      outboundMessages += messages;
      attachmentsCreatedBytes += attachmentBytes;
      daily.push({
        date,
        ai_input_tokens: aiInput,
        ai_output_tokens: aiOutput,
        ai_total_tokens: aiTotal,
        outbound_messages: messages,
        attachments_created_bytes: attachmentBytes,
      });
    }

    return {
      merchant_id: merchantId,
      store_name: text(merchant.store_name),
      support_storage_bytes: storageByMerchant.get(merchantId) || 0,
      ai_input_tokens: inputTokens,
      ai_output_tokens: outputTokens,
      ai_total_tokens: totalTokens,
      outbound_messages: outboundMessages,
      attachments_created_bytes: attachmentsCreatedBytes,
      daily,
    };
  });

  return {
    month,
    generated_at: now.toISOString(),
    merchants,
  };
}
