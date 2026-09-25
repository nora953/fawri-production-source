import {
  operationalDatabasePool,
  operationalQueryRows,
  type OperationalQueryTarget,
} from "./operationalPostgresAuthority";
import { productionReleaseGateRequired } from "./productionReleaseReadiness";

export const PRODUCTION_TENANT_RLS_TABLES = [
  "merchant_settings",
  "merchant_delivery_area_rates",
  "merchant_location_delivery_areas",
  "merchant_locations",
  "location_inventory_levels",
  "orders",
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
  "conversations",
  "messages",
  "saved_answers",
  "training_requests",
  "learned_answers",
  "knowledge_audit_events",
  "knowledge_embeddings",
] as const;

export type ProductionDatabaseRlsReadiness = {
  roleName: string;
  superuser: boolean;
  bypassRls: boolean;
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
  return value === true || value === 1 || value === "1" || value === "t" || value === "true";
}

function stringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((item) => String(item || "").trim()).filter(Boolean);
}

export async function getProductionDatabaseRlsReadiness(
  target?: OperationalQueryTarget,
): Promise<ProductionDatabaseRlsReadiness> {
  const queryTarget = target || (await operationalDatabasePool());
  const rows = await operationalQueryRows<{
    role_name: string;
    role_superuser: boolean;
    role_bypass_rls: boolean;
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
     table_state AS (
       SELECT
         expected.name,
         tenant_table.oid IS NOT NULL AS table_exists,
         COALESCE(tenant_table.relrowsecurity, FALSE) AS rls_enabled,
         COALESCE(
           tenant_table.relowner = (SELECT oid FROM role_state),
           FALSE
         ) AS owned_by_current_role
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
       current_user AS role_name,
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
    [Array.from(PRODUCTION_TENANT_RLS_TABLES)],
  );

  const row = rows[0];
  if (!row || !String(row.role_name || "").trim()) {
    fail(
      "PRODUCTION_DATABASE_RLS_READINESS_CHECK_FAILED",
      "production database role readiness could not be determined",
    );
  }

  return {
    roleName: String(row.role_name).trim(),
    superuser: booleanValue(row.role_superuser),
    bypassRls: booleanValue(row.role_bypass_rls),
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
      "production runtime database role must not own tenant-protected tables",
    );
  }
  if (readiness.missingOrUnprotectedTenantTables.length > 0) {
    fail(
      "PRODUCTION_DATABASE_TENANT_RLS_REQUIRED",
      "production tenant tables must exist with row-level security enabled",
    );
  }
}
