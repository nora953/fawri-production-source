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
export async function readMetaPageMerchantMapAuthoritative(): Promise<Map<string, string>> {
  if (operationalPostgresAuthorityRequired()) {
    const result = new Map<string, string>();
    for (const mapping of await listActiveMetaPageMappingsAuthoritative()) {
      if (mapping.pageId && mapping.merchantId) {
        result.set(mapping.pageId, mapping.merchantId);
      }
    }
    return result;
  }
  return readMetaPageMerchantMap();
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
