import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import type { NextFunction, Request, Response } from "express";
import { getFawriDataFilePath } from "../lib/dataPaths";
import { isTrustedMetaWebhookInternalReplay } from "../services/metaWebhookInternalReplay";
import { operationalPostgresAuthorityRequired } from "../services/operationalPostgresAuthority";

export type MetaRawBodyRequest = Request & { rawBody?: Buffer };

type ProcessedMetaEventsStore = { events: Record<string, string> };

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

export function verifyMetaWebhookRawBodySignature(
  rawBody: Buffer,
  suppliedSignature: string,
  appSecret: string,
): boolean {
  if (!Buffer.isBuffer(rawBody) || rawBody.length === 0 || !appSecret) return false;
  if (!/^sha256=[a-f0-9]{64}$/i.test(suppliedSignature)) return false;

  const expectedSignature = `sha256=${crypto
    .createHmac("sha256", appSecret)
    .update(rawBody)
    .digest("hex")}`;
  const suppliedBuffer = Buffer.from(suppliedSignature.toLowerCase(), "utf8");
  const expectedBuffer = Buffer.from(expectedSignature, "utf8");
  return suppliedBuffer.length === expectedBuffer.length &&
    crypto.timingSafeEqual(suppliedBuffer, expectedBuffer);
}

function readProcessedEventsStore(filePath: string): ProcessedMetaEventsStore {
  try {
    const parsed = JSON.parse(fs.readFileSync(filePath, "utf8")) as {
      events?: unknown;
    };
    return {
      events:
        parsed.events && typeof parsed.events === "object" && !Array.isArray(parsed.events)
          ? (parsed.events as Record<string, string>)
          : {},
    };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return { events: {} };
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
  return Object.fromEntries(
    Object.entries(events)
      .filter(([, timestamp]) => {
        const seenAt = new Date(timestamp).getTime();
        return Number.isFinite(seenAt) && nowMs - seenAt <= PROCESSED_EVENT_TTL_MS;
      })
      .sort((left, right) => new Date(right[1]).getTime() - new Date(left[1]).getTime())
      .slice(0, PROCESSED_EVENT_LIMIT),
  );
}

export function getMetaWebhookEventId(pageId: string, event: unknown): string {
  const record = event && typeof event === "object"
    ? (event as Record<string, unknown>)
    : {};
  const message = record.message && typeof record.message === "object"
    ? (record.message as Record<string, unknown>)
    : {};
  const postback = record.postback && typeof record.postback === "object"
    ? (record.postback as Record<string, unknown>)
    : {};
  const externalId = String(message.mid || postback.mid || record.id || "").trim();
  if (externalId) return `meta:${pageId}:${externalId}`;

  const digest = crypto
    .createHash("sha256")
    .update(`${pageId}:${JSON.stringify(record)}`)
    .digest("hex");
  return `meta:${pageId}:sha256:${digest}`;
}

export function markMetaWebhookEventsProcessed(
  eventIds: string[],
  now: Date = new Date(),
): void {
  const normalizedIds = [...new Set(eventIds.map(String).map((id) => id.trim()))]
    .filter(Boolean);
  if (normalizedIds.length === 0 || operationalPostgresAuthorityRequired()) return;

  const storePath = getFawriDataFilePath("processed-meta-events.json");
  const store = readProcessedEventsStore(storePath);
  const events = pruneProcessedEvents(store.events, now.getTime());
  for (const eventId of normalizedIds) events[eventId] = now.toISOString();
  writeProcessedEventsStore(storePath, { events });
}

function filterDuplicateEvents(body: Record<string, unknown>): {
  body: Record<string, unknown>;
  accepted: number;
  duplicates: number;
  acceptedEventIds: string[];
} {
  if (operationalPostgresAuthorityRequired()) {
    const acceptedEventIds: string[] = [];
    for (const entryValue of Array.isArray(body.entry) ? body.entry : []) {
      const entry = entryValue && typeof entryValue === "object"
        ? (entryValue as Record<string, unknown>)
        : {};
      const pageId = String(entry.id || "").trim();
      for (const event of Array.isArray(entry.messaging) ? entry.messaging : []) {
        acceptedEventIds.push(getMetaWebhookEventId(pageId, event));
      }
    }
    return {
      body,
      accepted: acceptedEventIds.length,
      duplicates: 0,
      acceptedEventIds,
    };
  }

  const storePath = getFawriDataFilePath("processed-meta-events.json");
  const store = readProcessedEventsStore(storePath);
  const persisted = pruneProcessedEvents(store.events, Date.now());
  const seen = new Set(Object.keys(persisted));
  const acceptedEventIds: string[] = [];
  let accepted = 0;
  let duplicates = 0;

  const filteredEntries = (Array.isArray(body.entry) ? body.entry : []).map((entry) => {
    const record = entry && typeof entry === "object"
      ? (entry as Record<string, unknown>)
      : {};
    const pageId = String(record.id || "").trim();
    const filteredMessaging = (Array.isArray(record.messaging) ? record.messaging : [])
      .filter((event) => {
        const eventId = getMetaWebhookEventId(pageId, event);
        if (seen.has(eventId)) {
          duplicates += 1;
          return false;
        }
        seen.add(eventId);
        acceptedEventIds.push(eventId);
        accepted += 1;
        return true;
      });
    return { ...record, messaging: filteredMessaging };
  });

  return {
    body: { ...body, entry: filteredEntries },
    accepted,
    duplicates,
    acceptedEventIds,
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

  if (isTrustedMetaWebhookInternalReplay(req)) {
    res.locals.metaWebhookInternalReplay = true;
    next();
    return;
  }

  const appSecret = String(process.env.META_APP_SECRET || "").trim();
  if (!appSecret) {
    sendWebhookError(
      res,
      503,
      "META_WEBHOOK_SECRET_NOT_CONFIGURED",
      "Meta webhook verification is unavailable",
    );
    return;
  }

  const rawBody = (req as MetaRawBodyRequest).rawBody;
  const suppliedSignature = String(req.headers["x-hub-signature-256"] || "").trim();
  if (!rawBody || !verifyMetaWebhookRawBodySignature(rawBody, suppliedSignature, appSecret)) {
    sendWebhookError(
      res,
      401,
      /^sha256=[a-f0-9]{64}$/i.test(suppliedSignature)
        ? "META_WEBHOOK_SIGNATURE_INVALID"
        : "META_WEBHOOK_SIGNATURE_REQUIRED",
      "valid Meta webhook signature is required",
    );
    return;
  }

  const body = req.body && typeof req.body === "object" && !Array.isArray(req.body)
    ? (req.body as Record<string, unknown>)
    : {};

  try {
    const result = filterDuplicateEvents(body);
    req.body = result.body;
    res.locals.metaWebhookAcceptedEvents = result.accepted;
    res.locals.metaWebhookDuplicateEvents = result.duplicates;
    res.locals.metaWebhookAcceptedEventIds = result.acceptedEventIds;
    next();
  } catch {
    sendWebhookError(
      res,
      503,
      "META_WEBHOOK_IDEMPOTENCY_UNAVAILABLE",
      "Meta webhook idempotency verification is unavailable",
    );
  }
}
