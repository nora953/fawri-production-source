import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { getFawriDataFilePath } from "../lib/dataPaths";
import {
  createEnvironmentMetaCredentialKeyProvider,
  decryptMetaCredential,
  encryptMetaCredential,
  type MetaCredentialEnvelope,
  type MetaCredentialKeyProvider,
} from "./metaCredentialVault";

export type MetaChannelStatus =
  | "connecting"
  | "active"
  | "disconnecting"
  | "disconnected"
  | "error";

export type MetaChannelRecord = {
  id: string;
  merchant_id: string;
  platform: "messenger" | "instagram";
  page_id: string;
  page_name: string;
  instagram_account_id?: string;
  instagram_username?: string;
  status: MetaChannelStatus;
  credential?: MetaCredentialEnvelope;
  webhook_subscribed: boolean;
  connection_version: number;
  connected_at?: string;
  disconnect_requested_at?: string;
  disconnected_at?: string;
  last_error_code?: string;
  created_at: string;
  updated_at: string;
};

export type MetaChannelSummary = Omit<MetaChannelRecord, "credential"> & {
  credential_configured: boolean;
};

type MetaChannelStore = { version: 1; channels: MetaChannelRecord[] };

const STORE_VERSION = 1 as const;
const LOCK_STALE_MS = 120_000;
let configuredMetaCredentialKeyProvider: MetaCredentialKeyProvider | null = null;

export function configureMetaChannelCredentialKeyProvider(
  provider: MetaCredentialKeyProvider | null,
): void {
  configuredMetaCredentialKeyProvider = provider;
}

function resolveMetaCredentialKeyProvider(
  explicit?: MetaCredentialKeyProvider,
): MetaCredentialKeyProvider {
  return (
    explicit ||
    configuredMetaCredentialKeyProvider ||
    createEnvironmentMetaCredentialKeyProvider()
  );
}

function text(value: unknown): string {
  return String(value || "").trim();
}
function storePath(): string {
  return getFawriDataFilePath("meta-channels.json");
}
function lockPath(): string {
  return `${storePath()}.lock`;
}
function channelId(merchantId: string, platform: string, pageId: string): string {
  return crypto
    .createHash("sha256")
    .update(`${merchantId}:${platform}:${pageId}`)
    .digest("hex")
    .slice(0, 32);
}
function writeStore(store: MetaChannelStore): void {
  const filePath = storePath();
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const temporaryPath = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(temporaryPath, `${JSON.stringify(store, null, 2)}\n`, {
    encoding: "utf8",
    mode: 0o600,
  });
  fs.renameSync(temporaryPath, filePath);
}
function readStore(): MetaChannelStore {
  try {
    const parsed = JSON.parse(fs.readFileSync(storePath(), "utf8")) as {
      version?: unknown;
      channels?: unknown;
    };
    if (parsed.version !== STORE_VERSION || !Array.isArray(parsed.channels)) {
      throw new Error("Meta channel store has an unsupported shape");
    }
    return {
      version: STORE_VERSION,
      channels: parsed.channels.filter(
        (item): item is MetaChannelRecord =>
          Boolean(item) && typeof item === "object" && !Array.isArray(item),
      ),
    };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return { version: STORE_VERSION, channels: [] };
    }
    throw error;
  }
}
function acquireLock(): { descriptor: number; token: string } {
  const filePath = lockPath();
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const descriptor = fs.openSync(filePath, "wx", 0o600);
      const token = crypto.randomBytes(18).toString("hex");
      fs.writeFileSync(descriptor, JSON.stringify({ token, pid: process.pid }));
      fs.fsyncSync(descriptor);
      return { descriptor, token };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
      try {
        if (Date.now() - fs.statSync(filePath).mtimeMs > LOCK_STALE_MS) {
          fs.unlinkSync(filePath);
          continue;
        }
      } catch (statError) {
        if ((statError as NodeJS.ErrnoException).code === "ENOENT") continue;
        throw statError;
      }
      throw Object.assign(new Error("Meta channel store is busy"), {
        code: "META_CHANNEL_STORE_BUSY",
      });
    }
  }
  throw new Error("Meta channel store lock could not be acquired");
}
function withLock<T>(callback: (store: MetaChannelStore) => T): T {
  const lock = acquireLock();
  try {
    const store = readStore();
    const result = callback(store);
    writeStore(store);
    return result;
  } finally {
    try {
      fs.closeSync(lock.descriptor);
    } finally {
      try {
        const current = JSON.parse(fs.readFileSync(lockPath(), "utf8")) as {
          token?: unknown;
        };
        if (current.token === lock.token) fs.unlinkSync(lockPath());
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      }
    }
  }
}
function summary(record: MetaChannelRecord): MetaChannelSummary {
  const { credential, ...safe } = structuredClone(record);
  return { ...safe, credential_configured: Boolean(credential) };
}
function findRecord(
  store: MetaChannelStore,
  merchantId: string,
  platform: string,
  pageId: string,
): MetaChannelRecord | undefined {
  return store.channels.find(
    (record) =>
      record.merchant_id === merchantId &&
      record.platform === platform &&
      record.page_id === pageId,
  );
}

export function listMetaChannels(merchantId: string): MetaChannelSummary[] {
  const id = text(merchantId);
  if (!id) return [];
  return readStore().channels
    .filter((record) => record.merchant_id === id)
    .sort((left, right) => right.updated_at.localeCompare(left.updated_at))
    .map(summary);
}

