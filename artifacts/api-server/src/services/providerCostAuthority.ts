import crypto from "node:crypto";
import {
  operationalDatabasePool,
  operationalQueryRows,
  withOperationalTransaction,
  type OperationalQueryTarget,
} from "./operationalPostgresAuthority";

export type ProviderCostSourceType =
  | "provider_api"
  | "provider_rate_card"
  | "owner_configured";

export type ProviderCostMeterKey =
  | "ai_input_tokens_per_1m"
  | "ai_output_tokens_per_1m"
  | "outbound_messages_per_1000"
  | "support_storage_gb_month"
  | "otp_message"
  | "meta_whatsapp_marketing_message"
  | "meta_whatsapp_utility_message"
  | "meta_whatsapp_authentication_message"
  | "database_storage_gb_month"
  | "network_egress_gb"
  | "object_storage_gb_month"
  | "email_message"
  | "external_api_1000_requests";

export type ProviderCostMeterDefinition = {
  meter_key: ProviderCostMeterKey;
  unit_code: string;
  category: "ai" | "messaging" | "storage" | "infrastructure" | "external_api";
  usage_authority: "connected" | "not_connected";
  report_component:
    | "ai_input"
    | "ai_output"
    | "outbound_messages"
    | "support_storage"
    | null;
};

export const PROVIDER_COST_METER_CATALOG: readonly ProviderCostMeterDefinition[] = [
  {
    meter_key: "ai_input_tokens_per_1m",
    unit_code: "usd_per_1m_tokens",
    category: "ai",
    usage_authority: "connected",
    report_component: "ai_input",
  },
  {
    meter_key: "ai_output_tokens_per_1m",
    unit_code: "usd_per_1m_tokens",
    category: "ai",
    usage_authority: "connected",
    report_component: "ai_output",
  },
  {
    meter_key: "outbound_messages_per_1000",
    unit_code: "usd_per_1000_messages",
    category: "messaging",
    usage_authority: "connected",
    report_component: "outbound_messages",
  },
  {
    meter_key: "support_storage_gb_month",
    unit_code: "usd_per_gb_month",
    category: "storage",
    usage_authority: "connected",
    report_component: "support_storage",
  },
  {
    meter_key: "otp_message",
    unit_code: "usd_per_message",
    category: "messaging",
    usage_authority: "not_connected",
    report_component: null,
  },
  {
    meter_key: "meta_whatsapp_marketing_message",
    unit_code: "usd_per_delivered_message",
    category: "messaging",
    usage_authority: "not_connected",
    report_component: null,
  },
  {
    meter_key: "meta_whatsapp_utility_message",
    unit_code: "usd_per_delivered_message",
    category: "messaging",
    usage_authority: "not_connected",
    report_component: null,
  },
  {
    meter_key: "meta_whatsapp_authentication_message",
    unit_code: "usd_per_delivered_message",
    category: "messaging",
    usage_authority: "not_connected",
    report_component: null,
  },
  {
    meter_key: "database_storage_gb_month",
    unit_code: "usd_per_gb_month",
    category: "infrastructure",
    usage_authority: "not_connected",
    report_component: null,
  },
  {
    meter_key: "network_egress_gb",
    unit_code: "usd_per_gb",
    category: "infrastructure",
    usage_authority: "not_connected",
    report_component: null,
  },
  {
    meter_key: "object_storage_gb_month",
    unit_code: "usd_per_gb_month",
    category: "storage",
    usage_authority: "not_connected",
    report_component: null,
  },
  {
    meter_key: "email_message",
    unit_code: "usd_per_message",
    category: "messaging",
    usage_authority: "not_connected",
    report_component: null,
  },
  {
    meter_key: "external_api_1000_requests",
    unit_code: "usd_per_1000_requests",
    category: "external_api",
    usage_authority: "not_connected",
    report_component: null,
  },
] as const;

const meterByKey = new Map(
  PROVIDER_COST_METER_CATALOG.map((meter) => [meter.meter_key, meter]),
);

export class ProviderCostAuthorityError extends Error {
  readonly code: string;
  readonly statusCode: number;

  constructor(code: string, message: string, statusCode = 400) {
    super(message);
    this.name = "ProviderCostAuthorityError";
    this.code = code;
    this.statusCode = statusCode;
  }
}

