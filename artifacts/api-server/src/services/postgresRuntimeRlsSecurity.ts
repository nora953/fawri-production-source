import { assertTenantScopeSession } from "./tenantScopePostgresBoundary";
import { OPERATOR_DATABASE_CAPABILITIES } from "./operatorDirectoryPostgresAuthority";
import {
  operationalDatabasePool,
  operationalQueryRows,
  type OperationalQueryTarget,
} from "./operationalPostgresAuthority";
import { productionReleaseGateRequired } from "./productionReleaseReadiness";

export const PRODUCTION_TENANT_RLS_TABLES = [
  "audit_events", "manual_reply_requests", "notifications", "order_drafts", "processed_channel_events",
  "support_tickets", "support_messages", "support_attachments",
  "support_inspection_requests", "support_preview_sessions",
  "merchant_cashier_discount_settings", "merchant_cashier_staff_discount_policies",
  "merchant_cashier_discount_override_approvals", "cashier_operation_attribution",
  "merchant_cashier_staff", "merchant_cashier_staff_permissions", "merchant_cashier_stations",
  "cashier_station_pairing_challenges", "cashier_station_credentials", "cashier_shifts", "cashier_operator_sessions",
  "merchant_settings",
  "merchant_delivery_area_rates",
  "merchant_location_delivery_areas",
  "merchant_locations",
  "location_inventory_levels",
  "orders",
  "order_items",
  "order_payment_decisions",
  "order_payment_provider_events",
  "order_terminal_decision_links",
  "background_jobs",
  "background_job_payloads",
  "merchant_channels",
  "channel_inbound_events",
  "reply_reservations",
  "reply_refunds",
  "outbound_deliveries",
  "products",
  "product_variants",
  "catalog_variant_options",
  "catalog_identifiers",
  "catalog_image_references",
  "catalog_idempotency_keys",
  "inventory_mutations",
  "commerce_promotions",
  "subscriptions",
  "subscription_reply_batches",
  "reply_ledger",
  "saas_billing_orders",
  "saas_billing_events",
  "saas_entitlement_applications",
  "saas_billing_refunds",
  "merchant_cashier_subscriptions",
  "cashier_station_seat_assignments",
  "cashier_billing_orders",
  "cashier_billing_events",
  "cashier_entitlement_applications",
  "cashier_entitlement_audit_events",
  "cashier_device_operation_timeline",
  "conversations",
  "messages",
  "saved_answers",
  "training_requests",
  "learned_answers",
  "knowledge_audit_events",
  "knowledge_embeddings",
] as const;

// The receipt inbox has no tenant column or tenant policy. Its capability-only
// boundary still requires enabled RLS and a runtime that cannot own the table.
export const PRODUCTION_PROTECTED_RLS_TABLES = [
  ...PRODUCTION_TENANT_RLS_TABLES,
  "verified_provider_payment_receipts",
  "merchant_admin_notes", "merchant_channel_overrides", "merchant_deletion_requests",
  // No tenant column is required for these internal authentication boundaries.
  "emergency_authorizations", "emergency_access_requests",
  "emergency_owner_alerts", "emergency_merchant_notices",
] as const;

export const AUTHENTICATION_INTEGRITY_TABLES = [
  "accounts", "admin_profiles", "admin_permissions", "account_sessions", "trusted_devices",
  "auth_otp_challenges", "login_attempts", "auth_audit_events",
  "cashier_station_credentials", "cashier_station_pairing_challenges",
  "merchant_cashier_staff_permissions", "cashier_operator_sessions", "merchant_cashier_staff",
  "merchant_cashier_staff_discount_policies", "merchant_cashier_discount_override_approvals",
  "merchant_cashier_discount_settings",
] as const;
export const ADMIN_AUTHORITY_AUDIT_TABLES = ["database_admin_access_audits"] as const;

// Ordinary account identity/status reads are used by operational journeys.
// Credential material and owner recovery metadata belong to the auth LOGIN.
export const AUTHENTICATION_SENSITIVE_COLUMNS = [
  { table_name: "accounts", column_name: "password_hash" },
  { table_name: "accounts", column_name: "metadata" },
  { table_name: "account_sessions", column_name: "token_hash" },
  { table_name: "account_sessions", column_name: "device_fingerprint_hash" },
  { table_name: "auth_otp_challenges", column_name: "code_hash" },
  { table_name: "trusted_devices", column_name: "device_fingerprint_hash" },
  { table_name: "cashier_station_credentials", column_name: "token_hash" },
  { table_name: "cashier_station_pairing_challenges", column_name: "code_hash" },
  { table_name: "merchant_cashier_staff", column_name: "pin_hash" },
  { table_name: "cashier_operator_sessions", column_name: "token_hash" },
] as const;

