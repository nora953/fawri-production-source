import fs from "node:fs";
import { getFawriDataFilePath } from "../lib/dataPaths";

type MetaPageRecord = {
  merchant_id?: unknown;
};

type RuntimeDatabase = {
  metaPagesByPageId?: unknown;
};

export function readMetaPageMerchantMap(): Map<string, string> {
  const runtimePath = getFawriDataFilePath("fawri-runtime-db.json");
  const parsed = JSON.parse(
    fs.readFileSync(runtimePath, "utf8"),
  ) as RuntimeDatabase;
  const records =
    parsed.metaPagesByPageId &&
    typeof parsed.metaPagesByPageId === "object" &&
    !Array.isArray(parsed.metaPagesByPageId)
      ? (parsed.metaPagesByPageId as Record<string, MetaPageRecord>)
      : {};

  const result = new Map<string, string>();
  for (const [pageId, record] of Object.entries(records)) {
    const merchantId = String(record?.merchant_id || "").trim();
    if (pageId && merchantId) result.set(pageId, merchantId);
  }
  return result;
}
