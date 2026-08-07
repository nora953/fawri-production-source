import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { getFawriDataFilePath } from "../lib/dataPaths";

export type FakeMetaReplyOutcome =
  | "sent"
  | "failed"
  | "uncertain"
  | "blocked"
  | "leave_sending";

export type MetaWebhookReplyTransportState = {
  event_id: string;
  merchant_id: string;
  settings_version: number;
  status:
    | "reserved"
    | "sending"
    | "sent"
    | "failed"
    | "uncertain"
    | "suppressed";
  attempts: number;
  code?: string;
  transport_message_id?: string;
  reserved_at?: string;
  send_started_at?: string;
  completed_at?: string;
  updated_at: string;
};

type FakeTransportStore = {
  version: 1;
  deliveries: Record<string, MetaWebhookReplyTransportState>;
};

export type MetaWebhookReplyTransportResult =
  | {
      status: "sent";
      transportMessageId: string;
      deduplicated: boolean;
    }
  | { status: "failed"; code: "META_FAKE_CONFIRMED_FAILURE" }
  | { status: "uncertain"; code: "META_FAKE_DELIVERY_UNCERTAIN" }
  | { status: "blocked"; code: string };

export type MetaWebhookReplyTransport = {
  read(eventId: string): MetaWebhookReplyTransportState | null;
  markReserved(input: {
    eventId: string;
    merchantId: string;
    settingsVersion: number;
    now?: Date;
  }): MetaWebhookReplyTransportState;
  markSuppressed(input: {
    eventId: string;
    merchantId: string;
    settingsVersion: number;
    code: string;
    now?: Date;
  }): MetaWebhookReplyTransportState;
  send(input: {
    eventId: string;
    merchantId: string;
    settingsVersion: number;
    beforeSend: () => Promise<void> | void;
    now?: Date;
  }): Promise<MetaWebhookReplyTransportResult>;
};

const STORE_VERSION = 1 as const;
const LOCK_STALE_MS = 120_000;

function text(value: unknown): string {
  return String(value || "").trim();
}

function positiveVersion(value: unknown): number {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw Object.assign(new Error("Meta fake transport settings version is invalid"), {
      code: "META_FAKE_TRANSPORT_VERSION_INVALID",
    });
  }
  return parsed;
}

function storePath(): string {
  return getFawriDataFilePath("meta-fake-reply-transport.json");
}

function lockPath(): string {
  return `${storePath()}.lock`;
}

function writeStore(store: FakeTransportStore): void {
  const filePath = storePath();
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const temporaryPath = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(temporaryPath, `${JSON.stringify(store, null, 2)}\n`, {
    encoding: "utf8",
    mode: 0o600,
  });
  fs.renameSync(temporaryPath, filePath);
}

function readStore(): FakeTransportStore {
  try {
    const parsed = JSON.parse(fs.readFileSync(storePath(), "utf8")) as {
      version?: unknown;
      deliveries?: unknown;
    };
    if (
      parsed.version !== STORE_VERSION ||
      !parsed.deliveries ||
      typeof parsed.deliveries !== "object" ||
      Array.isArray(parsed.deliveries)
    ) {
      throw new Error("Meta fake transport store has an unsupported shape");
    }
    return {
      version: STORE_VERSION,
      deliveries: parsed.deliveries as Record<
        string,
        MetaWebhookReplyTransportState
      >,
    };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return { version: STORE_VERSION, deliveries: {} };
    }
    throw error;
  }
}

type StoreLock = { descriptor: number; token: string };

function acquireLock(): StoreLock {
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
      throw Object.assign(new Error("Meta fake transport store is busy"), {
        code: "META_FAKE_TRANSPORT_BUSY",
      });
    }
  }
  throw new Error("Meta fake transport lock could not be acquired");
}