type RateRow = Record<string, unknown> & {
  id: string;
  meter_key: string;
  provider_key: string;
  unit_code: string;
  dimension_key: string;
  dimension_value: string;
  rate_usd: string | number;
  source_type: ProviderCostSourceType;
  source_reference: string | null;
  effective_from: Date | string;
  effective_to: Date | string | null;
  notes: string | null;
  created_by_account_id: string | null;
  created_at: Date | string;
  updated_at: Date | string;
};

type SettingRow = Record<string, unknown> & {
  monthly_budget_usd: string | number | null;
  updated_by_account_id: string | null;
  updated_at: Date | string;
};

export type ProviderCostRateView = {
  id: string;
  meter_key: ProviderCostMeterKey;
  provider_key: string;
  unit_code: string;
  dimension_key: string;
  dimension_value: string;
  rate_usd: number;
  source_type: ProviderCostSourceType;
  source_reference: string | null;
  effective_from: string;
  effective_to: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

function iso(value: Date | string | null | undefined): string | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isFinite(date.getTime()) ? date.toISOString() : null;
}

function numberOrNull(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function rateView(row: RateRow): ProviderCostRateView {
  const rate = numberOrNull(row.rate_usd);
  if (rate === null) {
    throw new ProviderCostAuthorityError(
      "PROVIDER_COST_RATE_CORRUPT",
      "provider cost rate is invalid",
      503,
    );
  }
  return {
    id: String(row.id),
    meter_key: row.meter_key as ProviderCostMeterKey,
    provider_key: String(row.provider_key),
    unit_code: String(row.unit_code),
    dimension_key: String(row.dimension_key),
    dimension_value: String(row.dimension_value),
    rate_usd: rate,
    source_type: row.source_type,
    source_reference: row.source_reference ? String(row.source_reference) : null,
    effective_from: iso(row.effective_from)!,
    effective_to: iso(row.effective_to),
    notes: row.notes ? String(row.notes) : null,
    created_at: iso(row.created_at)!,
    updated_at: iso(row.updated_at)!,
  };
}

function normalizeProviderKey(value: unknown): string {
  const provider = String(value ?? "").trim().toLowerCase();
  if (!/^[a-z0-9][a-z0-9._-]{0,79}$/.test(provider)) {
    throw new ProviderCostAuthorityError(
      "PROVIDER_COST_PROVIDER_INVALID",
      "provider key is invalid",
    );
  }
  return provider;
}

function normalizeMeterKey(value: unknown): ProviderCostMeterKey {
  const meter = String(value ?? "").trim() as ProviderCostMeterKey;
  if (!meterByKey.has(meter)) {
    throw new ProviderCostAuthorityError(
      "PROVIDER_COST_METER_INVALID",
      "provider cost meter is unsupported",
    );
  }
  return meter;
}

function normalizeSourceType(value: unknown): ProviderCostSourceType {
  const source = String(value ?? "owner_configured").trim();
  if (
    source !== "provider_api" &&
    source !== "provider_rate_card" &&
    source !== "owner_configured"
  ) {
    throw new ProviderCostAuthorityError(
      "PROVIDER_COST_SOURCE_INVALID",
      "provider cost source is invalid",
    );
  }
  return source;
}

function normalizeRateUsd(value: unknown): number {
  const rate = Number(value);
  if (!Number.isFinite(rate) || rate < 0 || rate > 1_000_000_000) {
    throw new ProviderCostAuthorityError(
      "PROVIDER_COST_RATE_INVALID",
      "rate_usd must be a non-negative finite number",
    );
  }
  return Math.round(rate * 10_000_000_000) / 10_000_000_000;
}

function normalizeOptionalText(value: unknown, maxLength: number): string | null {
  const normalized = String(value ?? "").trim();
  if (!normalized) return null;
  return normalized.slice(0, maxLength);
}

function normalizeDimension(value: unknown, fallback: string, maxLength: number): string {
  const normalized = String(value ?? fallback).trim();
  if (!normalized || normalized.length > maxLength) {
    throw new ProviderCostAuthorityError(
      "PROVIDER_COST_DIMENSION_INVALID",
      "provider cost dimension is invalid",
    );
  }
  return normalized;
}

function normalizeEffectiveMonth(value: unknown, now = new Date()): string {
  const raw = String(value ?? "").trim();
  if (!raw) return now.toISOString().slice(0, 7);
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(raw)) {
    throw new ProviderCostAuthorityError(
      "PROVIDER_COST_EFFECTIVE_MONTH_INVALID",
      "effective_month must use YYYY-MM",
    );
  }
  return raw;
}

