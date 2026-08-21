import { withOperationalTransaction, type OperationalSqlClient } from "./operationalPostgresAuthority";

const BYTES_PER_GB = 1024 ** 3;
const DAY_MS = 24 * 60 * 60 * 1_000;
const MAX_MONTH_HISTORY = 24;

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
  month_ended_at: string;
  is_current_month: boolean;
  available_months: string[];
  generated_at: string;
  actual_billing_connected: false;
  cost_basis: "configured_rate_estimate";
  pricing_status: "unconfigured" | "partial" | "configured";
  pricing_coverage_percent: number;
  rates: CostRates;
  unpriced_services: string[];
  usage_authority: {
    ai_tokens: "message_metadata_partial";
    outbound_messages: "fawri_message_records";
    support_storage: "support_attachment_records";
    otp_delivery: "not_connected";
    database_storage: "not_connected";
    network_transfer: "not_connected";
    provider_billing: "not_connected";
  };
  budget_status: "unconfigured" | "configured";
  monthly_budget_usd: number | null;
  budget_remaining_usd: number | null;
  budget_utilization_percent: number | null;
  known_monthly_cost_usd: number | null;
  projected_month_end_cost_usd: number | null;
  previous_month: {
    month: string;
    known_monthly_cost_usd: number | null;
    ai_total_tokens: number;
    outbound_messages: number;
  } | null;
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

function currentMonth(now: Date): string {
  return now.toISOString().slice(0, 7);
}

export function normalizeEarlyWarningCostMonth(value: unknown, now = new Date()): string {
  const raw = text(value);
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(raw)) return currentMonth(now);
  const [yearText, monthText] = raw.split("-");
  const candidate = new Date(Date.UTC(Number(yearText), Number(monthText) - 1, 1));
  if (!Number.isFinite(candidate.getTime()) || candidate.toISOString().slice(0, 7) !== raw) {
    return currentMonth(now);
  }
  return candidate.getTime() > new Date(`${currentMonth(now)}-01T00:00:00.000Z`).getTime()
    ? currentMonth(now)
    : raw;
}

function shiftMonth(month: string, delta: number): string {
  const [year, monthNumber] = month.split("-").map(Number);
  return new Date(Date.UTC(year!, monthNumber! - 1 + delta, 1)).toISOString().slice(0, 7);
}

function monthBounds(month: string, now: Date): {
  start: Date;
  end: Date;
  snapshotAt: Date;
  daysInMonth: number;
  elapsedDays: number;
  isCurrent: boolean;
} {
  const [year, monthNumber] = month.split("-").map(Number);
  const start = new Date(Date.UTC(year!, monthNumber! - 1, 1));
  const end = new Date(Date.UTC(year!, monthNumber!, 1));
  const isCurrent = month === currentMonth(now);
  const snapshotAt = isCurrent ? now : new Date(end.getTime() - 1);
  const daysInMonth = Math.round((end.getTime() - start.getTime()) / DAY_MS);
  const elapsedDays = isCurrent
    ? Math.max(1, Math.min(daysInMonth, (now.getTime() - start.getTime()) / DAY_MS))
    : daysInMonth;
  return { start, end, snapshotAt, daysInMonth, elapsedDays, isCurrent };
}

function tokenSql(path: "input_tokens" | "output_tokens" | "total_tokens"): string {
  return `CASE
    WHEN COALESCE(metadata->'ai_usage'->>'${path}', '') ~ '^[0-9]+$'
      THEN (metadata->'ai_usage'->>'${path}')::bigint
    ELSE 0
  END`;
}

