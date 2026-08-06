import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { getFawriDataFilePath } from "../lib/dataPaths";

export type RuntimeMessage = {
  id: string;
  external_message_id?: string;
  conversation_id: string;
  sender: "customer" | "fawri" | "merchant";
  text: string;
  created_at: string;
  counted_as_auto_reply: boolean;
  reply_type?: "ai" | "database" | "fallback" | "manual";
  status?: "received" | "sent" | "failed";
};

export type RuntimeConversation = {
  id: string;
  merchant_id: string;
  platform: string;
  page_id?: string;
  customer_name: string;
  customer_handle: string;
  status: string;
  assigned_to_human: boolean;
  needs_training: boolean;
  updated_at: string;
  messages: RuntimeMessage[];
};

type MetaPageConnection = {
  merchant_id?: unknown;
  page_id?: unknown;
  page_access_token?: unknown;
  platform?: unknown;
};

type RuntimeDatabase = {
  conversationsByMerchant?: unknown;
  metaPagesByPageId?: unknown;
};

type ManualRequestStatus = "pending" | "sent" | "failed" | "uncertain";

type ManualReplyRequest = {
  idempotency_key: string;
  text_sha256: string;
  status: ManualRequestStatus;
  created_at: string;
  updated_at: string;
  message_id?: string;
  external_message_id?: string;
  error_code?: string;
};

type ManualConversationOverlay = {
  status: "manual" | "auto_replying";
  assigned_to_human: boolean;
  page_id?: string;
  inbound_messages: RuntimeMessage[];
  manual_messages: RuntimeMessage[];
  requests: Record<string, ManualReplyRequest>;
  updated_at: string;
};

type ManualOverlayDatabase = {
  version: 1;
  conversations: Record<string, Record<string, ManualConversationOverlay>>;
};

export type PreparedManualReply = {
  deduplicated: boolean;
  existingMessage?: RuntimeMessage;
  pageId?: string;
  pageAccessToken?: string;
  customerId?: string;
};

export class ManualConversationError extends Error {
  code: string;
  status: number;

  constructor(code: string, message: string, status = 409) {
    super(message);
    this.name = "ManualConversationError";
    this.code = code;
    this.status = status;
  }
}

const OVERLAY_VERSION = 1 as const;
const LOCK_STALE_MS = 30_000;

function runtimePath(): string {
  return getFawriDataFilePath("fawri-runtime-db.json");
}

function overlayPath(): string {
  return getFawriDataFilePath("manual-conversation-operations.json");
}

function lockPath(): string {
  return `${overlayPath()}.lock`;
}

function text(value: unknown): string {
  return String(value || "").trim();
}

function objectRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function requestMap(value: unknown): Record<string, ManualReplyRequest> {
  return objectRecord(value) as Record<string, ManualReplyRequest>;
}

function messageArray(value: unknown): RuntimeMessage[] {
  return Array.isArray(value)
    ? value.filter(
        (item): item is RuntimeMessage =>
          Boolean(item) && typeof item === "object" && !Array.isArray(item),
      )
    : [];
}

function now(): string {
  return new Date().toISOString();
}

function normalizedTimestamp(value: unknown): string {
  const parsed = new Date(String(value || ""));
  return Number.isFinite(parsed.getTime()) ? parsed.toISOString() : now();
}

function sha256(value: string): string {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function makeMessageId(prefix: string): string {
  return `${prefix}-${Date.now()}-${crypto.randomBytes(8).toString("hex")}`;
}

function writeJsonAtomically(filePath: string, value: unknown): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const temporaryPath = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(temporaryPath, `${JSON.stringify(value, null, 2)}\n`, {
    encoding: "utf8",
    mode: 0o600,
  });
  fs.renameSync(temporaryPath, filePath);
}

function readRuntimeDatabase(): RuntimeDatabase {
  try {
    return JSON.parse(fs.readFileSync(runtimePath(), "utf8")) as RuntimeDatabase;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      throw new ManualConversationError(
        "CONVERSATION_RUNTIME_UNAVAILABLE",
        "conversation runtime is unavailable",
        503,
      );
    }
    throw error;
  }
}