function monthStart(month: string): Date {
  const [year, monthNumber] = month.split("-").map(Number);
  return new Date(Date.UTC(year!, monthNumber! - 1, 1));
}

async function rowsAt(
  target: OperationalQueryTarget,
  at: Date,
): Promise<RateRow[]> {
  return operationalQueryRows<RateRow>(
    target,
    `SELECT DISTINCT ON (meter_key, dimension_key, dimension_value)
       id, meter_key, provider_key, unit_code, dimension_key, dimension_value,
       rate_usd, source_type, source_reference, effective_from, effective_to,
       notes, created_by_account_id, created_at, updated_at
     FROM provider_cost_rates
     WHERE effective_from <= $1::timestamptz
       AND (effective_to IS NULL OR effective_to > $1::timestamptz)
     ORDER BY meter_key, dimension_key, dimension_value, effective_from DESC, created_at DESC`,
    [at.toISOString()],
  );
}

async function settingRow(target: OperationalQueryTarget): Promise<SettingRow | null> {
  const rows = await operationalQueryRows<SettingRow>(
    target,
    `SELECT monthly_budget_usd, updated_by_account_id, updated_at
       FROM provider_cost_settings
      WHERE id = 'global'
      LIMIT 1`,
  );
  return rows[0] || null;
}

export async function loadProviderCostSnapshot(at = new Date()): Promise<{
  rates: {
    ai_input_per_1m_usd: number | null;
    ai_output_per_1m_usd: number | null;
    outbound_message_per_1000_usd: number | null;
    support_storage_per_gb_month_usd: number | null;
  };
  monthly_budget_usd: number | null;
  sources: Partial<Record<ProviderCostMeterKey, ProviderCostRateView>>;
}> {
  const pool = await operationalDatabasePool();
  const [rows, setting] = await Promise.all([rowsAt(pool, at), settingRow(pool)]);
  const globalRows = rows.filter(
    (row) => row.dimension_key === "global" && row.dimension_value === "global",
  );
  const byMeter = new Map(
    globalRows.map((row) => [row.meter_key as ProviderCostMeterKey, rateView(row)]),
  );
  return {
    rates: {
      ai_input_per_1m_usd: byMeter.get("ai_input_tokens_per_1m")?.rate_usd ?? null,
      ai_output_per_1m_usd: byMeter.get("ai_output_tokens_per_1m")?.rate_usd ?? null,
      outbound_message_per_1000_usd:
        byMeter.get("outbound_messages_per_1000")?.rate_usd ?? null,
      support_storage_per_gb_month_usd:
        byMeter.get("support_storage_gb_month")?.rate_usd ?? null,
    },
    monthly_budget_usd: numberOrNull(setting?.monthly_budget_usd),
    sources: Object.fromEntries(
      [...byMeter.entries()].map(([key, value]) => [key, value]),
    ) as Partial<Record<ProviderCostMeterKey, ProviderCostRateView>>,
  };
}

export async function getProviderCostConfiguration(input?: {
  at?: Date;
  historyLimit?: number;
}): Promise<{
  generated_at: string;
  catalog: readonly ProviderCostMeterDefinition[];
  monthly_budget_usd: number | null;
  current_rates: ProviderCostRateView[];
  history: ProviderCostRateView[];
}> {
  const at = input?.at || new Date();
  const limit = Math.max(1, Math.min(200, Number(input?.historyLimit || 80)));
  const pool = await operationalDatabasePool();
  const [currentRows, historyRows, setting] = await Promise.all([
    rowsAt(pool, at),
    operationalQueryRows<RateRow>(
      pool,
      `SELECT id, meter_key, provider_key, unit_code, dimension_key, dimension_value,
              rate_usd, source_type, source_reference, effective_from, effective_to,
              notes, created_by_account_id, created_at, updated_at
         FROM provider_cost_rates
        ORDER BY effective_from DESC, created_at DESC
        LIMIT $1`,
      [limit],
    ),
    settingRow(pool),
  ]);
  return {
    generated_at: at.toISOString(),
    catalog: PROVIDER_COST_METER_CATALOG,
    monthly_budget_usd: numberOrNull(setting?.monthly_budget_usd),
    current_rates: currentRows.map(rateView),
    history: historyRows.map(rateView),
  };
}

