import { randomUUID } from "node:crypto";

import type { EarlyWarningIncident, EarlyWarningWindow } from "./earlyWarningPostgresAuthority";
import { withOperationalTransaction, type OperationalSqlClient } from "./operationalPostgresAuthority";

const ENTITY_TYPE = "early_warning_incident";
const OPENED_ACTION = "early_warning_incident_opened";
const RESOLVED_ACTION = "early_warning_incident_resolved";
const MAX_HISTORY_EVENTS = 2_000;
const WINDOW_MS: Record<EarlyWarningWindow, number> = {
  "1h": 60 * 60 * 1_000,
  "24h": 24 * 60 * 60 * 1_000,
  "7d": 7 * 24 * 60 * 60 * 1_000,
  "30d": 30 * 24 * 60 * 60 * 1_000,
};

export type EarlyWarningIncidentWithScope = EarlyWarningIncident & {
  scope?: "system" | "merchant";
  merchant_id?: string | null;
  merchant_name?: string | null;
};

type IncidentAuditRow = {
  entity_id: unknown;
  action_type: unknown;
  metadata: unknown;
  created_at: unknown;
};

type IncidentMetadata = {
  severity: "warning" | "critical";
  area: string;
  code: string;
  value: number;
  runbook: string;
  scope: "system" | "merchant";
  merchant_id: string | null;
  merchant_name: string | null;
};

export type EarlyWarningIncidentHistoryItem = IncidentMetadata & {
  episode_id: string;
  incident_key: string;
  status: "active" | "resolved";
  started_at: string;
  last_seen_at: string;
  resolved_at: string | null;
  duration_seconds: number;
};

function text(value: unknown): string {
  return String(value ?? "").trim();
}

