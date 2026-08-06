import crypto from "node:crypto";
import type { Request } from "express";

const INTERNAL_HEADER = "x-fawri-internal-webhook-worker";
const internalToken = crypto.randomBytes(32).toString("hex");
const loopbackAddresses = new Set([
  "127.0.0.1",
  "::1",
  "::ffff:127.0.0.1",
]);

function firstHeader(value: string | string[] | undefined): string {
  return Array.isArray(value) ? String(value[0] || "") : String(value || "");
}

function constantTimeEqual(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left, "utf8");
  const rightBuffer = Buffer.from(right, "utf8");
  return (
    leftBuffer.length === rightBuffer.length &&
    crypto.timingSafeEqual(leftBuffer, rightBuffer)
  );
}

export function getMetaWebhookInternalReplayHeaders(): Record<string, string> {
  return { [INTERNAL_HEADER]: internalToken };
}

export function isTrustedMetaWebhookInternalReplay(req: Request): boolean {
  const remoteAddress = String(req.socket.remoteAddress || "").trim();
  if (!loopbackAddresses.has(remoteAddress)) return false;

  const supplied = firstHeader(req.headers[INTERNAL_HEADER]).trim();
  return Boolean(supplied) && constantTimeEqual(supplied, internalToken);
}