export type ProductionDatabaseRlsReadiness = {
  nonRowPrivilegeRoles: string[];
  cashierStaffLockReady: boolean;
  cashierApprovalAuthorityReady: boolean;
  authenticationAuthorityPresent: boolean;
  authenticationMutationRoles: string[];
  authenticationSensitiveColumnsPresent: boolean;
  authenticationSensitiveReadRoles: string[];
  auditAccessRoles: string[];
  directoryIssuerPresent: boolean;
  operatorAuthorityRoles: string[];
  roleName: string;
  superuser: boolean;
  bypassRls: boolean;
  sessionRoleName: string;
  sessionSuperuser: boolean;
  sessionBypassRls: boolean;
  sessionCreateRole: boolean;
  sessionInheritedPrivilegedRoles: string[];
  sessionOwnedTables: string[];
  sessionReachablePrivilegedRoles: string[];
  // Legacy field names retained for callers; include capability-only tables.
  ownedTenantTables: string[];
  missingOrUnprotectedTenantTables: string[];
};

export class ProductionDatabaseRlsSecurityError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "ProductionDatabaseRlsSecurityError";
    this.code = code;
  }
}

function fail(code: string, message: string): never {
  throw new ProductionDatabaseRlsSecurityError(code, message);
}

function booleanValue(value: unknown): boolean {
  // node-postgres returns native booleans for these catalog expressions.
  // Missing or unparsed evidence must never become an implicit safe false.
  if (typeof value !== "boolean") {
    fail("PRODUCTION_DATABASE_RLS_READINESS_CHECK_FAILED",
      "production database role safety evidence is incomplete or invalid");
  }
  return value;
}

function stringArray(value: unknown): string[] {
  // The SQL explicitly COALESCEs inventories to text[]. An unknown inventory
  // is not proof that the session has no privileged roles or table ownership.
  if (!Array.isArray(value) || value.some((item) =>
    typeof item !== "string" || !item.trim())) {
    fail("PRODUCTION_DATABASE_RLS_READINESS_CHECK_FAILED",
      "production database privilege inventory is incomplete or invalid");
  }
  return value.map((item) => item.trim());
}

