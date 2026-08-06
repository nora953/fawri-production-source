import fs from "node:fs";
import path from "node:path";
import { getFawriDataFilePath } from "../lib/dataPaths";
import { registerMerchantRuntimeDeletion } from "./merchantRuntime";

const LOCK_STALE_MS = 30_000;

function overlayPath(): string {
  return getFawriDataFilePath("manual-conversation-operations.json");
}

function lockPath(): string {
  return `${overlayPath()}.lock`;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function acquireLock(): number {
  fs.mkdirSync(path.dirname(lockPath()), { recursive: true });
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      return fs.openSync(lockPath(), "wx", 0o600);
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
      throw new Error("manual conversation deletion lock is busy");
    }
  }
  throw new Error("manual conversation deletion lock is busy");
}

function writeAtomically(value: unknown): void {
  const target = overlayPath();
  fs.mkdirSync(path.dirname(target), { recursive: true });
  const temporary = `${target}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`, {
    encoding: "utf8",
    mode: 0o600,
  });
  fs.renameSync(temporary, target);
}

registerMerchantRuntimeDeletion((merchantId) => {
  const target = overlayPath();
  if (!fs.existsSync(target)) {
    return {
      manualConversations: 0,
      manualInboundMessages: 0,
      manualMessages: 0,
      manualReplyRequests: 0,
    };
  }

  const descriptor = acquireLock();
  try {
    const database = JSON.parse(fs.readFileSync(target, "utf8")) as {
      version?: unknown;
      conversations?: unknown;
    };
    if (database.version !== 1) {
      throw new Error("manual conversation overlay has an unsupported shape");
    }
    const conversationsByMerchant = asRecord(database.conversations);
    const merchantConversations = asRecord(conversationsByMerchant[merchantId]);
    let manualInboundMessages = 0;
    let manualMessages = 0;
    let manualReplyRequests = 0;
    for (const conversation of Object.values(merchantConversations)) {
      const record = asRecord(conversation);
      manualInboundMessages += Array.isArray(record.inbound_messages)
        ? record.inbound_messages.length
        : 0;
      manualMessages += Array.isArray(record.manual_messages)
        ? record.manual_messages.length
        : 0;
      manualReplyRequests += Object.keys(asRecord(record.requests)).length;
    }

    delete conversationsByMerchant[merchantId];
    database.conversations = conversationsByMerchant;
    writeAtomically(database);
    return {
      manualConversations: Object.keys(merchantConversations).length,
      manualInboundMessages,
      manualMessages,
      manualReplyRequests,
    };
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
});
