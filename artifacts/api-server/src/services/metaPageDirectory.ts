import fs from "node:fs";
import { getFawriDataFilePath } from "../lib/dataPaths";
import { listActiveMetaPageMappings } from "./metaChannelRuntime";
import {
  listActiveMetaPageMappingsAuthoritative,
} from "./postgresMetaChannelAuthority";
import { operationalPostgresAuthorityRequired } from "./operationalPostgresAuthority";

type MetaPageRecord = { merchant_id?: unknown; status?: unknown };
type RuntimeDatabase = { metaPagesByPageId?: unknown };

/**
 * PostgreSQL is the only page-to-merchant authority when the operational
 * cutover is required. The legacy map remains read-only compatibility only
 * while the cutover flag is disabled.
 */
export function metaPageIdsFromWebhookBody(body: unknown): string[] {
  const record = body && typeof body === "object" ? body as { entry?: unknown } : {};
  if (!Array.isArray(record.entry)) return [];
  return [...new Set(record.entry.map((entry: unknown) => {
    const item = entry && typeof entry === "object" ? entry as { id?: unknown } : {};
    return String(item.id || "").trim();
  }).filter(Boolean))];
}

export async function readMetaPageMerchantMapAuthoritative(pageIds: readonly string[]): Promise<Map<string, string>> {
  if (operationalPostgresAuthorityRequired()) {
    const result = new Map<string, string>();
    for (const mapping of await listActiveMetaPageMappingsAuthoritative(pageIds)) {
      if (mapping.pageId && mapping.merchantId) {
        result.set(mapping.pageId, mapping.merchantId);
      }
    }
    return result;
  }
  return new Map([...readMetaPageMerchantMap()].filter(([pageId]) => pageIds.includes(pageId)));
}

export function readMetaPageMerchantMap(): Map<string, string> {
  const result = new Map<string, string>();

  for (const mapping of listActiveMetaPageMappings()) {
    if (mapping.pageId && mapping.merchantId) {
      result.set(mapping.pageId, mapping.merchantId);
    }
  }

  const runtimePath = getFawriDataFilePath("fawri-runtime-db.json");
  try {
    const parsed = JSON.parse(fs.readFileSync(runtimePath, "utf8")) as RuntimeDatabase;
    const records =
      parsed.metaPagesByPageId &&
      typeof parsed.metaPagesByPageId === "object" &&
      !Array.isArray(parsed.metaPagesByPageId)
        ? (parsed.metaPagesByPageId as Record<string, MetaPageRecord>)
        : {};

    for (const [pageId, record] of Object.entries(records)) {
      if (result.has(pageId)) continue;
      const merchantId = String(record?.merchant_id || "").trim();
      if (pageId && merchantId) result.set(pageId, merchantId);
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }

  return result;
}