async function queryAggregate(
  client: OperationalSqlClient,
  start: Date,
  end: Date,
  snapshotAt: Date,
): Promise<{
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  outboundMessages: number;
  storageBytes: number;
}> {
  const result = await client.query<AggregateRow>(
    `SELECT
       COALESCE((SELECT SUM(${tokenSql("input_tokens")}) FROM messages WHERE created_at >= $1 AND created_at < $2), 0) AS ai_input_tokens,
       COALESCE((SELECT SUM(${tokenSql("output_tokens")}) FROM messages WHERE created_at >= $1 AND created_at < $2), 0) AS ai_output_tokens,
       COALESCE((SELECT SUM(${tokenSql("total_tokens")}) FROM messages WHERE created_at >= $1 AND created_at < $2), 0) AS ai_total_tokens,
       COALESCE((SELECT COUNT(*) FROM messages WHERE created_at >= $1 AND created_at < $2 AND sender = 'fawri'), 0) AS outbound_messages,
       COALESCE((SELECT SUM(size_bytes) FROM support_attachments WHERE created_at <= $3 AND (deleted_at IS NULL OR deleted_at > $3)), 0) AS support_storage_bytes`,
    [start.toISOString(), end.toISOString(), snapshotAt.toISOString()],
  );
  const row = result.rows[0] || {};
  return {
    inputTokens: numberValue(row.ai_input_tokens),
    outputTokens: numberValue(row.ai_output_tokens),
    totalTokens: numberValue(row.ai_total_tokens),
    outboundMessages: numberValue(row.outbound_messages),
    storageBytes: numberValue(row.support_storage_bytes),
  };
}

function fillDailyRows(input: {
  rows: AggregateRow[];
  bounds: ReturnType<typeof monthBounds>;
  rates: CostRates;
}): EarlyWarningDailyUsageRow[] {
  const byDay = new Map(input.rows.map((row) => [text(row.day), row]));
  const count = input.bounds.isCurrent
    ? Math.min(input.bounds.daysInMonth, input.bounds.snapshotAt.getUTCDate())
    : input.bounds.daysInMonth;
  const output: EarlyWarningDailyUsageRow[] = [];
  for (let day = 1; day <= count; day += 1) {
    const date = new Date(Date.UTC(
      input.bounds.start.getUTCFullYear(),
      input.bounds.start.getUTCMonth(),
      day,
    )).toISOString().slice(0, 10);
    const row = byDay.get(date) || {};
    const inputTokens = numberValue(row.ai_input_tokens);
    const outputTokens = numberValue(row.ai_output_tokens);
    const outboundMessages = numberValue(row.outbound_messages);
    const costs = componentCost({
      inputTokens,
      outputTokens,
      outboundMessages,
      storageBytes: 0,
      rates: input.rates,
    });
    output.push({
      date,
      ai_input_tokens: inputTokens,
      ai_output_tokens: outputTokens,
      ai_total_tokens: numberValue(row.ai_total_tokens),
      outbound_messages: outboundMessages,
      known_variable_cost_usd: costs.variable,
    });
  }
  return output;
}