export async function getProductionDatabaseRlsReadiness(
  target?: OperationalQueryTarget,
): Promise<ProductionDatabaseRlsReadiness> {
  const queryTarget = target || (await operationalDatabasePool());
  const rows = await operationalQueryRows<{
    non_row_privilege_roles: string[];
    cashier_staff_lock_ready: boolean;
    cashier_approval_authority_ready: boolean;
    authentication_authority_present: boolean;
    authentication_mutation_roles: string[];
    authentication_sensitive_columns_present: boolean;
    authentication_sensitive_read_roles: string[];
    audit_access_roles: string[];
    directory_issuer_present: boolean;
    operator_authority_roles: string[];
    role_name: string;
    role_superuser: boolean;
    role_bypass_rls: boolean;
    session_role_name: string;
    session_role_superuser: boolean;
    session_role_bypass_rls: boolean;
    session_role_create_role: boolean;
    session_inherited_privileged_roles: string[] | null;
    session_owned_tables: string[] | null;
    session_reachable_privileged_roles: string[] | null;
    owned_tenant_tables: string[] | null;
    missing_or_unprotected_tenant_tables: string[] | null;
  }>(
    queryTarget,
    `WITH expected AS (
       SELECT unnest($1::text[]) AS name
     ),
     role_state AS (
       SELECT oid, rolsuper, rolbypassrls
         FROM pg_roles
        WHERE rolname = current_user
     ),
     session_role_state AS (
       SELECT oid, rolsuper, rolbypassrls, rolcreaterole FROM pg_roles WHERE rolname = session_user
     ),
     reachable_roles AS (
       SELECT candidate.oid,candidate.rolname FROM pg_roles candidate
       WHERE candidate.oid=(SELECT oid FROM role_state)
          OR candidate.oid=(SELECT oid FROM session_role_state)
          OR pg_has_role((SELECT oid FROM session_role_state),candidate.oid,'USAGE')
          OR pg_has_role((SELECT oid FROM session_role_state),candidate.oid,'SET')
     ),
     sensitive_column_state AS (
       SELECT c.oid AS table_oid, a.attnum
       FROM jsonb_to_recordset($5::jsonb) AS expected_column(table_name text, column_name text)
       LEFT JOIN pg_namespace n ON n.nspname='public'
       LEFT JOIN pg_class c ON c.relnamespace=n.oid
         AND c.relname=expected_column.table_name AND c.relkind IN ('r','p')
       LEFT JOIN pg_attribute a ON a.attrelid=c.oid
         AND a.attname=expected_column.column_name AND a.attnum>0 AND NOT a.attisdropped
     ),
     table_state AS (
       SELECT
         expected.name,
         tenant_table.oid IS NOT NULL AS table_exists,
         COALESCE(tenant_table.relrowsecurity, FALSE) AS rls_enabled,
         COALESCE(
           -- Ownership can be inherited or reached through SET ROLE even
           -- when the runtime role is not the table's recorded owner.
           pg_has_role((SELECT oid FROM role_state), tenant_table.relowner, 'USAGE')
           OR pg_has_role((SELECT oid FROM role_state), tenant_table.relowner, 'SET'),
           FALSE
         ) AS owned_by_current_role,
         COALESCE(
           pg_has_role((SELECT oid FROM session_role_state), tenant_table.relowner, 'USAGE')
           OR pg_has_role((SELECT oid FROM session_role_state), tenant_table.relowner, 'SET'),
           FALSE
         ) AS owned_by_session_role
       FROM expected
       LEFT JOIN (
         SELECT c.oid, c.relname, c.relrowsecurity, c.relowner
           FROM pg_class c
           JOIN pg_namespace n ON n.oid = c.relnamespace
          WHERE n.nspname = 'public'
            AND c.relkind IN ('r', 'p')
       ) AS tenant_table
         ON tenant_table.relname = expected.name
     )
     SELECT
       public.fawri_tenant_or_audited_admin('__fawri_readiness_probe__') AS rls_predicate_probe,
       -- RLS mediates row DML, not these table/constraint/trigger authorities.
       -- Include PUBLIC-effective, inherited and activatable role privileges.
       COALESCE((SELECT array_agg(r.rolname::text ORDER BY r.rolname) FROM reachable_roles r
         WHERE EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
           WHERE n.nspname='public' AND c.relname=ANY($1::text[]) AND c.relkind IN ('r','p')
             AND (has_table_privilege(r.oid,c.oid,'TRUNCATE,TRIGGER,REFERENCES')
               OR has_any_column_privilege(r.oid,c.oid,'REFERENCES')))),
         ARRAY[]::text[]) AS non_row_privilege_roles,
       EXISTS (SELECT 1 FROM pg_proc lock_function
         WHERE lock_function.oid=to_regprocedure('public.fawri_lock_cashier_approver(text,text)')
           AND lock_function.prosecdef AND lock_function.provolatile='v'
           AND lock_function.proconfig @> ARRAY['search_path=pg_catalog']::text[]
           AND has_function_privilege(current_user,lock_function.oid,'EXECUTE')
           AND NOT EXISTS (SELECT 1 FROM reachable_roles r
             WHERE pg_has_role(r.oid,lock_function.proowner,'USAGE')
                OR pg_has_role(r.oid,lock_function.proowner,'SET'))
       ) AS cashier_staff_lock_ready,
       NOT EXISTS (SELECT 1 FROM unnest(ARRAY[
         'public.fawri_lock_cashier_discount_setting(text)',
         'public.fawri_lock_cashier_discount_approval(text,text,text)',
         'public.fawri_consume_cashier_discount_approval(text,text,text,text,text,bigint,text,timestamp with time zone,bigint,text)',
         'public.fawri_invalidate_pending_cashier_discount_approvals(text)'
       ]::text[]) expected(signature)
         LEFT JOIN pg_proc fn ON fn.oid=to_regprocedure(expected.signature)
         WHERE fn.oid IS NULL OR NOT fn.prosecdef OR fn.provolatile<>'v'
           OR fn.proisstrict IS NOT TRUE
           OR NOT coalesce(fn.proconfig @> ARRAY['search_path=pg_catalog']::text[],false)
           OR NOT has_function_privilege(current_user,fn.oid,'EXECUTE')
           OR EXISTS (SELECT 1 FROM reachable_roles r WHERE pg_has_role(r.oid,fn.proowner,'USAGE') OR pg_has_role(r.oid,fn.proowner,'SET'))
       ) AS cashier_approval_authority_ready,
       to_regprocedure('public.fawri_authentication_runtime()') IS NOT NULL AS authentication_authority_present,
       COALESCE((SELECT array_agg(r.rolname::text ORDER BY r.rolname) FROM reachable_roles r
         WHERE EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
           WHERE n.nspname='public' AND c.relname=ANY($3::text[]) AND c.relkind IN ('r','p')
             AND (has_table_privilege(r.oid,c.oid,'INSERT,UPDATE,DELETE,TRUNCATE,TRIGGER,REFERENCES')
               OR has_any_column_privilege(r.oid,c.oid,'INSERT,UPDATE,REFERENCES')))),
         ARRAY[]::text[]) AS authentication_mutation_roles,
       (SELECT count(*) = jsonb_array_length($5::jsonb)
          AND bool_and(table_oid IS NOT NULL AND attnum IS NOT NULL)
          FROM sensitive_column_state) AS authentication_sensitive_columns_present,
       COALESCE((SELECT array_agg(r.rolname::text ORDER BY r.rolname) FROM reachable_roles r
         WHERE EXISTS (SELECT 1 FROM sensitive_column_state c
           WHERE c.table_oid IS NOT NULL AND c.attnum IS NOT NULL
             AND has_column_privilege(r.oid,c.table_oid,c.attnum,'SELECT'))),
         ARRAY[]::text[]) AS authentication_sensitive_read_roles,
       COALESCE((SELECT array_agg(r.rolname::text ORDER BY r.rolname) FROM reachable_roles r
         WHERE EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
           WHERE n.nspname='public' AND c.relname=ANY($4::text[]) AND c.relkind IN ('r','p')
             AND (has_table_privilege(r.oid,c.oid,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,TRIGGER,REFERENCES')
               OR has_any_column_privilege(r.oid,c.oid,'SELECT,INSERT,UPDATE,REFERENCES')))),
         ARRAY[]::text[]) AS audit_access_roles,
       to_regprocedure('public.fawri_issue_admin_directory_audit(text,text,text)') IS NOT NULL AS directory_issuer_present,
       COALESCE((SELECT array_agg(candidate_operator.rolname::text ORDER BY candidate_operator.rolname)
         FROM pg_roles candidate_operator
         WHERE (candidate_operator.oid = (SELECT oid FROM role_state)
             OR candidate_operator.oid = (SELECT oid FROM session_role_state)
             OR pg_has_role((SELECT oid FROM session_role_state), candidate_operator.oid, 'USAGE')
             OR pg_has_role((SELECT oid FROM session_role_state), candidate_operator.oid, 'SET'))
           AND EXISTS (SELECT 1 FROM unnest($2::text[]) AS capability(signature)
             WHERE has_function_privilege(candidate_operator.oid,
               to_regprocedure(capability.signature)::oid, 'EXECUTE'))),
         ARRAY[]::text[]) AS operator_authority_roles,
       COALESCE((SELECT array_agg(privileged.rolname::text ORDER BY privileged.rolname)
         FROM pg_roles privileged
         WHERE (privileged.rolsuper OR privileged.rolbypassrls)
           AND pg_has_role((SELECT oid FROM session_role_state), privileged.oid, 'SET')),
         ARRAY[]::text[]) AS session_reachable_privileged_roles,
       COALESCE((SELECT array_agg(privileged.rolname::text ORDER BY privileged.rolname)
         FROM pg_roles privileged
         WHERE (privileged.rolsuper OR privileged.rolbypassrls)
           AND pg_has_role((SELECT oid FROM session_role_state), privileged.oid, 'USAGE')),
         ARRAY[]::text[]) AS session_inherited_privileged_roles,
       current_user AS role_name,
       session_user AS session_role_name,
       COALESCE((SELECT rolcreaterole FROM session_role_state), TRUE) AS session_role_create_role,
       COALESCE((SELECT rolsuper FROM session_role_state), TRUE) AS session_role_superuser,
       COALESCE((SELECT rolbypassrls FROM session_role_state), TRUE) AS session_role_bypass_rls,
       COALESCE((SELECT array_agg(name ORDER BY name) FROM table_state
         WHERE owned_by_session_role), ARRAY[]::text[]) AS session_owned_tables,
       COALESCE((SELECT rolsuper FROM role_state), TRUE) AS role_superuser,
       COALESCE((SELECT rolbypassrls FROM role_state), TRUE) AS role_bypass_rls,
       COALESCE(
         (SELECT array_agg(name ORDER BY name)
            FROM table_state
           WHERE owned_by_current_role),
         ARRAY[]::text[]
       ) AS owned_tenant_tables,
       COALESCE(
         (SELECT array_agg(name ORDER BY name)
            FROM table_state
           WHERE NOT table_exists OR NOT rls_enabled),
         ARRAY[]::text[]
       ) AS missing_or_unprotected_tenant_tables`,
    [Array.from(PRODUCTION_PROTECTED_RLS_TABLES), Object.values(OPERATOR_DATABASE_CAPABILITIES), Array.from(AUTHENTICATION_INTEGRITY_TABLES), Array.from(ADMIN_AUTHORITY_AUDIT_TABLES), JSON.stringify(AUTHENTICATION_SENSITIVE_COLUMNS)],
  );

  const row = rows[0];
  if (!row || !String(row.role_name || "").trim() || !String(row.session_role_name || "").trim()) {
    fail(
      "PRODUCTION_DATABASE_RLS_READINESS_CHECK_FAILED",
      "production database role readiness could not be determined",
    );
  }

  return {
    nonRowPrivilegeRoles: stringArray(row.non_row_privilege_roles),
    cashierStaffLockReady: booleanValue(row.cashier_staff_lock_ready),
    cashierApprovalAuthorityReady: booleanValue(row.cashier_approval_authority_ready),
    authenticationAuthorityPresent: booleanValue(row.authentication_authority_present),
    authenticationMutationRoles: stringArray(row.authentication_mutation_roles),
    authenticationSensitiveColumnsPresent: booleanValue(row.authentication_sensitive_columns_present),
    authenticationSensitiveReadRoles: stringArray(row.authentication_sensitive_read_roles),
    auditAccessRoles: stringArray(row.audit_access_roles),
    directoryIssuerPresent: booleanValue(row.directory_issuer_present),
    operatorAuthorityRoles: stringArray(row.operator_authority_roles),
    roleName: String(row.role_name).trim(),
    superuser: booleanValue(row.role_superuser),
    bypassRls: booleanValue(row.role_bypass_rls),
    sessionRoleName: String(row.session_role_name).trim(),
    sessionSuperuser: booleanValue(row.session_role_superuser),
    sessionBypassRls: booleanValue(row.session_role_bypass_rls),
    sessionCreateRole: booleanValue(row.session_role_create_role),
    sessionInheritedPrivilegedRoles: stringArray(row.session_inherited_privileged_roles),
    sessionOwnedTables: stringArray(row.session_owned_tables),
    sessionReachablePrivilegedRoles: stringArray(row.session_reachable_privileged_roles),
    ownedTenantTables: stringArray(row.owned_tenant_tables),
    missingOrUnprotectedTenantTables: stringArray(
      row.missing_or_unprotected_tenant_tables,
    ),
  };
}

