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

export function assertExpectedPostgresRuntimeRole(
  actualRole: string,
  env: NodeJS.ProcessEnv = process.env,
): void {
  const expected = String(env.FAWRI_EXPECTED_POSTGRES_RUNTIME_ROLE || "").trim();
  if (!expected) return;
  if (actualRole.trim() !== expected) {
    throw new Error("POSTGRES_RUNTIME_ROLE_MISMATCH");
  }
}

export function assertSafePostgresRuntimeRole(row: {
  role_name?: unknown; is_superuser?: unknown;
  bypass_rls?: unknown; owns_unforced_rls_table?: unknown;
} | undefined): void {
  if (!row || row.is_superuser !== false || row.bypass_rls !== false || row.owns_unforced_rls_table !== false) {
    throw new Error("POSTGRES_RUNTIME_ROLE_UNSAFE");
  }
  assertExpectedPostgresRuntimeRole(String(row.role_name || ""));
}

export function createPostgresAuthorityReadinessCheck(): ReadinessCheck {
  return {
    name: "postgresql_authority",
    timeoutMs: 2_000,
    async check() {
      const { pool } = await import("@workspace/db");
      const result = await pool.query(`SELECT current_user AS role_name,
        r.rolsuper AS is_superuser, r.rolbypassrls AS bypass_rls,
        EXISTS (
          SELECT 1 FROM pg_class c
          JOIN pg_namespace n ON n.oid = c.relnamespace
          WHERE n.nspname = 'public'
            AND c.relkind IN ('r', 'p') AND c.relrowsecurity
            AND NOT c.relforcerowsecurity AND c.relowner = r.oid
        ) AS owns_unforced_rls_table
        FROM pg_roles r WHERE r.rolname = current_user`);
      const row = result.rows[0] as {
        role_name?: unknown; is_superuser?: unknown;
        bypass_rls?: unknown; owns_unforced_rls_table?: unknown;
      } | undefined;
      assertSafePostgresRuntimeRole(row);
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
