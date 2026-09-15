import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import { getFawriDataDir } from "../lib/dataPaths";
import {
  catalogMediaStorageProviderName,
  removeCatalogMediaStorageObject,
  removeCatalogMerchantMedia,
} from "./catalogMediaStorage";
import {
  operationalDatabasePool,
  operationalPostgresAuthorityRequired,
  operationalQueryRows,
} from "./operationalPostgresAuthority";
import {
  completeMerchantDeletionPostgres,
  type ManagedDeletionRequest,
} from "./postgresMerchantManagementAuthority";
import {
  removeSupportImageStorageObject,
  removeSupportTicketImageStoragePrefix,
} from "./supportImageStorage";

type CleanupState = "prepared" | "pending" | "complete";

type CatalogObjectEntry = {
  kind: "catalog_object";
  storage_provider: string;
  storage_key: string;
};

type CatalogMerchantPrefixEntry = {
  kind: "catalog_merchant_prefix";
  storage_provider: string;
};

type SupportObjectEntry = {
  kind: "support_object";
  storage_provider: string;
  storage_key: string;
};

type SupportTicketPrefixEntry = {
  kind: "support_ticket_prefix";
  storage_provider: string;
  ticket_id: string;
};

type CleanupEntry =
  | CatalogObjectEntry
  | CatalogMerchantPrefixEntry
  | SupportObjectEntry
  | SupportTicketPrefixEntry;

type CleanupManifest = {
  version: 1;
  merchant_id: string;
  deletion_request_id: string;
  state: CleanupState;
  attempts: number;
  entries: CleanupEntry[];
  created_at: string;
  updated_at: string;
  completed_at?: string;
  last_error_code?: string;
};

export type MerchantPhysicalMediaCleanupReconciler = {
  stop(): void;
};

function cleanupRoot(): string {
  return path.join(getFawriDataDir(), "merchant-media-cleanup");
}

function manifestFileName(merchantId: string): string {
  const digest = crypto
    .createHash("sha256")
    .update(String(merchantId || "").trim(), "utf8")
    .digest("hex");
  return `${digest}.json`;
}

function manifestPath(merchantId: string): string {
  return path.join(cleanupRoot(), manifestFileName(merchantId));
}