export async function setProviderCostRate(input: {
  actorAccountId: string;
  meterKey: unknown;
  providerKey: unknown;
  rateUsd: unknown;
  sourceType?: unknown;
  sourceReference?: unknown;
  effectiveMonth?: unknown;
  notes?: unknown;
  dimensionKey?: unknown;
  dimensionValue?: unknown;
}): Promise<ProviderCostRateView> {
  const actorAccountId = String(input.actorAccountId || "").trim();
  if (!actorAccountId) {
    throw new ProviderCostAuthorityError(
      "PROVIDER_COST_ACTOR_REQUIRED",
      "owner account is required",
      401,
    );
  }
  const meterKey = normalizeMeterKey(input.meterKey);
  const definition = meterByKey.get(meterKey)!;
  const providerKey = normalizeProviderKey(input.providerKey);
  const rateUsd = normalizeRateUsd(input.rateUsd);
  const sourceType = normalizeSourceType(input.sourceType);
  const sourceReference = normalizeOptionalText(input.sourceReference, 500);
  const notes = normalizeOptionalText(input.notes, 500);
  const dimensionKey = normalizeDimension(input.dimensionKey, "global", 80);
  const dimensionValue = normalizeDimension(input.dimensionValue, "global", 160);
  const effectiveMonth = normalizeEffectiveMonth(input.effectiveMonth);
  const effectiveFrom = monthStart(effectiveMonth);

  return withOperationalTransaction(async (client) => {
    await client.query(
      "SELECT pg_advisory_xact_lock(hashtext($1))",
      [`provider-cost:${meterKey}:${dimensionKey}:${dimensionValue}`],
    );
    const existing = await operationalQueryRows<RateRow>(
      client,
      `SELECT id, meter_key, provider_key, unit_code, dimension_key, dimension_value,
              rate_usd, source_type, source_reference, effective_from, effective_to,
              notes, created_by_account_id, created_at, updated_at
         FROM provider_cost_rates
        WHERE meter_key = $1 AND dimension_key = $2 AND dimension_value = $3
        ORDER BY effective_from ASC, created_at ASC
        FOR UPDATE`,
      [meterKey, dimensionKey, dimensionValue],
    );

    const exact = existing.find(
      (row) => iso(row.effective_from) === effectiveFrom.toISOString(),
    );
    const nextValue = {
      meter_key: meterKey,
      provider_key: providerKey,
      unit_code: definition.unit_code,
      dimension_key: dimensionKey,
      dimension_value: dimensionValue,
      rate_usd: rateUsd,
      source_type: sourceType,
      source_reference: sourceReference,
      effective_from: effectiveFrom.toISOString(),
      notes,
    };

    if (exact) {
      const previous = rateView(exact);
      const updated = await operationalQueryRows<RateRow>(
        client,
        `UPDATE provider_cost_rates
            SET provider_key = $2,
                unit_code = $3,
                rate_usd = $4,
                source_type = $5,
                source_reference = $6,
                notes = $7,
                created_by_account_id = $8,
                updated_at = now()
          WHERE id = $1
          RETURNING id, meter_key, provider_key, unit_code, dimension_key, dimension_value,
                    rate_usd, source_type, source_reference, effective_from, effective_to,
                    notes, created_by_account_id, created_at, updated_at`,
        [
          exact.id,
          providerKey,
          definition.unit_code,
          rateUsd,
          sourceType,
          sourceReference,
          notes,
          actorAccountId,
        ],
      );
      const row = updated[0];
      if (!row) {
        throw new ProviderCostAuthorityError(
          "PROVIDER_COST_RATE_UPDATE_FAILED",
          "provider cost rate update failed",
          409,
        );
      }
      const view = rateView(row);
      await client.query(
        `INSERT INTO provider_cost_audit_events
          (id, actor_account_id, action, meter_key, rate_id, previous_value, next_value)
         VALUES ($1, $2, 'rate_updated', $3, $4, $5::jsonb, $6::jsonb)`,
        [
          crypto.randomUUID(),
          actorAccountId,
          meterKey,
          row.id,
          JSON.stringify(previous),
          JSON.stringify(view),
        ],
      );
      return view;
    }

    const predecessor = [...existing]
      .reverse()
      .find((row) => new Date(row.effective_from).getTime() < effectiveFrom.getTime());
    const successor = existing.find(
      (row) => new Date(row.effective_from).getTime() > effectiveFrom.getTime(),
    );
    if (predecessor) {
      const predecessorEnd = iso(predecessor.effective_to);
      if (!predecessorEnd || new Date(predecessorEnd).getTime() > effectiveFrom.getTime()) {
        await client.query(
          `UPDATE provider_cost_rates
              SET effective_to = $2, updated_at = now()
            WHERE id = $1`,
          [predecessor.id, effectiveFrom.toISOString()],
        );
      }
    }

    const id = crypto.randomUUID();
    const inserted = await operationalQueryRows<RateRow>(
      client,
      `INSERT INTO provider_cost_rates
        (id, meter_key, provider_key, unit_code, dimension_key, dimension_value,
         rate_usd, source_type, source_reference, effective_from, effective_to,
         notes, metadata, created_by_account_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, '{}'::jsonb, $13)
       RETURNING id, meter_key, provider_key, unit_code, dimension_key, dimension_value,
                 rate_usd, source_type, source_reference, effective_from, effective_to,
                 notes, created_by_account_id, created_at, updated_at`,
      [
        id,
        meterKey,
        providerKey,
        definition.unit_code,
        dimensionKey,
        dimensionValue,
        rateUsd,
        sourceType,
        sourceReference,
        effectiveFrom.toISOString(),
        successor ? iso(successor.effective_from) : null,
        notes,
        actorAccountId,
      ],
    );
    const row = inserted[0];
    if (!row) {
      throw new ProviderCostAuthorityError(
        "PROVIDER_COST_RATE_INSERT_FAILED",
        "provider cost rate insert failed",
        409,
      );
    }
    const view = rateView(row);
    await client.query(
      `INSERT INTO provider_cost_audit_events
        (id, actor_account_id, action, meter_key, rate_id, previous_value, next_value)
       VALUES ($1, $2, 'rate_created', $3, $4, NULL, $5::jsonb)`,
      [crypto.randomUUID(), actorAccountId, meterKey, row.id, JSON.stringify(view)],
    );
    return view;
  });
}

