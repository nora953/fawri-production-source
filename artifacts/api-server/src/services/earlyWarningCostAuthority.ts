import { withOperationalTransaction } from "./operationalPostgresAuthority";

const BYTES_PER_GB = 1024 ** 3;

type AggregateRow = Record<string, unknown>;

type CostRates = {
  ai_input_per_1m_usd: number | null;
  ai_output_per_1m_usd: number | null;
  outbound_message_per_1000_usd: number | null;
  support_storage_per_gb_month_usd: number | null;
};

export type EarlyWarningMerchantCostRow = {
  merchant_id: string;
  store_name: string;
  ai_input_tokens: number;
  ai_output_tokens: number;
  ai_total_tokens: number;
  outbound_messages: number;
  support_storage_bytes: number;
  attachments_created_bytes: number;
  known_cost_usd: number | null;
};

export type EarlyWarningDailyUsageRow = {
  date: string;
  ai_input_tokens: number;
  ai_output_tokens: number;
  ai_total_tokens: number;
  outbound_messages: number;
  known_variable_cost_usd: number | null;
};

export type EarlyWarningCostReport = {
  currency: "USD";
  month: string;
  month_started_at: string;
  generated_at: string;
  actual_billing_connected: false;
  pricing_status: "unconfigured" | "partial" | "configured";
  pricing_coverage_percent: number;
  rates: CostRates;
  unpriced_services: string[];
  known_monthly_cost_usd: number | null;
  projected_month_end_cost_usd: number | null;
  usage: {
    ai_input_tokens: number;
    ai_output_tokens: number;
    ai_total_tokens: number;
    outbound_messages: number;
    support_storage_bytes: number;
    attachments_created_bytes: number;
  };
  services: Array<{
    id: "ai_input" | "ai_output" | "outbound_messages" | "support_storage";
    usage: number;
    unit: string;
    rate_usd: number | null;
    known_cost_usd: number | null;
  }>;
  merchants: EarlyWarningMerchantCostRow[];
  daily: EarlyWarningDailyUsageRow[];
};

function text(value: unknown): string {
  return String(value ?? "").trim();
}

function numberValue(value: unknown): number {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
}

function money(value: number): number {
  return Math.round(value * 1_000_000) / 1_000_000;
}

function configuredRate(name: string): number | null {
  const raw = String(process.env[name] ?? "").trim();
  if (!raw) return null;
  const value = Number(raw);
  return Number.isFinite(value) && value >= 0 ? value : null;
}

function ratesFromEnvironment(): CostRates {
  return {
    ai_input_per_1m_usd: configuredRate("FAWRI_COST_AI_INPUT_PER_1M_USD"),
    ai_output_per_1m_usd: configuredRate("FAWRI_COST_AI_OUTPUT_PER_1M_USD"),
    outbound_message_per_1000_usd: configuredRate("FAWRI_COST_OUTBOUND_MESSAGE_PER_1000_USD"),
    support_storage_per_gb_month_usd: configuredRate("FAWRI_COST_SUPPORT_STORAGE_PER_GB_MONTH_USD"),
  };
}

function componentCost(input: {
  inputTokens: number;
  outputTokens: number;
  outboundMessages: number;
  storageBytes: number;
  rates: CostRates;
}): {
  input: number | null;
  output: number | null;
  outbound: number | null;
  storage: number | null;
  total: number | null;
  variable: number | null;
} {
  const inputCost = input.rates.ai_input_per_1m_usd === null
    ? null
    : money((input.inputTokens / 1_000_000) * input.rates.ai_input_per_1m_usd);
  const outputCost = input.rates.ai_output_per_1m_usd === null
    ? null
    : money((input.outputTokens / 1_000_000) * input.rates.ai_output_per_1m_usd);
  const outboundCost = input.rates.outbound_message_per_1000_usd === null
    ? null
    : money((input.outboundMessages / 1_000) * input.rates.outbound_message_per_1000_usd);
  const storageCost = input.rates.support_storage_per_gb_month_usd === null
    ? null
    : money((input.storageBytes / BYTES_PER_GB) * input.rates.support_storage_per_gb_month_usd);
  const known = [inputCost, outputCost, outboundCost, storageCost].filter(
    (value): value is number => value !== null,
  );
  const variableKnown = [inputCost, outputCost, outboundCost].filter(
    (value): value is number => value !== null,
  );
  return {
    input: inputCost,
    output: outputCost,
    outbound: outboundCost,
    storage: storageCost,
    total: known.length === 0 ? null : money(known.reduce((sum, value) => sum + value, 0)),
    variable: variableKnown.length === 0
      ? null
      : money(variableKnown.reduce((sum, value) => sum + value, 0)),
  };
}