function writeManifest(manifest: CleanupManifest): void {
  fs.mkdirSync(cleanupRoot(), { recursive: true });
  const target = manifestPath(manifest.merchant_id);
  const temporary = `${target}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(temporary, `${JSON.stringify(manifest, null, 2)}\n`, {
    encoding: "utf8",
    mode: 0o600,
    flag: "wx",
  });
  fs.renameSync(temporary, target);
}

function readManifest(filePath: string): CleanupManifest | null {
  try {
    const parsed = JSON.parse(fs.readFileSync(filePath, "utf8")) as CleanupManifest;
    if (
      parsed?.version !== 1 ||
      !parsed.merchant_id ||
      !parsed.deletion_request_id ||
      !Array.isArray(parsed.entries) ||
      !["prepared", "pending", "complete"].includes(parsed.state)
    ) {
      return null;
    }
    return parsed;
  } catch (error) {
    if ((error as NodeJS.ErrnoException)?.code === "ENOENT") return null;
    return null;
  }
}

function safeErrorCode(error: unknown): string {
  const candidate =
    error && typeof error === "object"
      ? String((error as { code?: unknown }).code || "").trim()
      : "";
  return /^[A-Z][A-Z0-9_]{2,159}$/.test(candidate)
    ? candidate
    : "PHYSICAL_MEDIA_CLEANUP_FAILED";
}

function uniqueEntries(entries: CleanupEntry[]): CleanupEntry[] {
  const seen = new Set<string>();
  return entries.filter((entry) => {
    const key = JSON.stringify(entry);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

async function captureCleanupManifest(input: {
  merchantId: string;
  deletionRequestId: string;
}): Promise<CleanupManifest> {
  if (!operationalPostgresAuthorityRequired()) {
    throw Object.assign(
      new Error("PostgreSQL merchant media cleanup authority is required"),
      { code: "POSTGRES_OPERATIONAL_AUTHORITY_REQUIRED" },
    );
  }

  const pool = await operationalDatabasePool();
  const [merchantRows, catalogRows, supportRows, ticketRows] = await Promise.all([
    operationalQueryRows<{
      merchant_status: string;
      account_state: string;
    }>(
      pool,
      `SELECT m.status::text AS merchant_status, a.state::text AS account_state
         FROM merchants m
         JOIN accounts a ON a.id = m.account_id AND a.kind = 'merchant'
        WHERE m.id = $1
        LIMIT 1`,
      [input.merchantId],
    ),
    operationalQueryRows<{ storage_key: string }>(
      pool,
      `SELECT storage_key
         FROM catalog_image_references
        WHERE merchant_id = $1 AND storage_key IS NOT NULL
        ORDER BY id`,
      [input.merchantId],
    ),
    operationalQueryRows<{
      storage_provider: string;
      storage_key: string;
    }>(
      pool,
      `SELECT storage_provider, storage_key
         FROM support_attachments
        WHERE merchant_id = $1 AND deleted_at IS NULL
        ORDER BY id`,
      [input.merchantId],
    ),
    operationalQueryRows<{ id: string }>(
      pool,
      `SELECT id
         FROM support_tickets
        WHERE merchant_id = $1
        ORDER BY id`,
      [input.merchantId],
    ),
  ]);

  const merchant = merchantRows[0];
  if (
    !merchant ||
    merchant.merchant_status !== "suspended" ||
    merchant.account_state !== "suspended"
  ) {
    throw Object.assign(
      new Error("merchant must be suspended before media cleanup capture"),
      { code: "MERCHANT_MUST_BE_SUSPENDED" },
    );
  }

  const catalogProvider = catalogMediaStorageProviderName();
  const entries = uniqueEntries([
    {
      kind: "catalog_merchant_prefix" as const,
      storage_provider: catalogProvider,
    },
    ...catalogRows.map((row) => ({
      kind: "catalog_object" as const,
      storage_provider: catalogProvider,
      storage_key: row.storage_key,
    })),
    ...supportRows.map((row) => ({
      kind: "support_object" as const,
      storage_provider: row.storage_provider,
      storage_key: row.storage_key,
    })),
    ...ticketRows.map((row) => ({
      kind: "support_ticket_prefix" as const,
      storage_provider: "filesystem",
      ticket_id: row.id,
    })),
  ]);

  const now = new Date().toISOString();
  const manifest: CleanupManifest = {
    version: 1,
    merchant_id: input.merchantId,
    deletion_request_id: input.deletionRequestId,
    state: "prepared",
    attempts: 0,
    entries,
    created_at: now,
    updated_at: now,
  };
  writeManifest(manifest);
  return manifest;
}

async function deletionIsCommitted(merchantId: string): Promise<boolean> {
  if (!operationalPostgresAuthorityRequired()) return false;
  const pool = await operationalDatabasePool();
  const rows = await operationalQueryRows<{
    account_state: string;
    retention_status: string | null;
  }>(
    pool,
    `SELECT a.state::text AS account_state, m.retention_status
       FROM merchants m
       JOIN accounts a ON a.id = m.account_id AND a.kind = 'merchant'
      WHERE m.id = $1
      LIMIT 1`,
    [merchantId],
  );
  return (
    rows[0]?.account_state === "closed" &&
    rows[0]?.retention_status === "deleted"
  );
}

async function removeEntry(
  merchantId: string,
  entry: CleanupEntry,
): Promise<void> {
  if (entry.kind === "catalog_object") {
    await removeCatalogMediaStorageObject({
      storageProvider: entry.storage_provider,
      storageKey: entry.storage_key,
    });
    return;
  }
  if (entry.kind === "catalog_merchant_prefix") {
    await removeCatalogMerchantMedia({
      storageProvider: entry.storage_provider,
      merchantId,
    });
    return;
  }
  if (entry.kind === "support_object") {
    await removeSupportImageStorageObject({
      storageProvider: entry.storage_provider,
      storageKey: entry.storage_key,
    });
    return;
  }
  await removeSupportTicketImageStoragePrefix({
    storageProvider: entry.storage_provider,
    ticketId: entry.ticket_id,
  });
}

export async function reconcileMerchantPhysicalMediaCleanup(
  merchantId: string,
): Promise<{ status: "missing" | "deferred" | "pending" | "complete"; remaining: number }> {
  const filePath = manifestPath(merchantId);
  const manifest = readManifest(filePath);
  if (!manifest) return { status: "missing", remaining: 0 };
  if (manifest.state === "complete") {
    return { status: "complete", remaining: 0 };
  }
  if (!(await deletionIsCommitted(manifest.merchant_id))) {
    return { status: "deferred", remaining: manifest.entries.length };
  }

  const remaining: CleanupEntry[] = [];
  let lastErrorCode = "";
  for (const entry of manifest.entries) {
    try {
      await removeEntry(manifest.merchant_id, entry);
    } catch (error) {
      remaining.push(entry);
      lastErrorCode ||= safeErrorCode(error);
    }
  }

  const now = new Date().toISOString();
  const next: CleanupManifest = {
    ...manifest,
    state: remaining.length === 0 ? "complete" : "pending",
    attempts: manifest.attempts + 1,
    entries: remaining,
    updated_at: now,
    ...(remaining.length === 0 ? { completed_at: now } : {}),
    ...(lastErrorCode ? { last_error_code: lastErrorCode } : {}),
  };
  if (!lastErrorCode) delete next.last_error_code;
  writeManifest(next);
  return {
    status: remaining.length === 0 ? "complete" : "pending",
    remaining: remaining.length,
  };
}

export async function completeMerchantDeletionWithPhysicalMediaCleanup(input: {
  merchantId: string;
  deletionRequestId: string;
  actorAdminId: string;
}): Promise<{
  ok: true;
  deletedMerchantId: string;
  deletionRequest: ManagedDeletionRequest;
}> {
  const manifest = await captureCleanupManifest({
    merchantId: input.merchantId,
    deletionRequestId: input.deletionRequestId,
  });

  let result;
  try {
    result = await completeMerchantDeletionPostgres(input);
  } catch (error) {
    fs.rmSync(manifestPath(input.merchantId), { force: true });
    throw error;
  }

  writeManifest({
    ...manifest,
    state: "pending",
    updated_at: new Date().toISOString(),
  });

  // Physical deletion is intentionally post-commit and idempotent. A storage
  // failure never restores merchant access; the persisted manifest remains for
  // the startup/interval reconciler to retry.
  await reconcileMerchantPhysicalMediaCleanup(input.merchantId).catch(() => null);
  return result;
}

export async function reconcilePendingMerchantPhysicalMediaCleanups(
  limit = 100,
): Promise<{ inspected: number; pending: number }> {
  let names: string[] = [];
  try {
    names = fs
      .readdirSync(cleanupRoot())
      .filter((name) => /^[a-f0-9]{64}\.json$/i.test(name))
      .slice(0, Math.max(1, Math.min(1000, limit)));
  } catch (error) {
    if ((error as NodeJS.ErrnoException)?.code === "ENOENT") {
      return { inspected: 0, pending: 0 };
    }
    throw error;
  }

  let pending = 0;
  let inspected = 0;
  for (const name of names) {
    const manifest = readManifest(path.join(cleanupRoot(), name));
    if (!manifest || manifest.state === "complete") continue;
    inspected += 1;
    const result = await reconcileMerchantPhysicalMediaCleanup(
      manifest.merchant_id,
    ).catch(() => ({ status: "pending" as const, remaining: manifest.entries.length }));
    if (result.status !== "complete") pending += 1;
  }
  return { inspected, pending };
}

export function startMerchantPhysicalMediaCleanupReconciler(input: {
  intervalMs?: number;
} = {}): MerchantPhysicalMediaCleanupReconciler {
  const intervalMs = Math.max(10_000, Number(input.intervalMs || 60_000));
  let stopped = false;
  let running = false;

  const run = async () => {
    if (stopped || running || !operationalPostgresAuthorityRequired()) return;
    running = true;
    try {
      await reconcilePendingMerchantPhysicalMediaCleanups();
    } finally {
      running = false;
    }
  };

  void run().catch(() => null);
  const timer = setInterval(() => void run().catch(() => null), intervalMs);
  timer.unref();

  return {
    stop() {
      stopped = true;
      clearInterval(timer);
    },
  };
}
