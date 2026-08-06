import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import type { NextFunction, Request, Response } from "express";
import { getFawriDataFilePath } from "../lib/dataPaths";

export type MetaRawBodyRequest = Request & { rawBody?: Buffer };

type ProcessedMetaEventsStore = {
  events: Record<string, string>;
};

const PROCESSED_EVENT_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const PROCESSED_EVENT_LIMIT = 50_000;

function sendWebhookError(
  res: Response,
  statusCode: number,
  code: string,
  error: string,
): void {
  res.setHeader("Cache-Control", "no-store");
  res.status(statusCode).json({ ok: false, code, error });
}

function signatureMatches(rawBody: Buffer, suppliedSignature: string): boolean {
  const appSecret = String(process.env.META_APP_SECRET || "").trim();
  if (!appSecret) return false;

  const expectedSignature = `sha256=${crypto
    .createHmac("sha256", appSecret)
    .update(rawBody)
    .digest("hex")}`;
  const suppliedBuffer = Buffer.from(suppliedSignature.toLowerCase(), "utf8");
  const expectedBuffer = Buffer.from(expectedSignature, "utf8");

  return (
    suppliedBuffer.length === expectedBuffer.length &&
    crypto.timingSafeEqual(suppliedBuffer, expectedBuffer)
  );
}

function readProcessedEventsStore(filePath: string): ProcessedMetaEventsStore {
  try {
    const parsed = JSON.parse(fs.readFileSync(filePath, "utf8")) as {
      events?: unknown;
    };
    return {
      events:
        parsed.events &&
        typeof parsed.events === "object" &&
        !Array.isArray(parsed.events)
          ? (parsed.events as Record<string, string>)
          : {},
    };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return { events: {} };
    }
    throw error;
  }
}

function writeProcessedEventsStore(
  filePath: string,
  store: ProcessedMetaEventsStore,
): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const temporaryPath = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(temporaryPath, `${JSON.stringify(store, null, 2)}\n`, {
    encoding: "utf8",
    mode: 0o600,
  });
  fs.renameSync(temporaryPath, filePath);
}

function pruneProcessedEvents(
  events: Record<string, string>,
  nowMs: number,
): Record<string, string> {
  const retained = Object.entries(events)
    .filter(([, timestamp]) => {
      const seenAt = new Date(timestamp).getTime();
      return Number.isFinite(seenAt) && nowMs - seenAt <= PROCESSED_EVENT_TTL_MS;
    })
    .sort(
      (left, right) =>
        new Date(right[1]).getTime() - new Date(left[1]).getTime(),
    )
    .slice(0, PROCESSED_EVENT_LIMIT);

  return Object.fromEntries(retained);
}

export function getMetaWebhookEventId(
  pageId: string,
  event: unknown,
): string {
  const record =
    event && typeof event === "object"
      ? (event as Record<string, unknown>)
      : {};
  const message =
    record.message && typeof record.message === "object"
      ? (record.message as Record<string, unknown>)
      : {};
  const postback =
    record.postback && typeof record.postback === "object"
      ? (record.postback as Record<string, unknown>)
      : {};
  const externalId = String(
    message.mid || postback.mid || record.id || "",
  ).trim();

  if (externalId) return `meta:${pageId}:${externalId}`;

  const digest = crypto
    .createHash("sha256")
    .update(`${pageId}:${JSON.stringify(record)}`)
    .digest("hex");
  return `meta:${pageId}:sha256:${digest}`;
}

function filterDuplicateEvents(body: Record<string, unknown>): {
  body: Record<string, unknown>;
  accepted: number;
  duplicates: number;
} {
  const storePath = getFawriDataFilePath("processed-meta-events.json");
  const nowMs = Date.now();
  const nowIso = new Date(nowMs).toISOString();
  const store = readProcessedEventsStore(storePath);
  const events = pruneProcessedEvents(store.events, nowMs);
  const entries = Array.isArray(body.entry) ? body.entry : [];
  let accepted = 0;
  let duplicates = 0;

  const filteredEntries = entries.map((entry) => {
    const entryRecord =
      entry && typeof entry === "object"
        ? (entry as Record<string, unknown>)
        : {};
    const pageId = String(entryRecord.id || "").trim();
    const messaging = Array.isArray(entryRecord.messaging)
      ? entryRecord.messaging
      : [];
    const filteredMessaging = messaging.filter((event) => {
      const eventId = getMetaWebhookEventId(pageId, event);
      if (events[eventId]) {
        duplicates += 1;
        return false;
      }

      events[eventId] = nowIso;
      accepted += 1;
      return true;
    });

    return { ...entryRecord, messaging: filteredMessaging };
  });

  if (accepted > 0 || Object.keys(events).length !== Object.keys(store.events).length) {
    writeProcessedEventsStore(storePath, { events });
  }

  return {
    body: { ...body, entry: filteredEntries },
    accepted,
    duplicates,
  };
}

export function enforceMetaWebhookSecurity(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  if (req.method !== "POST" || req.path !== "/api/meta/webhook") {
    next();
    return;
  }

  const appSecret = String(process.env.META_APP_SECRET || "").trim();
  if (!appSecret) {
    if (process.env.NODE_ENV === "production") {
      sendWebhookError(
        res,
        503,
        "META_WEBHOOK_SECRET_NOT_CONFIGURED",
        "Meta webhook verification is unavailable",
      );
      return;
    }

    console.warn("META_APP_SECRET is not configured; webhook signature check skipped");
    next();
    return;
  }

  const rawBody = (req as MetaRawBodyRequest).rawBody;
  const suppliedSignature = String(
    req.headers["x-hub-signature-256"] || "",
  ).trim();
  if (!rawBody || !/^sha256=[a-f0-9]{64}$/i.test(suppliedSignature)) {
    sendWebhookError(
      res,
      401,
      "META_WEBHOOK_SIGNATURE_REQUIRED",
      "valid Meta webhook signature is required",
    );
    return;
  }

  if (!signatureMatches(rawBody, suppliedSignature)) {
    sendWebhookError(
      res,
      401,
      "META_WEBHOOK_SIGNATURE_INVALID",
      "Meta webhook signature is invalid",
    );
    return;
  }

  const body =
    req.body && typeof req.body === "object" && !Array.isArray(req.body)
      ? (req.body as Record<string, unknown>)
      : {};

  try {
    const result = filterDuplicateEvents(body);
    req.body = result.body;
    res.locals.metaWebhookAcceptedEvents = result.accepted;
    res.locals.metaWebhookDuplicateEvents = result.duplicates;
    next();
  } catch (error) {
    console.error("Meta webhook idempotency check failed:", error);
    sendWebhookError(
      res,
      503,
      "META_WEBHOOK_IDEMPOTENCY_UNAVAILABLE",
      "Meta webhook idempotency verification is unavailable",
    );
  }
}