function readOverlayDatabase(): ManualOverlayDatabase {
  try {
    const parsed = JSON.parse(
      fs.readFileSync(overlayPath(), "utf8"),
    ) as Partial<ManualOverlayDatabase>;
    if (
      parsed.version !== OVERLAY_VERSION ||
      !parsed.conversations ||
      typeof parsed.conversations !== "object" ||
      Array.isArray(parsed.conversations)
    ) {
      throw new Error("manual conversation overlay has an unsupported shape");
    }
    return parsed as ManualOverlayDatabase;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return { version: OVERLAY_VERSION, conversations: {} };
    }
    throw error;
  }
}

function acquireLock(): number {
  fs.mkdirSync(path.dirname(lockPath()), { recursive: true });
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const descriptor = fs.openSync(lockPath(), "wx", 0o600);
      fs.writeFileSync(
        descriptor,
        JSON.stringify({ pid: process.pid, acquired_at: now() }),
      );
      return descriptor;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
      try {
        const statistics = fs.statSync(lockPath());
        if (Date.now() - statistics.mtimeMs > LOCK_STALE_MS) {
          fs.unlinkSync(lockPath());
          continue;
        }
      } catch (statError) {
        if ((statError as NodeJS.ErrnoException).code === "ENOENT") continue;
        throw statError;
      }
      throw new ManualConversationError(
        "MANUAL_CONVERSATION_BUSY",
        "manual conversation state is busy",
        503,
      );
    }
  }
  throw new ManualConversationError(
    "MANUAL_CONVERSATION_BUSY",
    "manual conversation state is busy",
    503,
  );
}

function withOverlayLock<T>(
  callback: (database: ManualOverlayDatabase) => T,
): T {
  const descriptor = acquireLock();
  try {
    const database = readOverlayDatabase();
    const result = callback(database);
    writeJsonAtomically(overlayPath(), database);
    return result;
  } finally {
    try {
      fs.closeSync(descriptor);
    } finally {
      try {
        fs.unlinkSync(lockPath());
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      }
    }
  }
}

function baseConversations(
  runtime: RuntimeDatabase,
  merchantId: string,
): RuntimeConversation[] {
  const byMerchant = objectRecord(runtime.conversationsByMerchant);
  const values = byMerchant[merchantId];
  return Array.isArray(values)
    ? values.filter(
        (item): item is RuntimeConversation =>
          Boolean(item) && typeof item === "object" && !Array.isArray(item),
      )
    : [];
}

function pageRecords(
  runtime: RuntimeDatabase,
): Map<string, MetaPageConnection> {
  const source = objectRecord(runtime.metaPagesByPageId);
  const result = new Map<string, MetaPageConnection>();
  for (const [entryId, value] of Object.entries(source)) {
    const record = objectRecord(value) as MetaPageConnection;
    const pageId = text(record.page_id || entryId);
    if (pageId) result.set(pageId, record);
  }
  return result;
}

function merchantOverlay(
  database: ManualOverlayDatabase,
  merchantId: string,
  create = false,
): Record<string, ManualConversationOverlay> {
  const existing = database.conversations[merchantId];
  if (existing) return existing;
  if (!create) return {};
  database.conversations[merchantId] = {};
  return database.conversations[merchantId];
}

function conversationOverlay(
  database: ManualOverlayDatabase,
  merchantId: string,
  conversationId: string,
): ManualConversationOverlay | undefined {
  return merchantOverlay(database, merchantId)[conversationId];
}

function requireBaseConversation(
  runtime: RuntimeDatabase,
  merchantId: string,
  conversationId: string,
): RuntimeConversation {
  const conversation = baseConversations(runtime, merchantId).find(
    (item) => text(item.id) === conversationId,
  );
  if (!conversation) {
    throw new ManualConversationError(
      "CONVERSATION_NOT_FOUND",
      "conversation was not found",
      404,
    );
  }
  return conversation;
}