export async function loadEarlyWarningCostReport(input?: {
  month?: string;
  now?: Date;
}): Promise<EarlyWarningCostReport> {
  const now = input?.now || new Date();
  const month = normalizeEarlyWarningCostMonth(input?.month, now);
  const rates = ratesFromEnvironment();
  const bounds = monthBounds(month, now);
  const previousMonth = shiftMonth(month, -1);
  const previousBounds = monthBounds(previousMonth, now);

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
       ), storage_snapshot AS (
         SELECT merchant_id, COALESCE(SUM(size_bytes), 0) AS support_storage_bytes
         FROM support_attachments
         WHERE created_at <= $3::timestamptz
           AND (deleted_at IS NULL OR deleted_at > $3::timestamptz)
         GROUP BY merchant_id
       ), month_attachments AS (
         SELECT merchant_id, COALESCE(SUM(size_bytes), 0) AS attachments_created_bytes
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
       LEFT JOIN storage_snapshot storage ON storage.merchant_id = m.id
       LEFT JOIN month_attachments month_files ON month_files.merchant_id = m.id
       WHERE m.status = 'approved' AND m.account_status = 'approved'
       ORDER BY m.store_name, m.id`,
      [
        bounds.start.toISOString(),
        bounds.end.toISOString(),
        bounds.snapshotAt.toISOString(),
      ],
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

    const availableMonths = await client.query<AggregateRow>(
      `SELECT month FROM (
         SELECT DISTINCT to_char(date_trunc('month', created_at), 'YYYY-MM') AS month FROM messages
         UNION
         SELECT DISTINCT to_char(date_trunc('month', created_at), 'YYYY-MM') AS month FROM support_attachments
       ) months
       WHERE month IS NOT NULL
       ORDER BY month DESC
       LIMIT $1`,
      [MAX_MONTH_HISTORY],
    );

    const previous = await queryAggregate(
      client,
      previousBounds.start,
      previousBounds.end,
      previousBounds.snapshotAt,
    );

    return {
      merchantRows: merchants.rows,
      dailyRows: daily.rows,
      availableMonths: availableMonths.rows.map((row) => text(row.month)).filter(Boolean),
      previous,
    };
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
  const previousCost = componentCost({
    inputTokens: result.previous.inputTokens,
    outputTokens: result.previous.outputTokens,
    outboundMessages: result.previous.outboundMessages,
    storageBytes: result.previous.storageBytes,
    rates,
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
  unpricedServices.push(
    "otp_delivery",
    "database_storage",
    "network_transfer",
    "object_storage_outside_support",
    "provider_billing",
  );

  const projected = !bounds.isCurrent || totalCost.total === null
    ? null
    : money(
        ((totalCost.variable ?? 0) / bounds.elapsedDays) * bounds.daysInMonth +
          (totalCost.storage ?? 0),
      );

  const monthlyBudget = configuredRate("FAWRI_MONTHLY_BUDGET_USD");
  const budgetBase = bounds.isCurrent ? projected ?? totalCost.total : totalCost.total;
  const budgetRemaining = monthlyBudget === null || budgetBase === null
    ? null
    : money(monthlyBudget - budgetBase);
  const budgetUtilization = monthlyBudget === null || monthlyBudget === 0 || budgetBase === null
    ? null
    : Math.round((budgetBase / monthlyBudget) * 10_000) / 100;

  const availableMonths = [...new Set([
    currentMonth(now),
    month,
    previousMonth,
    ...result.availableMonths,
  ])]
    .filter((value) => /^\d{4}-\d{2}$/.test(value))
    .sort()
    .reverse()
    .slice(0, MAX_MONTH_HISTORY);

  return {
    currency: "USD",
    month,
    month_started_at: bounds.start.toISOString(),
    month_ended_at: bounds.end.toISOString(),
    is_current_month: bounds.isCurrent,
    available_months: availableMonths,
    generated_at: now.toISOString(),
    actual_billing_connected: false,
    cost_basis: "configured_rate_estimate",
    pricing_status: pricingStatus,
    pricing_coverage_percent: Math.round((configured / 4) * 100),
    rates,
    unpriced_services: unpricedServices,
    usage_authority: {
      ai_tokens: "message_metadata_partial",
      outbound_messages: "fawri_message_records",
      support_storage: "support_attachment_records",
      otp_delivery: "not_connected",
      database_storage: "not_connected",
      network_transfer: "not_connected",
      provider_billing: "not_connected",
    },
    budget_status: monthlyBudget === null ? "unconfigured" : "configured",
    monthly_budget_usd: monthlyBudget,
    budget_remaining_usd: budgetRemaining,
    budget_utilization_percent: budgetUtilization,
    known_monthly_cost_usd: totalCost.total,
    projected_month_end_cost_usd: projected,
    previous_month: {
      month: previousMonth,
      known_monthly_cost_usd: previousCost.total,
      ai_total_tokens: result.previous.totalTokens,
      outbound_messages: result.previous.outboundMessages,
    },
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
    daily: fillDailyRows({ rows: result.dailyRows, bounds, rates }),
  };
}