function numberValue(value: unknown): number {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function timestamp(value: unknown): string | null {
  if (!value) return null;
  const parsed = value instanceof Date ? value : new Date(String(value));
  return Number.isFinite(parsed.getTime()) ? parsed.toISOString() : null;
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function normalizedMetadata(value: unknown): IncidentMetadata {
  const metadata = record(value);
  return {
    severity: metadata.severity === "critical" ? "critical" : "warning",
    area: text(metadata.area),
    code: text(metadata.code),
    value: numberValue(metadata.value),
    runbook: text(metadata.runbook),
    scope: metadata.scope === "merchant" ? "merchant" : "system",
    merchant_id: text(metadata.merchant_id) || null,
    merchant_name: text(metadata.merchant_name) || null,
  };
}

function metadataForIncident(incident: EarlyWarningIncidentWithScope): IncidentMetadata {
  return {
    severity: incident.severity,
    area: incident.area,
    code: incident.code,
    value: numberValue(incident.value),
    runbook: incident.runbook,
    scope: incident.scope === "merchant" ? "merchant" : "system",
    merchant_id: text(incident.merchant_id) || null,
    merchant_name: text(incident.merchant_name) || null,
  };
}

async function insertLifecycleEvent(
  client: OperationalSqlClient,
  input: {
    actionType: typeof OPENED_ACTION | typeof RESOLVED_ACTION;
    incidentKey: string;
    metadata: IncidentMetadata;
  },
): Promise<void> {
  await client.query(
    `INSERT INTO audit_events (
       id, actor_kind, merchant_id, action_type, entity_type, entity_id,
       reason_code, details, metadata, created_at
     ) VALUES (
       $1, 'system', $2, $3, $4, $5,
       $6, $7, $8::jsonb, now()
     )`,
    [
      randomUUID(),
      input.metadata.scope === "merchant" ? input.metadata.merchant_id : null,
      input.actionType,
      ENTITY_TYPE,
      input.incidentKey,
      input.metadata.code || null,
      input.actionType === OPENED_ACTION ? "condition_detected" : "condition_cleared",
      JSON.stringify(input.metadata),
    ],
  );
}

function buildHistory(
  rows: IncidentAuditRow[],
  currentIncidentKeys: Set<string>,
  now: Date,
  window: EarlyWarningWindow,
): EarlyWarningIncidentHistoryItem[] {
  const episodes: EarlyWarningIncidentHistoryItem[] = [];
  const openByKey = new Map<string, EarlyWarningIncidentHistoryItem>();

  for (const row of rows) {
    const incidentKey = text(row.entity_id);
    const createdAt = timestamp(row.created_at);
    if (!incidentKey || !createdAt) continue;
    const actionType = text(row.action_type);
    const metadata = normalizedMetadata(row.metadata);

    if (actionType === OPENED_ACTION) {
      const episode: EarlyWarningIncidentHistoryItem = {
        ...metadata,
        episode_id: `${incidentKey}:${createdAt}`,
        incident_key: incidentKey,
        status: "active",
        started_at: createdAt,
        last_seen_at: createdAt,
        resolved_at: null,
        duration_seconds: 0,
      };
      episodes.push(episode);
      openByKey.set(incidentKey, episode);
      continue;
    }

    if (actionType === RESOLVED_ACTION) {
      const episode = openByKey.get(incidentKey);
      if (!episode) continue;
      episode.status = "resolved";
      episode.resolved_at = createdAt;
      episode.last_seen_at = createdAt;
      episode.duration_seconds = Math.max(
        0,
        Math.round((new Date(createdAt).getTime() - new Date(episode.started_at).getTime()) / 1_000),
      );
      openByKey.delete(incidentKey);
    }
  }

  const nowIso = now.toISOString();
  for (const [incidentKey, episode] of openByKey.entries()) {
    if (!currentIncidentKeys.has(incidentKey)) continue;
    episode.last_seen_at = nowIso;
    episode.duration_seconds = Math.max(
      0,
      Math.round((now.getTime() - new Date(episode.started_at).getTime()) / 1_000),
    );
  }

  const since = now.getTime() - WINDOW_MS[window];
  return episodes
    .filter((episode) => {
      if (episode.status === "active" && currentIncidentKeys.has(episode.incident_key)) return true;
      const edge = episode.resolved_at || episode.started_at;
      return new Date(edge).getTime() >= since;
    })
    .sort((left, right) => {
      if (left.status !== right.status) return left.status === "active" ? -1 : 1;
      const leftTime = new Date(left.resolved_at || left.started_at).getTime();
      const rightTime = new Date(right.resolved_at || right.started_at).getTime();
      return rightTime - leftTime;
    })
    .slice(0, 200);
}

export async function syncEarlyWarningIncidentHistory(input: {
  incidents: EarlyWarningIncidentWithScope[];
  window: EarlyWarningWindow;
  now?: Date;
}): Promise<EarlyWarningIncidentHistoryItem[]> {
  const now = input.now || new Date();
  const currentByKey = new Map(
    input.incidents
      .filter((incident) => text(incident.id))
      .map((incident) => [text(incident.id), incident] as const),
  );

  return withOperationalTransaction(async (client) => {
    await client.query(
      "SELECT pg_advisory_xact_lock(hashtext('fawri:early-warning-incident-ledger'))",
    );

    const latest = await client.query<IncidentAuditRow>(
      `SELECT DISTINCT ON (entity_id)
          entity_id, action_type, metadata, created_at
       FROM audit_events
       WHERE entity_type = $1
         AND action_type = ANY($2::text[])
       ORDER BY entity_id, created_at DESC`,
      [ENTITY_TYPE, [OPENED_ACTION, RESOLVED_ACTION]],
    );
    const latestByKey = new Map(
      latest.rows.map((row) => [text(row.entity_id), row] as const),
    );

    for (const [incidentKey, incident] of currentByKey.entries()) {
      const currentState = latestByKey.get(incidentKey);
      if (text(currentState?.action_type) === OPENED_ACTION) continue;
      await insertLifecycleEvent(client, {
        actionType: OPENED_ACTION,
        incidentKey,
        metadata: metadataForIncident(incident),
      });
    }

    for (const [incidentKey, row] of latestByKey.entries()) {
      if (text(row.action_type) !== OPENED_ACTION || currentByKey.has(incidentKey)) continue;
      await insertLifecycleEvent(client, {
        actionType: RESOLVED_ACTION,
        incidentKey,
        metadata: normalizedMetadata(row.metadata),
      });
    }

    const history = await client.query<IncidentAuditRow>(
      `SELECT entity_id, action_type, metadata, created_at
       FROM (
         SELECT entity_id, action_type, metadata, created_at
         FROM audit_events
         WHERE entity_type = $1
           AND action_type = ANY($2::text[])
         ORDER BY created_at DESC
         LIMIT $3
       ) recent
       ORDER BY created_at ASC`,
      [ENTITY_TYPE, [OPENED_ACTION, RESOLVED_ACTION], MAX_HISTORY_EVENTS],
    );

    return buildHistory(history.rows, new Set(currentByKey.keys()), now, input.window);
  });
}