export function listActiveMetaPageMappings(): Array<{
  pageId: string;
  merchantId: string;
}> {
  return readStore().channels
    .filter(
      (record) =>
        record.platform === "messenger" && record.status === "active",
    )
    .map((record) => ({ pageId: record.page_id, merchantId: record.merchant_id }));
}

export function connectMetaChannel(input: {
  merchantId: string;
  platform: "messenger" | "instagram";
  pageId: string;
  pageName: string;
  accessToken: string;
  webhookSubscribed?: boolean;
  instagramAccountId?: string;
  instagramUsername?: string;
  keyProvider?: MetaCredentialKeyProvider;
  now?: Date;
}): MetaChannelSummary {
  const merchantId = text(input.merchantId);
  const pageId = text(input.pageId);
  const pageName = text(input.pageName);
  if (!merchantId || !pageId || !pageName) {
    throw Object.assign(new Error("Meta channel identity is incomplete"), {
      code: "META_CHANNEL_IDENTITY_INVALID",
    });
  }
  const provider = resolveMetaCredentialKeyProvider(input.keyProvider);
  const encrypted = encryptMetaCredential(
    input.accessToken,
    provider,
    `fawri:meta:${merchantId}:${input.platform}:${pageId}`,
  );
  const now = input.now || new Date();

  return withLock((store) => {
    const timestamp = now.toISOString();
    const existing = findRecord(store, merchantId, input.platform, pageId);
    const next: MetaChannelRecord = {
      ...(existing || {
        id: channelId(merchantId, input.platform, pageId),
        merchant_id: merchantId,
        platform: input.platform,
        page_id: pageId,
        created_at: timestamp,
        connection_version: 0,
      }),
      page_name: pageName,
      status: "active",
      credential: encrypted,
      webhook_subscribed: input.webhookSubscribed === true,
      connection_version: (existing?.connection_version || 0) + 1,
      connected_at: timestamp,
      disconnect_requested_at: undefined,
      disconnected_at: undefined,
      last_error_code: undefined,
      updated_at: timestamp,
      ...(text(input.instagramAccountId)
        ? { instagram_account_id: text(input.instagramAccountId) }
        : {}),
      ...(text(input.instagramUsername)
        ? { instagram_username: text(input.instagramUsername) }
        : {}),
    };
    if (existing) Object.assign(existing, next);
    else store.channels.push(next);
    return summary(next);
  });
}

export function readMetaChannelCredential(input: {
  merchantId: string;
  platform: "messenger" | "instagram";
  pageId: string;
  keyProvider?: MetaCredentialKeyProvider;
}): string {
  const record = findRecord(
    readStore(),
    text(input.merchantId),
    input.platform,
    text(input.pageId),
  );
  if (!record || record.status === "disconnected" || !record.credential) {
    throw Object.assign(new Error("Meta channel credential is unavailable"), {
      code: "META_CHANNEL_CREDENTIAL_UNAVAILABLE",
    });
  }
  return decryptMetaCredential(
    record.credential,
    resolveMetaCredentialKeyProvider(input.keyProvider),
    `fawri:meta:${record.merchant_id}:${record.platform}:${record.page_id}`,
  );
}

export function requestMetaChannelDisconnect(input: {
  merchantId: string;
  platform: "messenger" | "instagram";
  pageId: string;
  expectedVersion: number;
  now?: Date;
}): MetaChannelSummary {
  const now = input.now || new Date();
  return withLock((store) => {
    const record = findRecord(
      store,
      text(input.merchantId),
      input.platform,
      text(input.pageId),
    );
    if (!record) {
      throw Object.assign(new Error("Meta channel was not found"), {
        code: "META_CHANNEL_NOT_FOUND",
      });
    }
    if (record.connection_version !== input.expectedVersion) {
      throw Object.assign(new Error("Meta channel version conflict"), {
        code: "META_CHANNEL_VERSION_CONFLICT",
        current: summary(record),
      });
    }
    if (record.status === "disconnected") return summary(record);
    record.status = "disconnecting";
    record.disconnect_requested_at = now.toISOString();
    record.updated_at = now.toISOString();
    record.connection_version += 1;
    return summary(record);
  });
}

export function completeMetaChannelDisconnect(input: {
  merchantId: string;
  platform: "messenger" | "instagram";
  pageId: string;
  now?: Date;
}): MetaChannelSummary {
  const now = input.now || new Date();
  return withLock((store) => {
    const record = findRecord(
      store,
      text(input.merchantId),
      input.platform,
      text(input.pageId),
    );
    if (!record) {
      throw Object.assign(new Error("Meta channel was not found"), {
        code: "META_CHANNEL_NOT_FOUND",
      });
    }
    record.status = "disconnected";
    record.webhook_subscribed = false;
    record.credential = undefined;
    record.disconnected_at = now.toISOString();
    record.updated_at = now.toISOString();
    record.connection_version += 1;
    return summary(record);
  });
}

export function markMetaChannelError(input: {
  merchantId: string;
  platform: "messenger" | "instagram";
  pageId: string;
  code: string;
  now?: Date;
}): MetaChannelSummary {
  const now = input.now || new Date();
  return withLock((store) => {
    const record = findRecord(
      store,
      text(input.merchantId),
      input.platform,
      text(input.pageId),
    );
    if (!record) {
      throw Object.assign(new Error("Meta channel was not found"), {
        code: "META_CHANNEL_NOT_FOUND",
      });
    }
    record.status = "error";
    record.last_error_code = text(input.code) || "META_CHANNEL_ERROR";
    record.updated_at = now.toISOString();
    record.connection_version += 1;
    return summary(record);
  });
}
