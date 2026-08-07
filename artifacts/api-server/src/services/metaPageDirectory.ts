import fs from "node:fs";
import { getFawriDataFilePath } from "../lib/dataPaths";
import { listActiveMetaPageMappings } from "./metaChannelRuntime";

type MetaPageRecord = { merchant_id?: unknown; status?: unknown };
type RuntimeDatabase = { metaPagesByPageId?: unknown };

/**
 * Reads the encrypted channel registry first. The legacy runtime map remains a
 * temporary read-only compatibility source until the integration coordinator
 * migrates the shared Meta OAuth callback.
 */
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