function resolveConversationPage(
  runtime: RuntimeDatabase,
  merchantId: string,
  conversation: RuntimeConversation,
  overlay?: ManualConversationOverlay,
): { pageId: string; connection: MetaPageConnection } {
  const pages = pageRecords(runtime);
  const explicitPageId = text(overlay?.page_id || conversation.page_id);
  if (explicitPageId) {
    const connection = pages.get(explicitPageId);
    if (text(connection?.merchant_id) !== merchantId) {
      throw new ManualConversationError(
        "CONVERSATION_CHANNEL_INVALID",
        "conversation channel does not belong to this merchant",
      );
    }
    return { pageId: explicitPageId, connection: connection! };
  }

  const merchantPages = [...pages.entries()].filter(
    ([, connection]) => text(connection.merchant_id) === merchantId,
  );
  if (merchantPages.length !== 1) {
    throw new ManualConversationError(
      "CONVERSATION_CHANNEL_UNRESOLVED",
      merchantPages.length === 0
        ? "conversation has no connected Meta page"
        : "conversation channel is ambiguous across multiple Meta pages",
    );
  }
  const [pageId, connection] = merchantPages[0];
  return { pageId, connection };
}

function mergeConversation(
  base: RuntimeConversation,
  overlay?: ManualConversationOverlay,
): RuntimeConversation {
  if (!overlay) {
    return {
      ...base,
      messages: messageArray(base.messages),
    };
  }
  const messages = [
    ...messageArray(base.messages),
    ...messageArray(overlay.inbound_messages),
    ...messageArray(overlay.manual_messages),
  ].sort((left, right) =>
    text(left.created_at).localeCompare(text(right.created_at)),
  );
  return {
    ...base,
    page_id: text(overlay.page_id || base.page_id) || undefined,
    status: overlay.status,
    assigned_to_human: overlay.assigned_to_human,
    updated_at: overlay.updated_at || base.updated_at,
    messages,
  };
}

function unresolvedManualRequest(
  overlay: ManualConversationOverlay | undefined,
): ManualReplyRequest | undefined {
  return Object.values(requestMap(overlay?.requests)).find(
    (request) => request.status === "pending" || request.status === "uncertain",
  );
}

export function listServerConversations(merchantId: string): RuntimeConversation[] {
  const runtime = readRuntimeDatabase();
  const overlays = merchantOverlay(readOverlayDatabase(), merchantId);
  return baseConversations(runtime, merchantId).map((conversation) =>
    mergeConversation(conversation, overlays[text(conversation.id)]),
  );
}

export function getServerConversation(
  merchantId: string,
  conversationId: string,
): RuntimeConversation {
  const runtime = readRuntimeDatabase();
  const base = requireBaseConversation(runtime, merchantId, conversationId);
  return mergeConversation(
    base,
    conversationOverlay(readOverlayDatabase(), merchantId, conversationId),
  );
}

export function takeOverConversation(
  merchantId: string,
  conversationId: string,
): RuntimeConversation {
  return withOverlayLock((database) => {
    const runtime = readRuntimeDatabase();
    const base = requireBaseConversation(runtime, merchantId, conversationId);
    const overlays = merchantOverlay(database, merchantId, true);
    const current = overlays[conversationId];
    const { pageId } = resolveConversationPage(
      runtime,
      merchantId,
      base,
      current,
    );
    overlays[conversationId] = {
      status: "manual",
      assigned_to_human: true,
      page_id: pageId,
      inbound_messages: messageArray(current?.inbound_messages),
      manual_messages: messageArray(current?.manual_messages),
      requests: requestMap(current?.requests),
      updated_at: now(),
    };
    return mergeConversation(base, overlays[conversationId]);
  });
}

