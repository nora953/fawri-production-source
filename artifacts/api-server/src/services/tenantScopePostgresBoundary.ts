import type { OperationalQueryTarget } from "./operationalPostgresAuthority";
import { OperationalPostgresAuthorityError } from "./operationalPostgresAuthority";

// Catalog OIDs allow tenant admission without private-schema USAGE. Inspect
// both inherited and SET-reachable roles; NOINHERIT alone is not a boundary.
export async function assertTenantScopeSession(
  client: OperationalQueryTarget,
  issuer: boolean,
): Promise<void> {
  const result = await client.query<{ present: boolean; safe: boolean }>(`
    WITH principal AS (
      SELECT oid,rolcanlogin,rolsuper,rolbypassrls,rolcreaterole
      FROM pg_roles WHERE rolname=session_user
    ), reachable AS (
      SELECT r.oid FROM pg_roles r
      WHERE r.oid=(SELECT oid FROM principal)
        OR pg_has_role((SELECT oid FROM principal),r.oid,'USAGE')
        OR pg_has_role((SELECT oid FROM principal),r.oid,'SET')
    ), private_schema AS (
      SELECT oid,nspowner FROM pg_namespace WHERE nspname='fawri_security'
    ), scope_table AS (
      SELECT c.oid,c.relowner FROM pg_class c
      WHERE c.relnamespace=(SELECT oid FROM private_schema)
        AND c.relname='transaction_scopes' AND c.relkind='r'
    ), scope_issuer AS (
      SELECT p.oid FROM pg_proc p
      WHERE p.pronamespace=(SELECT oid FROM private_schema)
        AND p.proname='issue_scope' AND p.proargtypes='19 23 20 25'::oidvector
    ), scope_predicate AS (
      SELECT p.oid FROM pg_proc p
      WHERE p.pronamespace=(SELECT oid FROM private_schema)
        AND p.proname='allows_merchant' AND p.proargtypes='25'::oidvector
    )
    SELECT
      (EXISTS(SELECT 1 FROM scope_table)
        AND EXISTS(SELECT 1 FROM scope_issuer)
        AND EXISTS(SELECT 1 FROM scope_predicate)) AS present,
      (session_user=current_user
        AND EXISTS(SELECT 1 FROM principal WHERE rolcanlogin
          AND NOT(rolsuper OR rolbypassrls OR rolcreaterole))
        AND NOT EXISTS(SELECT 1 FROM reachable r JOIN pg_roles p ON p.oid=r.oid
          WHERE p.rolsuper OR p.rolbypassrls OR p.rolcreaterole)
        AND NOT EXISTS(SELECT 1 FROM reachable r CROSS JOIN private_schema n
          WHERE has_schema_privilege(r.oid,n.oid,'CREATE')
            OR pg_has_role(r.oid,n.nspowner,'USAGE') OR pg_has_role(r.oid,n.nspowner,'SET'))
        AND NOT EXISTS(SELECT 1 FROM reachable r CROSS JOIN scope_table c
          WHERE has_table_privilege(r.oid,c.oid,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,TRIGGER,REFERENCES')
            OR has_any_column_privilege(r.oid,c.oid,'SELECT,INSERT,UPDATE,REFERENCES')
            OR pg_has_role(r.oid,c.relowner,'USAGE') OR pg_has_role(r.oid,c.relowner,'SET'))
        AND NOT EXISTS(SELECT 1 FROM reachable r JOIN pg_proc p
          ON p.pronamespace=(SELECT oid FROM private_schema)
          WHERE pg_has_role(r.oid,p.proowner,'USAGE') OR pg_has_role(r.oid,p.proowner,'SET'))
        AND ($1::boolean OR NOT EXISTS(SELECT 1 FROM reachable r CROSS JOIN scope_issuer p
          WHERE has_function_privilege(r.oid,p.oid,'EXECUTE')))
        AND (NOT $1::boolean OR has_function_privilege(session_user,
          (SELECT oid FROM scope_issuer),'EXECUTE'))
      ) AS safe`, [issuer]);
  const row = result.rows[0];
  if (row?.present !== true || row.safe !== true) {
    throw new OperationalPostgresAuthorityError(
      "OPERATIONAL_TENANT_SCOPE_ROLE_UNSAFE",
      "merchant scope database authority is unavailable",
    );
  }
}