export async function assertProductionDatabaseRlsReady(
  env: NodeJS.ProcessEnv = process.env,
  target?: OperationalQueryTarget,
): Promise<void> {
  if (!productionReleaseGateRequired(env)) return;

  if (
    String(env.FAWRI_OPERATIONAL_POSTGRES_AUTHORITY || "").trim() !== "required"
  ) {
    fail(
      "PRODUCTION_DATABASE_RLS_POSTGRES_AUTHORITY_REQUIRED",
      "production database RLS readiness requires PostgreSQL authority",
    );
  }

  let readiness: ProductionDatabaseRlsReadiness;
  try {
    readiness = await getProductionDatabaseRlsReadiness(target);
  } catch (error) {
    if (error instanceof ProductionDatabaseRlsSecurityError) throw error;
    fail(
      "PRODUCTION_DATABASE_RLS_READINESS_CHECK_FAILED",
      "production database RLS readiness check failed",
    );
  }

  if (readiness.superuser) {
    fail(
      "PRODUCTION_DATABASE_RUNTIME_SUPERUSER_FORBIDDEN",
      "production runtime database role must not be a superuser",
    );
  }
  if (readiness.bypassRls) {
    fail(
      "PRODUCTION_DATABASE_RUNTIME_BYPASSRLS_FORBIDDEN",
      "production runtime database role must not bypass row-level security",
    );
  }
  if (readiness.ownedTenantTables.length > 0) {
    fail(
      "PRODUCTION_DATABASE_RUNTIME_TABLE_OWNER_FORBIDDEN",
      "production runtime database role must not own RLS-protected tables",
    );
  }
  // RESET ROLE can restore the authenticated account's privileges. A restricted
  // current_user alone cannot certify a privileged connection as safe.
  if (readiness.sessionSuperuser) {
    fail("PRODUCTION_DATABASE_SESSION_SUPERUSER_FORBIDDEN",
      "production authenticated database role must not be a superuser");
  }
  if (readiness.sessionBypassRls) {
    fail("PRODUCTION_DATABASE_SESSION_BYPASSRLS_FORBIDDEN",
      "production authenticated database role must not bypass row-level security");
  }
  if (readiness.sessionCreateRole) {
    fail("PRODUCTION_DATABASE_SESSION_CREATEROLE_FORBIDDEN",
      "production authenticated database role must not create or alter roles");
  }
  if (readiness.sessionReachablePrivilegedRoles.length > 0) {
    fail("PRODUCTION_DATABASE_PRIVILEGED_ROLE_REACHABLE",
      "production authenticated database role must not activate privileged roles");
  }
  if (readiness.sessionInheritedPrivilegedRoles.length > 0) {
    fail("PRODUCTION_DATABASE_INHERITED_PRIVILEGED_ROLE_FORBIDDEN",
      "production authenticated database role must not inherit privileged roles");
  }
  if (readiness.sessionOwnedTables.length > 0) {
    fail("PRODUCTION_DATABASE_SESSION_TABLE_OWNER_FORBIDDEN",
      "production authenticated database role must not own RLS-protected tables");
  }
  if (readiness.missingOrUnprotectedTenantTables.length > 0) {
    fail(
      "PRODUCTION_DATABASE_TENANT_RLS_REQUIRED",
      "production protected tables must exist with row-level security enabled",
    );
  }
  if (!readiness.directoryIssuerPresent) {
    fail("PRODUCTION_DATABASE_OPERATOR_ISSUER_REQUIRED",
      "production database requires the role-bound directory issuer migration");
  }
  if (readiness.operatorAuthorityRoles.length > 0) {
    fail("PRODUCTION_DATABASE_OPERATOR_AUTHORITY_REACHABLE",
      "tenant runtime must not reach privileged operator database capabilities");
  }
  if (!readiness.cashierApprovalAuthorityReady) fail("PRODUCTION_CASHIER_APPROVAL_AUTHORITY_REQUIRED", "production requires protected cashier approval mutation capabilities");
  if (!readiness.cashierStaffLockReady) fail("PRODUCTION_CASHIER_STAFF_LOCK_REQUIRED", "production requires the protected cashier approver lock function");
  if (!readiness.authenticationAuthorityPresent) fail("PRODUCTION_AUTH_DATABASE_MIGRATION_REQUIRED", "production requires role-bound authentication migration");
  if (readiness.authenticationMutationRoles.length) fail("PRODUCTION_AUTH_MUTATION_AUTHORITY_REACHABLE", "tenant runtime must not reach authentication mutation privileges");
  if (readiness.nonRowPrivilegeRoles.length > 0) {
    fail("PRODUCTION_DATABASE_NONROW_PRIVILEGE_REACHABLE",
      "tenant runtime must not reach protected table truncate, trigger or reference privileges");
  }
  if (!readiness.authenticationSensitiveColumnsPresent) fail("PRODUCTION_AUTH_SENSITIVE_COLUMNS_REQUIRED", "production authentication sensitive columns must exist");
  if (readiness.authenticationSensitiveReadRoles.length) fail("PRODUCTION_AUTH_SENSITIVE_READ_AUTHORITY_REACHABLE", "tenant runtime must not read authentication credential material");
  if (readiness.auditAccessRoles.length) fail("PRODUCTION_ADMIN_AUDIT_ACCESS_REACHABLE", "tenant runtime must not directly access authority audit records");
  try {
    const url = new URL(String(env.FAWRI_AUTH_DATABASE_URL || "").trim());
    if (!["postgres:", "postgresql:"].includes(url.protocol)) throw new Error();
  } catch { fail("PRODUCTION_AUTH_DATABASE_REQUIRED", "production authentication requires a separately authenticated database pool"); }
  try {
    const url = new URL(String(env.FAWRI_OPERATOR_DATABASE_URL || "").trim());
    if (!["postgres:", "postgresql:"].includes(url.protocol)) throw new Error();
  } catch {
    fail("PRODUCTION_OPERATOR_DATABASE_REQUIRED",
      "production directory requires a separately authenticated operator database pool");
  }
  try {
    await assertTenantScopeSession(target || await operationalDatabasePool(), false);
  } catch {
    fail("PRODUCTION_TENANT_SCOPE_ROLE_UNSAFE",
      "tenant runtime must have complete private scope objects without private authority privileges");
  }

}