export async function setProviderCostBudget(input: {
  actorAccountId: string;
  monthlyBudgetUsd: unknown;
}): Promise<{ monthly_budget_usd: number | null }> {
  const actorAccountId = String(input.actorAccountId || "").trim();
  if (!actorAccountId) {
    throw new ProviderCostAuthorityError(
      "PROVIDER_COST_ACTOR_REQUIRED",
      "owner account is required",
      401,
    );
  }
  const raw = input.monthlyBudgetUsd;
  const monthlyBudgetUsd = raw === null || raw === undefined || raw === ""
    ? null
    : normalizeRateUsd(raw);

  return withOperationalTransaction(async (client) => {
    await client.query("SELECT pg_advisory_xact_lock(hashtext('provider-cost:settings'))");
    const before = await settingRow(client);
    const rows = await operationalQueryRows<SettingRow>(
      client,
      `INSERT INTO provider_cost_settings
        (id, monthly_budget_usd, metadata, updated_by_account_id, updated_at)
       VALUES ('global', $1, '{}'::jsonb, $2, now())
       ON CONFLICT (id) DO UPDATE
         SET monthly_budget_usd = EXCLUDED.monthly_budget_usd,
             updated_by_account_id = EXCLUDED.updated_by_account_id,
             updated_at = now()
       RETURNING monthly_budget_usd, updated_by_account_id, updated_at`,
      [monthlyBudgetUsd, actorAccountId],
    );
    const after = rows[0];
    if (!after) {
      throw new ProviderCostAuthorityError(
        "PROVIDER_COST_BUDGET_UPDATE_FAILED",
        "provider cost budget update failed",
        409,
      );
    }
    await client.query(
      `INSERT INTO provider_cost_audit_events
        (id, actor_account_id, action, meter_key, rate_id, previous_value, next_value)
       VALUES ($1, $2, 'budget_updated', NULL, NULL, $3::jsonb, $4::jsonb)`,
      [
        crypto.randomUUID(),
        actorAccountId,
        JSON.stringify({ monthly_budget_usd: numberOrNull(before?.monthly_budget_usd) }),
        JSON.stringify({ monthly_budget_usd: numberOrNull(after.monthly_budget_usd) }),
      ],
    );
    return { monthly_budget_usd: numberOrNull(after.monthly_budget_usd) };
  });
}