function monthBounds(now: Date): { start: Date; end: Date; daysInMonth: number; elapsedDays: number } {
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
  const daysInMonth = Math.round((end.getTime() - start.getTime()) / (24 * 60 * 60 * 1_000));
  const elapsedDays = Math.max(1, (now.getTime() - start.getTime()) / (24 * 60 * 60 * 1_000));
  return { start, end, daysInMonth, elapsedDays };
}

function tokenSql(path: "input_tokens" | "output_tokens" | "total_tokens"): string {
  return `CASE
    WHEN COALESCE(metadata->'ai_usage'->>'${path}', '') ~ '^[0-9]+$'
      THEN (metadata->'ai_usage'->>'${path}')::bigint
    ELSE 0
  END`;
}

export async function loadEarlyWarningCostReport(now = new Date()): Promise<EarlyWarningCostReport> {
  const rates = ratesFromEnvironment();
  const bounds = monthBounds(now);

  const result = await withOperationalTransaction(async (client) => {
    const merchants = await client.query<AggregateRow>(
      `WITH message_usage AS (
         SELECT merchant_id,
           COALESCE(SUM(${tokenSql("input_tokens")}), 0) AS ai_input_tokens,
           COALESCE(SUM(${tokenSql("output_tokens")}), 0) AS ai_output_tokens,
           COALESCE(SUM(${tokenSql("total_tokens")}), 0) AS ai_total_tokens,
           COUNT(*) FILTER (WHERE sender = 'fawri') AS outbound_messages
         FROM messages
         WHERE created_at >= $1::timestamptz AND created_at < $2::timestamptz
         GROUP BY merchant_id
       ), active_storage AS (
         SELECT merchant_id,
           COALESCE(SUM(size_bytes), 0) AS support_storage_bytes
         FROM support_attachments
         WHERE deleted_at IS NULL
         GROUP BY merchant_id
       ), month_attachments AS (
         SELECT merchant_id,
           COALESCE(SUM(size_bytes), 0) AS attachments_created_bytes
         FROM support_attachments
         WHERE created_at >= $1::timestamptz AND created_at < $2::timestamptz
         GROUP BY merchant_id
       )
       SELECT m.id AS merchant_id, m.store_name,
         COALESCE(mu.ai_input_tokens, 0) AS ai_input_tokens,
         COALESCE(mu.ai_output_tokens, 0) AS ai_output_tokens,
         COALESCE(mu.ai_total_tokens, 0) AS ai_total_tokens,
         COALESCE(mu.outbound_messages, 0) AS outbound_messages,
         COALESCE(storage.support_storage_bytes, 0) AS support_storage_bytes,
         COALESCE(month_files.attachments_created_bytes, 0) AS attachments_created_bytes
       FROM merchants m
       LEFT JOIN message_usage mu ON mu.merchant_id = m.id
       LEFT JOIN active_storage storage ON storage.merchant_id = m.id
       LEFT JOIN month_attachments month_files ON month_files.merchant_id = m.id
       WHERE m.status = 'approved' AND m.account_status = 'approved'
       ORDER BY m.store_name, m.id`,
      [bounds.start.toISOString(), bounds.end.toISOString()],
    );

    const daily = await client.query<AggregateRow>(
      `SELECT created_at::date::text AS day,
         COALESCE(SUM(${tokenSql("input_tokens")}), 0) AS ai_input_tokens,
         COALESCE(SUM(${tokenSql("output_tokens")}), 0) AS ai_output_tokens,
         COALESCE(SUM(${tokenSql("total_tokens")}), 0) AS ai_total_tokens,
         COUNT(*) FILTER (WHERE sender = 'fawri') AS outbound_messages
       FROM messages
       WHERE created_at >= $1::timestamptz AND created_at < $2::timestamptz
       GROUP BY created_at::date
       ORDER BY created_at::date`,
      [bounds.start.toISOString(), bounds.end.toISOString()],
    );

    return { merchantRows: merchants.rows, dailyRows: daily.rows };
  });

  const merchants = result.merchantRows.map((row): EarlyWarningMerchantCostRow => {
    const usage = {
      inputTokens: numberValue(row.ai_input_tokens),
      outputTokens: numberValue(row.ai_output_tokens),
      outboundMessages: numberValue(row.outbound_messages),
      storageBytes: numberValue(row.support_storage_bytes),
      rates,
    };
    return {
      merchant_id: text(row.merchant_id),
      store_name: text(row.store_name),
      ai_input_tokens: usage.inputTokens,
      ai_output_tokens: usage.outputTokens,
      ai_total_tokens: numberValue(row.ai_total_tokens),
      outbound_messages: usage.outboundMessages,
      support_storage_bytes: usage.storageBytes,
      attachments_created_bytes: numberValue(row.attachments_created_bytes),
      known_cost_usd: componentCost(usage).total,
    };
  });

  const usage = merchants.reduce(
    (total, merchant) => ({
      ai_input_tokens: total.ai_input_tokens + merchant.ai_input_tokens,
      ai_output_tokens: total.ai_output_tokens + merchant.ai_output_tokens,
      ai_total_tokens: total.ai_total_tokens + merchant.ai_total_tokens,
      outbound_messages: total.outbound_messages + merchant.outbound_messages,
      support_storage_bytes: total.support_storage_bytes + merchant.support_storage_bytes,
      attachments_created_bytes: total.attachments_created_bytes + merchant.attachments_created_bytes,
    }),
    {
      ai_input_tokens: 0,
      ai_output_tokens: 0,
      ai_total_tokens: 0,
      outbound_messages: 0,
      support_storage_bytes: 0,
      attachments_created_bytes: 0,
    },
  );
  const totalCost = componentCost({
    inputTokens: usage.ai_input_tokens,
    outputTokens: usage.ai_output_tokens,
    outboundMessages: usage.outbound_messages,
    storageBytes: usage.support_storage_bytes,
    rates,
  });

  const daily = result.dailyRows.map((row): EarlyWarningDailyUsageRow => {
    const costs = componentCost({
      inputTokens: numberValue(row.ai_input_tokens),
      outputTokens: numberValue(row.ai_output_tokens),
      outboundMessages: numberValue(row.outbound_messages),
      storageBytes: 0,
      rates,
    });
    return {
      date: text(row.day),
      ai_input_tokens: numberValue(row.ai_input_tokens),
      ai_output_tokens: numberValue(row.ai_output_tokens),
      ai_total_tokens: numberValue(row.ai_total_tokens),
      outbound_messages: numberValue(row.outbound_messages),
      known_variable_cost_usd: costs.variable,
    };
  });

  const configured = Object.values(rates).filter((value) => value !== null).length;
  const pricingStatus: EarlyWarningCostReport["pricing_status"] = configured === 0
    ? "unconfigured"
    : configured === 4
      ? "configured"
      : "partial";
  const unpricedServices: string[] = [];
  if (rates.ai_input_per_1m_usd === null) unpricedServices.push("ai_input_tokens");
  if (rates.ai_output_per_1m_usd === null) unpricedServices.push("ai_output_tokens");
  if (rates.outbound_message_per_1000_usd === null) unpricedServices.push("outbound_messages");
  if (rates.support_storage_per_gb_month_usd === null) unpricedServices.push("support_storage");
  unpricedServices.push("database_storage", "network_transfer", "provider_billing");

  const projected = totalCost.total === null
    ? null
    : money(
        ((totalCost.variable ?? 0) / bounds.elapsedDays) * bounds.daysInMonth +
          (totalCost.storage ?? 0),
      );

  return {
    currency: "USD",
    month: bounds.start.toISOString().slice(0, 7),
    month_started_at: bounds.start.toISOString(),
    generated_at: now.toISOString(),
    actual_billing_connected: false,
    pricing_status: pricingStatus,
    pricing_coverage_percent: Math.round((configured / 4) * 100),
    rates,
    unpriced_services: unpricedServices,
    known_monthly_cost_usd: totalCost.total,
    projected_month_end_cost_usd: projected,
    usage,
    services: [
      {
        id: "ai_input",
        usage: usage.ai_input_tokens,
        unit: "tokens",
        rate_usd: rates.ai_input_per_1m_usd,
        known_cost_usd: totalCost.input,
      },
      {
        id: "ai_output",
        usage: usage.ai_output_tokens,
        unit: "tokens",
        rate_usd: rates.ai_output_per_1m_usd,
        known_cost_usd: totalCost.output,
      },
      {
        id: "outbound_messages",
        usage: usage.outbound_messages,
        unit: "messages",
        rate_usd: rates.outbound_message_per_1000_usd,
        known_cost_usd: totalCost.outbound,
      },
      {
        id: "support_storage",
        usage: usage.support_storage_bytes,
        unit: "bytes",
        rate_usd: rates.support_storage_per_gb_month_usd,
        known_cost_usd: totalCost.storage,
      },
    ],
    merchants,
    daily,
  };
}