export function returnConversationToFawri(
  merchantId: string,
  conversationId: string,
): RuntimeConversation {
  return withOverlayLock((database) => {
    const runtime = readRuntimeDatabase();
    const base = requireBaseConversation(runtime, merchantId, conversationId);
    const overlays = merchantOverlay(database, merchantId, true);
    const current = overlays[conversationId];
    const unresolved = unresolvedManualRequest(current);
    if (unresolved) {
      throw new ManualConversationError(
        "MANUAL_REPLY_RECONCILIATION_REQUIRED",
        "manual reply delivery must be reconciled before returning to Fawri",
      );
    }
    const { pageId } = resolveConversationPage(
      runtime,
      merchantId,
      base,
      current,
    );
    overlays[conversationId] = {
      status: "auto_replying",
      assigned_to_human: false,
      page_id: pageId,
      inbound_messages: messageArray(current?.inbound_messages),
      manual_messages: messageArray(current?.manual_messages),
      requests: requestMap(current?.requests),
      updated_at: now(),
    };
    return mergeConversation(base, overlays[conversationId]);
  });
}

export function isConversationUnderManualControl(
  merchantId: string,
  conversationId: string,
): boolean {
  const overlay = conversationOverlay(
    readOverlayDatabase(),
    merchantId,
    conversationId,
  );
  return overlay?.status === "manual" && overlay.assigned_to_human === true;
}

export function recordManualInboundMessage(input: {
  merchantId: string;
  conversationId: string;
  externalMessageId: string;
  messageText: string;
  createdAt?: unknown;
}): RuntimeMessage {
  const merchantId = text(input.merchantId);
  const conversationId = text(input.conversationId);
  const externalMessageId = text(input.externalMessageId);
  const messageText = text(input.messageText);
  if (!externalMessageId || !messageText) {
    throw new ManualConversationError(
      "MANUAL_INBOUND_MESSAGE_INVALID",
      "manual inbound message identity and text are required",
      400,
    );
  }

  return withOverlayLock((database) => {
    const runtime = readRuntimeDatabase();
    const base = requireBaseConversation(runtime, merchantId, conversationId);
    const overlay = conversationOverlay(database, merchantId, conversationId);
    if (!overlay || overlay.status !== "manual" || !overlay.assigned_to_human) {
      throw new ManualConversationError(
        "MANUAL_TAKEOVER_REQUIRED",
        "conversation is not under manual control",
      );
    }

    const existing = [
      ...messageArray(base.messages),
      ...messageArray(overlay.inbound_messages),
    ].find((message) => text(message.external_message_id) === externalMessageId);
    if (existing) return existing;

    const createdAt = normalizedTimestamp(input.createdAt);
    const message: RuntimeMessage = {
      id: makeMessageId("msg-customer-manual"),
      external_message_id: externalMessageId,
      conversation_id: conversationId,
      sender: "customer",
      text: messageText,
      created_at: createdAt,
      counted_as_auto_reply: false,
      status: "received",
    };
    overlay.inbound_messages = [
      ...messageArray(overlay.inbound_messages),
      message,
    ];
    overlay.updated_at = createdAt;
    return message;
  });
}

