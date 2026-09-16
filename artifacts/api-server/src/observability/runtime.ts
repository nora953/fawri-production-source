import crypto from "node:crypto";
import type { Request } from "express";
import { MetricsRegistry } from "./metrics";
import type { ReadinessCheck } from "./types";

const SAFE_VERSION = /^[a-z0-9][a-z0-9._-]{0,63}$/i;
const MIN_INTERNAL_TOKEN_BYTES = 32;

export const processMetricsRegistry = new MetricsRegistry();
export const observabilityService = "fawri-api";

export function observabilityVersion(): string {
  const configured = String(process.env.FAWRI_SERVICE_VERSION || "").trim();
  return configured && SAFE_VERSION.test(configured) ? configured : "unknown";
}

export function createPostgresAuthorityReadinessCheck(): ReadinessCheck {
  return {
    name: "postgresql_authority",
    timeoutMs: 2_000,
    async check() {
      const { pool } = await import("@workspace/db");
      await pool.query("select 1");
    },
  };
}

function configuredInternalMetricsToken(): Buffer | null {
  const token = String(process.env.FAWRI_OBSERVABILITY_BEARER_TOKEN || "").trim();
  if (!token) return null;
  const bytes = Buffer.from(token, "utf8");
  return bytes.length >= MIN_INTERNAL_TOKEN_BYTES ? bytes : null;
}

export function allowInternalMetricsRequest(request: Request): boolean {
  const expected = configuredInternalMetricsToken();
  if (!expected) return false;

  const authorization = String(request.header("authorization") || "").trim();
  const match = /^Bearer\s+([^\s]+)$/i.exec(authorization);
  if (!match) return false;

  const supplied = Buffer.from(match[1], "utf8");
  if (supplied.length !== expected.length) return false;
  return crypto.timingSafeEqual(supplied, expected);
}
