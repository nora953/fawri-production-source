import crypto from "node:crypto";
import type { Request } from "express";
import { MetricsRegistry } from "./metrics";
import type { ReadinessCheck } from "./types";

const SAFE_VERSION = /^[a-z0-9][a-z0-9._-]{0,63}$/i;
const MIN_INTERNAL_TOKEN_BYTES = 32;

// Even an otherwise restricted LOGIN must not be admitted as a hosted tenant
// runtime before the known residual merchant privacy tables have active RLS.
// This protects a future staged NOLOGIN -> LOGIN cutover from relying on
// unprotected broad legacy table GRANTs.
export const CRITICAL_POSTGRES_PRIVACY_RLS_TABLES = [
  "audit_events", "manual_reply_requests", "merchant_admin_notes",
  "merchant_channel_overrides", "merchant_deletion_requests",
  "notifications", "order_drafts", "processed_channel_events",
] as const;

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
  role_name?: unknown; is_superuser?: unknown; can_create_role?: unknown; critical_privacy_rls_ready_count?: unknown;
  bypass_rls?: unknown; owns_unforced_rls_table?: unknown;
  session_role_name?: unknown; session_is_superuser?: unknown; session_bypass_rls?: unknown;
  session_can_create_role?: unknown; session_inherits_privileged_role?: unknown;
  session_can_set_privileged_role?: unknown;
  effective_has_authentication_runtime?: unknown;
  effective_has_admin_directory_authority?: unknown;
  session_has_authentication_runtime?: unknown;
  session_has_admin_directory_authority?: unknown;
  session_can_set_sensitive_function_role?: unknown;
} | undefined): void {
  if (!row || typeof row.role_name !== "string" || !row.role_name.trim() || row.is_superuser !== false || row.can_create_role !== false || row.bypass_rls !== false || row.owns_unforced_rls_table !== false || typeof row.session_role_name !== "string" || !row.session_role_name.trim() || row.session_is_superuser !== false || row.session_bypass_rls !== false || row.session_can_create_role !== false || row.session_inherits_privileged_role !== false || row.session_can_set_privileged_role !== false || row.effective_has_authentication_runtime !== false || row.effective_has_admin_directory_authority !== false || row.session_has_authentication_runtime !== false || row.session_has_admin_directory_authority !== false || row.session_can_set_sensitive_function_role !== false) {
    throw new Error("POSTGRES_RUNTIME_ROLE_UNSAFE");
  }
  assertExpectedPostgresRuntimeRole(String(row.role_name || ""));
  // Only the explicitly configured hosted runtime gate requires all eight
  // tables. Generic local/dev readiness can run without migration fixtures.
  if (
    String(process.env.FAWRI_EXPECTED_POSTGRES_RUNTIME_ROLE || "").trim() &&
    row.critical_privacy_rls_ready_count !== CRITICAL_POSTGRES_PRIVACY_RLS_TABLES.length
  ) {
    throw new Error("POSTGRES_RUNTIME_PRIVACY_RLS_NOT_READY");
  }
}

export function createPostgresAuthorityReadinessCheck(): ReadinessCheck {
  return {
    name: "postgresql_authority",
    timeoutMs: 2_000,
    async check() {
      const { pool } = await import("@workspace/db");
      const result = await pool.query(`SELECT current_user AS role_name,
        r.rolsuper AS is_superuser, r.rolcreaterole AS can_create_role, r.rolbypassrls AS bypass_rls,
        session_role.rolname AS session_role_name,
        session_role.rolsuper AS session_is_superuser,
        session_role.rolbypassrls AS session_bypass_rls,
        session_role.rolcreaterole AS session_can_create_role,
        EXISTS (
          SELECT 1 FROM pg_roles privileged
          WHERE (privileged.rolsuper OR privileged.rolbypassrls OR privileged.rolcreaterole)
            AND pg_has_role(session_role.oid, privileged.oid, 'USAGE')
        ) AS session_inherits_privileged_role,
        EXISTS (
          SELECT 1 FROM pg_roles privileged
          WHERE (privileged.rolsuper OR privileged.rolbypassrls OR privileged.rolcreaterole)
            AND pg_has_role(session_role.oid, privileged.oid, 'SET')
        ) AS session_can_set_privileged_role,
        -- Trusted authentication and operator capabilities permit cross-merchant
        -- access under some RLS policies. A tenant runtime must not hold them
        -- directly, inherit them, or activate a role that can invoke them.
        COALESCE(has_function_privilege(r.oid,
          to_regprocedure('public.fawri_authentication_runtime()'), 'EXECUTE'), false)
            AS effective_has_authentication_runtime,
        COALESCE(has_function_privilege(r.oid,
          to_regprocedure('public.fawri_issue_admin_directory_audit(text,text,text)'), 'EXECUTE'), false)
            AS effective_has_admin_directory_authority,
        COALESCE(has_function_privilege(session_role.oid,
          to_regprocedure('public.fawri_authentication_runtime()'), 'EXECUTE'), false)
            AS session_has_authentication_runtime,
        COALESCE(has_function_privilege(session_role.oid,
          to_regprocedure('public.fawri_issue_admin_directory_audit(text,text,text)'), 'EXECUTE'), false)
            AS session_has_admin_directory_authority,
        EXISTS (
          SELECT 1 FROM pg_roles reachable
          WHERE pg_has_role(session_role.oid, reachable.oid, 'SET')
            AND (
              COALESCE(has_function_privilege(reachable.oid,
                to_regprocedure('public.fawri_authentication_runtime()'), 'EXECUTE'), false)
              OR COALESCE(has_function_privilege(reachable.oid,
                to_regprocedure('public.fawri_issue_admin_directory_audit(text,text,text)'), 'EXECUTE'), false)
            )
        ) AS session_can_set_sensitive_function_role,
        EXISTS (
          SELECT 1 FROM pg_class c
          JOIN pg_namespace n ON n.oid = c.relnamespace
          WHERE n.nspname = 'public'
            AND c.relkind IN ('r', 'p') AND c.relrowsecurity
            AND NOT c.relforcerowsecurity AND c.relowner = r.oid
        ) AS owns_unforced_rls_table,
        (SELECT count(*)::int FROM pg_class protected
          JOIN pg_namespace privacy_ns ON privacy_ns.oid = protected.relnamespace
          WHERE privacy_ns.nspname = 'public'
            AND protected.relkind IN ('r', 'p')
            AND protected.relname = ANY($1::text[])
            AND protected.relrowsecurity
            AND EXISTS (SELECT 1 FROM pg_policy policy WHERE policy.polrelid = protected.oid)
        ) AS critical_privacy_rls_ready_count
        FROM pg_roles r JOIN pg_roles session_role ON session_role.rolname = session_user
        WHERE r.rolname = current_user`, [Array.from(CRITICAL_POSTGRES_PRIVACY_RLS_TABLES)]);
      const row = result.rows[0] as {
        role_name?: unknown; is_superuser?: unknown; can_create_role?: unknown; critical_privacy_rls_ready_count?: unknown;
        bypass_rls?: unknown; owns_unforced_rls_table?: unknown;
        effective_has_authentication_runtime?: unknown; effective_has_admin_directory_authority?: unknown;
        session_has_authentication_runtime?: unknown; session_has_admin_directory_authority?: unknown;
        session_can_set_sensitive_function_role?: unknown;
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