export function prepareManualReply(input: {
  merchantId: string;
  conversationId: string;
  idempotencyKey: string;
  messageText: string;
}): PreparedManualReply {
  const merchantId = text(input.merchantId);
  const conversationId = text(input.conversationId);
  const idempotencyKey = text(input.idempotencyKey);
  const messageText = text(input.messageText);
  if (!/^[A-Za-z0-9._:-]{16,128}$/.test(idempotencyKey)) {
    throw new ManualConversationError(
      "IDEMPOTENCY_KEY_INVALID",
      "a valid Idempotency-Key header is required",
      400,
    );
  }
  if (!messageText || messageText.length > 2000) {
    throw new ManualConversationError(
      "MANUAL_REPLY_TEXT_INVALID",
      "manual reply must contain 1 to 2000 characters",
      400,
    );
  }

  return withOverlayLock((database) => {
    const runtime = readRuntimeDatabase();
    const base = requireBaseConversation(runtime, merchantId, conversationId);
    const overlay = conversationOverlay(database, merchantId, conversationId);
    if (!overlay || overlay.status !== "manual" || !overlay.assigned_to_human) {
      throw new ManualConversationError(
        "MANUAL_TAKEOVER_REQUIRED",
        "conversation must be taken over before sending a manual reply",
      );
    }

    const hash = sha256(messageText);
    const existing = requestMap(overlay.requests)[idempotencyKey];
    if (existing) {
      if (existing.text_sha256 !== hash) {
        throw new ManualConversationError(
          "IDEMPOTENCY_KEY_REUSED",
          "Idempotency-Key was already used with different content",
        );
      }
      if (existing.status === "sent" && existing.message_id) {
        const message = messageArray(overlay.manual_messages).find(
          (item) => item.id === existing.message_id,
        );
        if (message) return { deduplicated: true, existingMessage: message };
      }
      if (existing.status === "failed") {
        throw new ManualConversationError(
          "MANUAL_REPLY_REQUEST_FAILED",
          "this manual reply request already failed; use a new Idempotency-Key",
        );
      }
      throw new ManualConversationError(
        "MANUAL_REPLY_OUTCOME_UNCERTAIN",
        "manual reply delivery outcome is not safe to retry automatically",
      );
    }

    const { pageId, connection } = resolveConversationPage(
      runtime,
      merchantId,
      base,
      overlay,
    );
    const pageAccessToken = text(connection.page_access_token);
    if (!pageAccessToken) {
      throw new ManualConversationError(
        "META_PAGE_TOKEN_UNAVAILABLE",
        "Meta page access token is unavailable",
      );
    }
    const customerId = text(base.customer_handle);
    if (!customerId) {
      throw new ManualConversationError(
        "CONVERSATION_CUSTOMER_UNAVAILABLE",
        "conversation customer identifier is unavailable",
      );
    }

    const timestamp = now();
    overlay.page_id = pageId;
    overlay.updated_at = timestamp;
    overlay.requests = requestMap(overlay.requests);
    overlay.requests[idempotencyKey] = {
      idempotency_key: idempotencyKey,
      text_sha256: hash,
      status: "pending",
      created_at: timestamp,
      updated_at: timestamp,
    };
    return {
      deduplicated: false,
      pageId,
      pageAccessToken,
      customerId,
    };
  });
}

export function completeManualReply(input: {
  merchantId: string;
  conversationId: string;
  idempotencyKey: string;
  messageText: string;
  externalMessageId?: string;
}): RuntimeMessage {
  return withOverlayLock((database) => {
    const overlay = conversationOverlay(
      database,
      text(input.merchantId),
      text(input.conversationId),
    );
    const request = requestMap(overlay?.requests)[text(input.idempotencyKey)];
    const messageText = text(input.messageText);
    if (
      !overlay ||
      !request ||
      request.status !== "pending" ||
      request.text_sha256 !== sha256(messageText)
    ) {
      throw new ManualConversationError(
        "MANUAL_REPLY_STATE_INVALID",
        "manual reply completion state is invalid",
        500,
      );
    }
    const timestamp = now();
    const message: RuntimeMessage = {
      id: makeMessageId("msg-merchant"),
      external_message_id: text(input.externalMessageId) || undefined,
      conversation_id: text(input.conversationId),
      sender: "merchant",
      text: messageText,
      created_at: timestamp,
      counted_as_auto_reply: false,
      reply_type: "manual",
      status: "sent",
    };
    overlay.manual_messages = [
      ...messageArray(overlay.manual_messages),
      message,
    ];
    overlay.updated_at = timestamp;
    request.status = "sent";
    request.updated_at = timestamp;
    request.message_id = message.id;
    request.external_message_id = message.external_message_id;
    return message;
  });
}

export function failManualReply(input: {
  merchantId: string;
  conversationId: string;
  idempotencyKey: string;
  errorCode: string;
  uncertain: boolean;
}): void {
  withOverlayLock((database) => {
    const overlay = conversationOverlay(
      database,
      text(input.merchantId),
      text(input.conversationId),
    );
    const request = requestMap(overlay?.requests)[text(input.idempotencyKey)];
    if (!request || request.status !== "pending") return;
    request.status = input.uncertain ? "uncertain" : "failed";
    request.error_code = text(input.errorCode) || "MANUAL_REPLY_FAILED";
    request.updated_at = now();
    if (overlay) overlay.updated_at = request.updated_at;
  });
}
