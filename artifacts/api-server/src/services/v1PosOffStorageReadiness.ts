/**
 * Approved V1 product scope: POS/offline cashier is NOT offered. The held
 * 0052 INVOKER cashier-writer membership check is deliberately incompatible
 * with the restricted V1 authentication role and must not gate V1 startup.
 *
 * This is an independent SELECT-only catalog admission, NEVER a deployment
 * action, migration, role provisioning or permission to delete POS history.
 * The original cashier storage readiness remains required for non-V1 modes.
 */
import type { OperationalQueryTarget } from "./operationalPostgresAuthority";

export interface V1PosOffRoles {
  readonly primaryRole: string;
  readonly authenticationRole: string;
  readonly operatorRole: string;
}

function fail(): never {
  throw new Error("V1_POS_OFF_HISTORICAL_FINANCIAL_STORAGE_NOT_PROVEN");
}

export async function assertV1PosOffStorageReady(
  client: OperationalQueryTarget,
  roles: V1PosOffRoles,
): Promise<void> {
  // Do NOT accept merely three caller-supplied role labels. The caller must
  // obtain each identity from its own authenticated PostgreSQL session.
  if (roles.primaryRole !== "fawri_restricted_runtime" ||
      roles.authenticationRole !== "fawri_auth_issuer" ||
      roles.operatorRole !== "fawri_operator_issuer" ||
      new Set(Object.values(roles)).size !== 3) fail();

  const response = await client.query<{
    database_ok: boolean;
    caller_ok: boolean;
    roles_restricted: boolean;
    no_app_role_memberships: boolean;
    retirement_writer_dormant: boolean;
    financial_tables_rls: boolean;
    no_cashier_app_grants: boolean;
    historic_guards_preserved: boolean;
    pos_off_delete_trigger: boolean;
    pos_off_guard_owner_and_acl: boolean;
  }>(`
    WITH required_roles AS (
      SELECT rolname, oid, rolcanlogin, rolinherit, rolsuper,
             rolbypassrls, rolcreaterole, rolcreatedb, rolreplication
        FROM pg_catalog.pg_roles
       WHERE rolname = ANY($1::text[])
    ),
    historical_tables AS (
      SELECT count(*)::int AS protected_count
        FROM pg_catalog.pg_class c
        JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
       WHERE n.nspname='public'
         AND c.relname IN ('cashier_device_streams','cashier_operation_receipts')
         AND c.relkind IN ('r','p')
         AND c.relrowsecurity
         AND c.relowner=(SELECT oid FROM pg_catalog.pg_roles
                          WHERE rolname='fawri_owner')
    ),
    old_guard_triggers AS (
      SELECT count(*)::int AS guard_count
        FROM pg_catalog.pg_trigger t
        JOIN pg_catalog.pg_proc p ON p.oid=t.tgfoid
       WHERE NOT t.tgisinternal AND t.tgenabled='O'
         AND (
           (t.tgname='cashier_device_streams_guard'
             AND p.proname='fawri_sequence_stream_guard')
           OR (t.tgname='cashier_operation_receipts_guard'
             AND p.proname='fawri_sequence_receipt_guard')
           OR (t.tgname='cashier_operation_receipts_commit_guard'
             AND p.proname='fawri_sequence_receipt_commit_guard')
         )
    ),
    pos_trigger AS (
      SELECT count(*)::int AS trigger_count
        FROM pg_catalog.pg_trigger t
       WHERE NOT t.tgisinternal AND t.tgenabled='O'
         AND t.tgname='cashier_device_streams_merchant_deleted'
         AND t.tgrelid=to_regclass('public.merchants')
         AND t.tgfoid=to_regprocedure(
           'public.fawri_v1_pos_off_merchant_deleted()')
    ),
    guard_source AS (
      SELECT p.prosecdef,
             p.proowner=(SELECT oid FROM pg_catalog.pg_roles
                          WHERE rolname='fawri_owner') AS is_owned_by_owner,
             'search_path=pg_catalog'=ANY(p.proconfig) AS search_path_fixed,
             'row_security=off'=ANY(p.proconfig) AS sees_retired_history,
             EXISTS(
               SELECT 1 FROM pg_catalog.aclexplode(
                 COALESCE(p.proacl,pg_catalog.acldefault('f',p.proowner))) acl
               WHERE acl.grantee=0 AND acl.privilege_type='EXECUTE'
             ) AS public_can_execute
        FROM pg_catalog.pg_proc p
       WHERE p.oid=to_regprocedure(
           'public.fawri_v1_pos_off_merchant_deleted()')
    )
    SELECT
      current_database()='fawri'
        AND current_setting('server_version_num')::int/10000=18
           AS database_ok,
      session_user=$2 AND current_user=$2 AS caller_ok,
      (SELECT count(*)=3 AND bool_and(
         rolcanlogin AND NOT (
           rolinherit OR rolsuper OR rolbypassrls OR rolcreaterole
           OR rolcreatedb OR rolreplication))
       FROM required_roles) AS roles_restricted,
      NOT EXISTS(
        SELECT 1 FROM pg_catalog.pg_auth_members m
         WHERE m.member IN (SELECT oid FROM required_roles)
      ) AS no_app_role_memberships,
      EXISTS(
        SELECT 1 FROM pg_catalog.pg_roles r
         WHERE r.rolname='fawri_cashier_retirement_writer'
           AND NOT (r.rolcanlogin OR r.rolinherit OR r.rolsuper
             OR r.rolbypassrls OR r.rolcreaterole OR r.rolcreatedb
             OR r.rolreplication)
      ) AS retirement_writer_dormant,
      (SELECT protected_count=2 FROM historical_tables) AS financial_tables_rls,
      NOT EXISTS (
        SELECT 1 FROM required_roles r WHERE
          pg_catalog.has_table_privilege(r.oid,
            'public.cashier_device_streams',
            'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,TRIGGER,REFERENCES')
          OR pg_catalog.has_table_privilege(r.oid,
            'public.cashier_operation_receipts',
            'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,TRIGGER,REFERENCES')
      ) AS no_cashier_app_grants,
      (SELECT guard_count=3 FROM old_guard_triggers) AS historic_guards_preserved,
      (SELECT trigger_count=1 FROM pos_trigger) AS pos_off_delete_trigger,
      COALESCE(
        (SELECT prosecdef AND is_owned_by_owner AND search_path_fixed
                AND sees_retired_history AND NOT public_can_execute
           FROM guard_source),FALSE
      ) AS pos_off_guard_owner_and_acl
  `, [
    [roles.primaryRole, roles.authenticationRole, roles.operatorRole],
    roles.primaryRole,
  ]);

  if (response.rows.length !== 1) fail();
  const state = response.rows[0];
  if (!state || Object.values(state).some(value => value !== true)) fail();
}
