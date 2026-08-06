import fs from "node:fs";
import path from "node:path";
import { getFawriDataFilePath } from "../lib/dataPaths";

type RuntimeMessage = {
  external_message_id?: unknown;
  sender?: unknown;
  status?: unknown;
};

type RuntimeConversation = {
  id?: unknown;
  messages?: unknown;
};

type RuntimeDatabase = {
  conversationsByMerchant?: unknown;
  [key: string]: unknown;
};

export type MetaWebhookReplyOutcome =
  | { status: "sent"; conversationId: string }
  | { status: "failed"; conversationId: string }
  | { status: "missing" };

function asConversations(value: unknown): RuntimeConversation[] {
  return Array.isArray(value)
    ? value.filter(
        (item): item is RuntimeConversation =>
          Boolean(item) && typeof item === "object" && !Array.isArray(item),
      )
    : [];
}

function asMessages(value: unknown): RuntimeMessage[] {
  return Array.isArray(value)
    ? value.filter(
        (item): item is RuntimeMessage =>
          Boolean(item) && typeof item === "object" && !Array.isArray(item),
      )
    : [];
}

function readRuntimeDatabase(filePath: string): RuntimeDatabase {
  return JSON.parse(fs.readFileSync(filePath, "utf8")) as RuntimeDatabase;
}

function writeRuntimeDatabaseAtomically(
  filePath: string,
  database: RuntimeDatabase,
): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const temporaryPath = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(temporaryPath, `${JSON.stringify(database, null, 2)}\n`, {
    encoding: "utf8",
    mode: 0o600,
  });
  fs.renameSync(temporaryPath, filePath);
}

function findAttempt(
  database: RuntimeDatabase,
  merchantId: string,
  externalMessageId: string,
): {
  conversations: RuntimeConversation[];
  conversationIndex: number;
  customerIndex: number;
  replyIndex: number;
} | null {
  const map =
    database.conversationsByMerchant &&
    typeof database.conversationsByMerchant === "object" &&
    !Array.isArray(database.conversationsByMerchant)
      ? (database.conversationsByMerchant as Record<string, unknown>)
      : {};
  const conversations = asConversations(map[merchantId]);

  for (
    let conversationIndex = 0;
    conversationIndex < conversations.length;
    conversationIndex += 1
  ) {
    const messages = asMessages(conversations[conversationIndex].messages);
    const customerIndex = messages.findIndex(
      (message) =>
        String(message.external_message_id || "").trim() === externalMessageId,
    );
    if (customerIndex < 0) continue;

    const relativeReplyIndex = messages
      .slice(customerIndex + 1)
      .findIndex((message) => String(message.sender || "").trim() === "fawri");
    const replyIndex =
      relativeReplyIndex < 0
        ? -1
        : customerIndex + 1 + relativeReplyIndex;
    return {
      conversations,
      conversationIndex,
      customerIndex,
      replyIndex,
    };
  }

  return null;
}

export function getMetaWebhookReplyOutcome(params: {
  merchantId: string;
  externalMessageId: string;
}): MetaWebhookReplyOutcome {
  const merchantId = String(params.merchantId || "").trim();
  const externalMessageId = String(params.externalMessageId || "").trim();
  if (!merchantId || !externalMessageId) return { status: "missing" };

  const databasePath = getFawriDataFilePath("fawri-runtime-db.json");
  try {
    const database = readRuntimeDatabase(databasePath);
    const attempt = findAttempt(database, merchantId, externalMessageId);
    if (!attempt || attempt.replyIndex < 0) return { status: "missing" };

    const conversation = attempt.conversations[attempt.conversationIndex];
    const messages = asMessages(conversation.messages);
    const replyStatus = String(messages[attempt.replyIndex]?.status || "").trim();
    const conversationId = String(conversation.id || "").trim();
    if (replyStatus === "sent") return { status: "sent", conversationId };
    if (replyStatus === "failed") return { status: "failed", conversationId };
    return { status: "missing" };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return { status: "missing" };
    }
    throw error;
  }
}

export function removeFailedMetaWebhookAttempt(params: {
  merchantId: string;
  externalMessageId: string;
}): boolean {
  const merchantId = String(params.merchantId || "").trim();
  const externalMessageId = String(params.externalMessageId || "").trim();
  if (!merchantId || !externalMessageId) return false;

  const databasePath = getFawriDataFilePath("fawri-runtime-db.json");
  const database = readRuntimeDatabase(databasePath);
  const map =
    database.conversationsByMerchant &&
    typeof database.conversationsByMerchant === "object" &&
    !Array.isArray(database.conversationsByMerchant)
      ? (database.conversationsByMerchant as Record<string, unknown>)
      : {};
  const attempt = findAttempt(database, merchantId, externalMessageId);
  if (!attempt || attempt.replyIndex < 0) return false;

  const conversation = attempt.conversations[attempt.conversationIndex];
  const messages = asMessages(conversation.messages);
  if (String(messages[attempt.replyIndex]?.status || "").trim() !== "failed") {
    return false;
  }

  const removal = new Set([attempt.customerIndex, attempt.replyIndex]);
  const remainingMessages = messages.filter((_, index) => !removal.has(index));
  const updatedConversations = [...attempt.conversations];
  if (remainingMessages.length === 0) {
    updatedConversations.splice(attempt.conversationIndex, 1);
  } else {
    updatedConversations[attempt.conversationIndex] = {
      ...conversation,
      messages: remainingMessages,
      updated_at: new Date().toISOString(),
    } as RuntimeConversation;
  }

  map[merchantId] = updatedConversations;
  database.conversationsByMerchant = map;
  writeRuntimeDatabaseAtomically(databasePath, database);
  return true;
}