function releaseLock(lock: StoreLock): void {
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

function withStoreLock<T>(callback: (store: FakeTransportStore) => T): T {
  const lock = acquireLock();
  try {
    const store = readStore();
    const result = callback(store);
    writeStore(store);
    return result;
  } finally {
    releaseLock(lock);
  }
}

function requireIdentity(input: {
  eventId: string;
  merchantId: string;
  settingsVersion: number;
}): { eventId: string; merchantId: string; settingsVersion: number } {
  const eventId = text(input.eventId);
  const merchantId = text(input.merchantId);
  const settingsVersion = positiveVersion(input.settingsVersion);
  if (!eventId || !merchantId) {
    throw Object.assign(new Error("Meta fake transport identity is invalid"), {
      code: "META_FAKE_TRANSPORT_IDENTITY_INVALID",
    });
  }
  return { eventId, merchantId, settingsVersion };
}

function assertSameMerchant(
  state: MetaWebhookReplyTransportState,
  merchantId: string,
): void {
  if (state.merchant_id !== merchantId) {
    throw Object.assign(new Error("Meta fake transport event identity collision"), {
      code: "META_FAKE_TRANSPORT_IDENTITY_COLLISION",
    });
  }
}

function syntheticMessageId(eventId: string, attempt: number): string {
  return `fake-${crypto
    .createHash("sha256")
    .update(`${eventId}:${attempt}`)
    .digest("hex")
    .slice(0, 24)}`;
}

export function createFakeMetaWebhookReplyTransport(
  options: {
    outcomeFor?: (input: {
      eventId: string;
      merchantId: string;
      settingsVersion: number;
      attempt: number;
    }) => FakeMetaReplyOutcome | Promise<FakeMetaReplyOutcome>;
  } = {},
): MetaWebhookReplyTransport {
  const outcomeFor =
    options.outcomeFor || (() => "blocked" as const);

  return {
    read(eventIdValue) {
      const eventId = text(eventIdValue);
      if (!eventId) return null;
      const state = readStore().deliveries[eventId];
      return state ? structuredClone(state) : null;
    },

    markReserved(input) {
      const { eventId, merchantId, settingsVersion } = requireIdentity(input);
      const now = input.now || new Date();
      return withStoreLock((store) => {
        const existing = store.deliveries[eventId];
        if (existing) {
          assertSameMerchant(existing, merchantId);
          return structuredClone(existing);
        }
        const state: MetaWebhookReplyTransportState = {
          event_id: eventId,
          merchant_id: merchantId,
          settings_version: settingsVersion,
          status: "reserved",
          attempts: 0,
          reserved_at: now.toISOString(),
          updated_at: now.toISOString(),
        };
        store.deliveries[eventId] = state;
        return structuredClone(state);
      });
    },

    markSuppressed(input) {
      const { eventId, merchantId, settingsVersion } = requireIdentity(input);
      const code = text(input.code) || "META_REPLY_SUPPRESSED";
      const now = input.now || new Date();
      return withStoreLock((store) => {
        const existing = store.deliveries[eventId];
        if (existing) {
          assertSameMerchant(existing, merchantId);
          if (
            existing.status === "sent" ||
            existing.status === "sending" ||
            existing.status === "uncertain"
          ) {
            return structuredClone(existing);
          }
          existing.status = "suppressed";
          existing.code = code;
          existing.completed_at = now.toISOString();
          existing.updated_at = now.toISOString();
          return structuredClone(existing);
        }
        const state: MetaWebhookReplyTransportState = {
          event_id: eventId,
          merchant_id: merchantId,
          settings_version: settingsVersion,
          status: "suppressed",
          attempts: 0,
          code,
          completed_at: now.toISOString(),
          updated_at: now.toISOString(),
        };
        store.deliveries[eventId] = state;
        return structuredClone(state);
      });
    },

    async send(input) {
      const { eventId, merchantId, settingsVersion } = requireIdentity(input);
      const now = input.now || new Date();

      const preexisting = readStore().deliveries[eventId];
      if (preexisting) {
        assertSameMerchant(preexisting, merchantId);
        if (preexisting.status === "sent") {
          return {
            status: "sent",
            transportMessageId: text(preexisting.transport_message_id),
            deduplicated: true,
          };
        }
        if (
          preexisting.status === "sending" ||
          preexisting.status === "uncertain"
        ) {
          return {
            status: "uncertain",
            code: "META_FAKE_DELIVERY_UNCERTAIN",
          };
        }
        if (preexisting.status === "suppressed") {
          return {
            status: "blocked",
            code: text(preexisting.code) || "META_REPLY_SUPPRESSED",
          };
        }
        if (preexisting.settings_version !== settingsVersion) {
          return {
            status: "blocked",
            code: "MERCHANT_SETTINGS_VERSION_CHANGED",
          };
        }
      }

      // The caller's settings/version check runs immediately before the
      // durable "sending" marker. No external network operation exists here.
      await input.beforeSend();

      const started = withStoreLock((store) => {
        const existing = store.deliveries[eventId];
        if (existing) {
          assertSameMerchant(existing, merchantId);
          if (
            existing.status === "sent" ||
            existing.status === "sending" ||
            existing.status === "uncertain" ||
            existing.status === "suppressed"
          ) {
            return { started: false as const, state: structuredClone(existing) };
          }
          if (existing.settings_version !== settingsVersion) {
            return { started: false as const, state: structuredClone(existing) };
          }
        }

        const attempt = (existing?.attempts || 0) + 1;
        const state: MetaWebhookReplyTransportState = {
          ...(existing || {
            event_id: eventId,
            merchant_id: merchantId,
            settings_version: settingsVersion,
            attempts: 0,
          }),
          status: "sending",
          attempts: attempt,
          send_started_at: now.toISOString(),
          completed_at: undefined,
          code: undefined,
          updated_at: now.toISOString(),
        };
        store.deliveries[eventId] = state;
        return { started: true as const, state: structuredClone(state) };
      });

      if (!started.started) {
        const state = started.state;
        if (state.status === "sent") {
          return {
            status: "sent",
            transportMessageId: text(state.transport_message_id),
            deduplicated: true,
          };
        }
        if (state.status === "sending" || state.status === "uncertain") {
          return {
            status: "uncertain",
            code: "META_FAKE_DELIVERY_UNCERTAIN",
          };
        }
        if (state.status === "suppressed") {
          return {
            status: "blocked",
            code: text(state.code) || "META_REPLY_SUPPRESSED",
          };
        }
        return {
          status: "blocked",
          code: "MERCHANT_SETTINGS_VERSION_CHANGED",
        };
      }

      const attempt = started.state.attempts;
      const outcome = await outcomeFor({
        eventId,
        merchantId,
        settingsVersion,
        attempt,
      });

      if (outcome === "leave_sending") {
        throw Object.assign(
          new Error("fake Meta send interrupted after durable send-start marker"),
          { code: "META_FAKE_SEND_INTERRUPTED" },
        );
      }

      if (outcome === "blocked") {
        const suppressed = this.markSuppressed({
          eventId,
          merchantId,
          settingsVersion,
          code: "META_FAKE_TRANSPORT_ONLY",
          now,
        });
        return {
          status: "blocked",
          code: text(suppressed.code) || "META_FAKE_TRANSPORT_ONLY",
        };
      }

      const completed = withStoreLock((store) => {
        const state = store.deliveries[eventId];
        if (!state) {
          throw new Error("Meta fake transport state disappeared during send");
        }
        assertSameMerchant(state, merchantId);
        if (state.status !== "sending" || state.attempts !== attempt) {
          return structuredClone(state);
        }
        state.status = outcome;
        state.code =
          outcome === "failed"
            ? "META_FAKE_CONFIRMED_FAILURE"
            : outcome === "uncertain"
              ? "META_FAKE_DELIVERY_UNCERTAIN"
              : undefined;
        state.transport_message_id =
          outcome === "sent" ? syntheticMessageId(eventId, attempt) : undefined;
        state.completed_at = now.toISOString();
        state.updated_at = now.toISOString();
        return structuredClone(state);
      });

      if (completed.status === "sent") {
        return {
          status: "sent",
          transportMessageId: text(completed.transport_message_id),
          deduplicated: false,
        };
      }
      if (completed.status === "failed") {
        return { status: "failed", code: "META_FAKE_CONFIRMED_FAILURE" };
      }
      return { status: "uncertain", code: "META_FAKE_DELIVERY_UNCERTAIN" };
    },
  };
}
