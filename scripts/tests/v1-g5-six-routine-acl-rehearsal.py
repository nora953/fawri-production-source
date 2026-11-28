"""Detached synthetic preview of the G5 six-routine ACL change.

Run from the checkout as an unprivileged OS user:
    python3 scripts/tests/v1-g5-six-routine-acl-rehearsal.py /path/to/pg18
The argument is a PostgreSQL 18 prefix containing bin/initdb and bin/pg_ctl.
Requires local libpq. Uses fresh SCRAM credentials and loopback only.
"""
import ctypes as c
import hashlib
from pathlib import Path
import re
import secrets
import socket
import subprocess
import sys
from tempfile import TemporaryDirectory

repo = Path(__file__).resolve().parents[2]
native = Path(sys.argv[1]).resolve()
lib = c.CDLL("libpq.so.5")
P, S, I = c.c_void_p, c.c_char_p, c.c_int
for name, restype, args in [
    ("PQconnectdb", P, [S]), ("PQstatus", I, [P]), ("PQerrorMessage", S, [P]),
    ("PQfinish", None, [P]), ("PQexec", P, [P, S]), ("PQresultStatus", I, [P]),
    ("PQresultErrorField", S, [P, I]), ("PQresultErrorMessage", S, [P]),
    ("PQgetvalue", S, [P, I, I]), ("PQntuples", I, [P]), ("PQnfields", I, [P]),
    ("PQclear", None, [P]), ("PQgetCopyData", I, [P, c.POINTER(P), I]),
    ("PQfreemem", None, [P]), ("PQgetResult", P, [P]),
]:
    method = getattr(lib, name)
    method.restype, method.argtypes = restype, args

TENANT = "fawri_restricted_runtime"
AUTH = "fawri_auth_issuer"
OP = "fawri_operator_issuer"
READER = "fawri_v1_recurring_backup_reader"
RETIRE = "fawri_cashier_retirement_writer"
OWNER = "fawri_owner"
BOOTSTRAP = "g5_acl_bootstrap"
SIG = (
    "fawri_tenant_or_audited_admin(text)",
    "fawri_lock_cashier_approver(text,text)",
    "fawri_lock_cashier_discount_approval(text,text,text)",
    "fawri_consume_cashier_discount_approval(text,text,text,text,text,bigint,text,timestamptz,bigint,text)",
    "fawri_lock_cashier_discount_setting(text)",
    "fawri_invalidate_pending_cashier_discount_approvals(text)",
)
FILES = {
    "0038_role_bound_admin_directory_issuer.sql": "1ab287e78d7c61e721860e8591fae1b40b8adf64",
    "0039_role_bound_authentication_runtime.sql": "3275129afee9ba454ba1e69ea619f538a94e1c14",
    "0040_transaction_scoped_tenant_authority.sql": "718330bb9b1ac592e0f2f835be2062c11f0dbffe",
    "0041_private_tenant_predicate_cutover.sql": "ad9c6ad522a32268aeb6f585829f270c451fb2c2",
    "0042_scoped_cashier_approver_lock.sql": "23a5ac80f7869c640f191845739e0554d38faee1",
    "0045_scoped_cashier_approval_mutations.sql": "54259d4871bc1e680f655c6ce87e488c4931980c",
    "0046_cashier_settings_authentication_authority.sql": "c85a7cc2d674af5e4e1e5adf0530fc9df7c10efc",
}

def pinned(relative, expected):
    data = (repo / relative).read_bytes()
    assert hashlib.sha1(f"blob {len(data)}\0".encode() + data).hexdigest() == expected
    return data.decode()

def literal(s):
    return "'" + s.replace("'", "''") + "'"

class SqlError(Exception):
    pass

class Session:
    def __init__(self, port, role, key, db="fawri"):
        self.conn = lib.PQconnectdb(
            f"host=127.0.0.1 hostaddr=127.0.0.1 port={port} dbname={db} user={role} password={key} connect_timeout=4 sslmode=disable gssencmode=disable".encode())
        if lib.PQstatus(self.conn):
            lib.PQfinish(self.conn)
            raise SqlError("LOGIN_FAILED", role)

    def close(self):
        lib.PQfinish(self.conn)

    def sql(self, sql):
        result = lib.PQexec(self.conn, sql.encode())
        try:
            status = lib.PQresultStatus(result)
            if status == 3:  # COPY TO STDOUT
                out = bytearray()
                while True:
                    pointer = P()
                    count = lib.PQgetCopyData(self.conn, c.byref(pointer), 0)
                    if count == -1:
                        break
                    assert count > 0
                    out.extend(c.string_at(pointer, count))
                    lib.PQfreemem(pointer)
                final = lib.PQgetResult(self.conn)
                try:
                    assert lib.PQresultStatus(final) == 1
                finally:
                    lib.PQclear(final)
                assert not lib.PQgetResult(self.conn)
                return bytes(out)
            if status not in (1, 2):
                raise SqlError(lib.PQresultErrorField(result, ord("C")), lib.PQresultErrorMessage(result))
            return [tuple(lib.PQgetvalue(result, row, col).decode()
                          for col in range(lib.PQnfields(result))) for row in range(lib.PQntuples(result))]
        finally:
            lib.PQclear(result)

def rejected(session, sql, state=b"42501"):
    try:
        session.sql(sql)
    except SqlError as exc:
        assert exc.args[0] == state, exc
    else:
        raise AssertionError("Expected SQL denial")

def scalar(session, sql):
    [(value,)] = session.sql(sql)
    return value

def run_cluster(native, root):
    with socket.socket() as reservation:
        reservation.bind(("127.0.0.1", 0))
        port = reservation.getsockname()[1]
    data = root / "db"
    keys = {r: secrets.token_hex(24) for r in (BOOTSTRAP, OWNER, TENANT, AUTH, OP, READER)}
    key_file = root / "bootstrap.pw"
    key_file.write_text(keys[BOOTSTRAP] + "\n")
    key_file.chmod(0o600)
    def pg(tool, *args):
        subprocess.run([str(native / "bin" / tool), *map(str, args)], check=True, timeout=30,
                       env={"PATH": "/usr/bin:/bin", "HOME": str(root), "LANG": "C.UTF-8"},
                       stdout=subprocess.DEVNULL)
    pg("initdb", "-D", data, "-U", BOOTSTRAP, "--pwfile", key_file,
       "--auth-local=reject", "--auth-host=scram-sha-256", "--no-locale", "--encoding=UTF8")
    key_file.unlink()
    try:
        pg("pg_ctl", "-D", data, "-l", root / "postgres.log", "-o",
           f"-c listen_addresses=127.0.0.1 -c unix_socket_directories='' -p {port}", "-w", "start")
    except subprocess.CalledProcessError:
        print((root / "postgres.log").read_text()[-2500:])
        raise
    sessions = []
    def connect(role, db="fawri"):
        session = Session(port, role, keys[role], db)
        sessions.append(session)
        assert session.sql("SELECT session_user,current_user") == [(role, role)]
        return session
    try:
        control = connect(BOOTSTRAP, "postgres")
        for role, attrs in [(OWNER, "INHERIT BYPASSRLS"), (TENANT, "NOINHERIT NOBYPASSRLS"),
                            (AUTH, "NOINHERIT NOBYPASSRLS"), (OP, "NOINHERIT NOBYPASSRLS"),
                            (READER, "NOINHERIT BYPASSRLS CONNECTION LIMIT 1")]:
            control.sql(f"CREATE ROLE {role} LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION {attrs} PASSWORD {literal(keys[role])}")
        control.sql(f"CREATE ROLE {RETIRE} NOLOGIN NOINHERIT")
        control.sql(f"GRANT pg_read_all_stats TO {OWNER}")
        control.sql(f"CREATE DATABASE fawri OWNER {OWNER}")
        control.sql(f"ALTER ROLE {READER} IN DATABASE fawri SET default_transaction_read_only=on")
        owner = connect(OWNER)
        assert scalar(owner, "SELECT current_setting('listen_addresses')='127.0.0.1' AND inet_server_addr()='127.0.0.1'::inet AND inet_client_addr()='127.0.0.1'::inet") == "t"
        version = scalar(owner, "SHOW server_version")
        assert version.startswith("18.")
        print(f"G5_ISOLATED_PG{version}_LOOPBACK_ONLY")

        owner.sql("""
CREATE TABLE accounts(id text PRIMARY KEY, kind text, state text);
CREATE TABLE admin_profiles(account_id text PRIMARY KEY,role text,enabled boolean,must_change_password boolean);
CREATE TABLE admin_permissions(admin_id text, permission text);
CREATE TABLE merchants(id text PRIMARY KEY);
CREATE TABLE database_admin_access_audits(
 id text PRIMARY KEY, admin_account_id text, reason_code text, request_hash text,
 expires_at timestamptz, merchant_id text, authority_transaction_id bigint DEFAULT txid_current(),
 started_at timestamptz DEFAULT clock_timestamp());
CREATE TABLE products(id int PRIMARY KEY,merchant_id text);
CREATE TABLE orders(id int PRIMARY KEY,merchant_id text);
CREATE SEQUENCE fixture_seq;
CREATE TABLE merchant_cashier_staff(id text,merchant_id text,display_name text,role text,status text,revoked_at timestamptz);
CREATE TABLE merchant_cashier_discount_settings(merchant_id text PRIMARY KEY,discount_kind text,version bigint);
CREATE TABLE merchant_cashier_discount_override_approvals(
 id text,merchant_id text,station_id text,operator_staff_id text,approver_staff_id text,operation_id text,
 manual_discount_minor bigint,manual_discount_reason text,expires_at timestamptz,consumed_at timestamptz,created_at timestamptz);
CREATE TABLE merchant_cashier_staff_permissions(merchant_id text,staff_id text,permission text);
CREATE TABLE merchant_cashier_staff_discount_policies(
 merchant_id text,staff_id text,enabled boolean,can_approve_override boolean,max_amount_minor bigint,max_percentage_bps bigint);
INSERT INTO accounts VALUES ('operator_actor','admin','active');
INSERT INTO admin_profiles VALUES ('operator_actor','owner_admin',true,false);
INSERT INTO merchants VALUES ('a'),('b');
INSERT INTO products VALUES (1,'a'),(2,'b');
INSERT INTO orders VALUES (11,'a'),(12,'b');
INSERT INTO merchant_cashier_discount_settings VALUES ('a','amount',1),('b','amount',1);
INSERT INTO merchant_cashier_discount_override_approvals(id,merchant_id,consumed_at) VALUES
 ('a-pending','a',NULL),('a-consumed','a',now()),('b-pending','b',NULL);
""")
        for name, pin in FILES.items():
            owner.sql(pinned("lib/db/drizzle/" + name, pin))
        owner.sql(f"""
GRANT USAGE ON SCHEMA fawri_security TO {AUTH},{READER};
GRANT EXECUTE ON FUNCTION public.fawri_authentication_runtime() TO {AUTH};
GRANT EXECUTE ON FUNCTION fawri_security.issue_scope(name,integer,bigint,text) TO {AUTH};
GRANT EXECUTE ON FUNCTION public.fawri_issue_admin_directory_audit(text,text,text) TO {OP};
GRANT SELECT ON public.products,public.orders TO {TENANT},{AUTH},{OP};
GRANT SELECT ON ALL TABLES IN SCHEMA public,fawri_security TO {READER};
GRANT SELECT ON ALL SEQUENCES IN SCHEMA public TO {READER};
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.products FORCE ROW LEVEL SECURITY;
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.orders FORCE ROW LEVEL SECURITY;
CREATE POLICY product_scope ON public.products USING (public.fawri_tenant_or_audited_admin(merchant_id));
CREATE POLICY order_scope ON public.orders USING (public.fawri_tenant_or_audited_admin(merchant_id));
""")
        try:
            invalid = Session(port, READER, secrets.token_hex(24))
        except SqlError as exc:
            assert exc.args == ("LOGIN_FAILED", READER)
        else:
            invalid.close()
            raise AssertionError("An incorrect SCRAM credential was accepted")
        tenant, auth, op, reader = (connect(r) for r in (TENANT, AUTH, OP, READER))
        baseline = {}
        for sig in SIG:
            query = (
                "SELECT pg_get_userbyid(p.proowner),p.proacl::text,p.prosecdef::text,pg_get_functiondef(p.oid)"
                f" FROM pg_proc p WHERE p.oid='public.{sig}'::regprocedure")
            [entry] = owner.sql(query)
            assert entry[:3] == (OWNER, "{fawri_owner=X/fawri_owner,=X/fawri_owner}", "true")
            baseline[sig] = (query, entry)
        snapshot_sql = """
SELECT 'relation',oid::text,coalesce(relacl::text,''),relowner::text FROM pg_class
 WHERE relnamespace IN ('public'::regnamespace,'fawri_security'::regnamespace)
UNION ALL SELECT 'membership',roleid::text,member::text,grantor::text||admin_option||inherit_option||set_option FROM pg_auth_members
UNION ALL SELECT 'database',oid::text,coalesce(datacl::text,''),datdba::text FROM pg_database WHERE datname=current_database()
UNION ALL SELECT 'schema',oid::text,coalesce(nspacl::text,''),nspowner::text FROM pg_namespace WHERE nspname IN ('public','fawri_security')
ORDER BY 1,2,3,4
"""
        rights = owner.sql(snapshot_sql)
        preflight_source = pinned("scripts/v1-recurring-encrypted-db-backup.mjs",
                                  "4fae4af9c65a629ac36812a5cd66b87131437f3c")
        preflight = re.search(r"export const READER_PREFLIGHT_SQL = `(.+?)`;", preflight_source, re.S)[1]
        assert scalar(reader, preflight) == "G5_READER_DENIED"
        assert all(scalar(reader, f"SELECT has_function_privilege('public.{sig}','EXECUTE')") == "t" for sig in SIG)
        print("G5_BASELINE_SIX_PUBLIC_AND_READER_DENIED")

        revoke = "REVOKE EXECUTE ON FUNCTION " + ", ".join("public."+sig for sig in SIG) + " FROM PUBLIC"
        shared = "GRANT EXECUTE ON FUNCTION public." + SIG[0] + f" TO {TENANT},{AUTH},{OP}"
        settings = "GRANT EXECUTE ON FUNCTION " + ", ".join("public."+sig for sig in SIG[4:]) + f" TO {AUTH}"
        owner.sql(f"BEGIN; {shared}; {settings}; {revoke}; COMMIT;")
        for role, permitted in [(TENANT, {0}), (AUTH, {0,4,5}), (OP, {0}), (READER,set()), (RETIRE,set())]:
            effective = {i for i, sig in enumerate(SIG) if scalar(owner,
                f"SELECT has_function_privilege('{role}','public.{sig}','EXECUTE')") == "t"}
            assert effective == permitted, (role, effective)
        for sig, (query, old) in baseline.items():
            [new] = owner.sql(query)
            assert (new[0], new[2:]) == (old[0], old[2:])
        assert owner.sql(snapshot_sql) == rights
        assert scalar(owner, "SELECT NOT rolcanlogin FROM pg_roles WHERE rolname="+literal(RETIRE)) == "t"
        print("G5_EXACT_SIX_ACL_MATRIX_AND_NON_TARGET_RIGHTS_PASS")

        assert scalar(tenant, "SELECT count(*) FROM products") == "0"
        tenant.sql("BEGIN")
        [(pid,xid)] = tenant.sql("SELECT pg_backend_pid(),txid_current()")
        auth.sql(f"SELECT fawri_security.issue_scope('{TENANT}',{int(pid)},{int(xid)},'a')")
        assert tenant.sql("SELECT id FROM products ORDER BY id") == [("1",)]
        assert tenant.sql("SELECT id FROM orders ORDER BY id") == [("11",)]
        rejected(auth, f"SELECT fawri_security.issue_scope('{TENANT}',{int(pid)},{int(xid)},'b')")
        tenant.sql("COMMIT")
        assert scalar(tenant, "SELECT count(*) FROM orders") == "0"
        print("G5_TENANT_OWN_SCOPE_ONLY_AND_TRANSACTION_EXPIRY_PASS")

        assert scalar(auth, "SELECT fawri_authentication_runtime()") == "t"
        assert scalar(auth, "SELECT count(*) FROM products") == "2"
        auth.sql("BEGIN")
        assert auth.sql("SELECT * FROM fawri_lock_cashier_discount_setting('a')") == [("amount","1")]
        auth.sql("SELECT fawri_invalidate_pending_cashier_discount_approvals('a')")
        auth.sql("COMMIT")
        assert owner.sql("SELECT id FROM merchant_cashier_discount_override_approvals ORDER BY id") == [
            ("a-consumed",),("b-pending",)]
        calls = [
            "SELECT * FROM fawri_lock_cashier_approver('a','staff')",
            "SELECT * FROM fawri_lock_cashier_discount_approval('a','id','operation')",
            "SELECT * FROM fawri_consume_cashier_discount_approval('a','id','op','st','u',1,'x',now(),2,'amount')",
        ]
        for session in (tenant,auth,op,reader):
            for call in calls:
                rejected(session, call)
        for session in (tenant,op,reader):
            rejected(session, "SELECT * FROM fawri_lock_cashier_discount_setting('a')")
            rejected(session, "SELECT fawri_invalidate_pending_cashier_discount_approvals('a')")
        print("G5_TRUSTED_AUTH_SETTINGS_PASS_POS_CAPABILITIES_DENIED")

        assert scalar(op, "SELECT count(*) FROM products") == "0"
        rejected(op, "SELECT fawri_issue_admin_directory_audit('missing','missing','" + "a"*64 +"')")
        op.sql("BEGIN")
        op.sql("SELECT fawri_issue_admin_directory_audit('operator_actor','valid','" + "a"*64 +"')")
        assert scalar(op, "SELECT count(*) FROM products") == "2"
        op.sql("COMMIT")
        assert scalar(op, "SELECT count(*) FROM products") == "0"
        op.sql("BEGIN")
        xid = int(scalar(op, "SELECT txid_current()"))
        owner.sql(f"""
INSERT INTO database_admin_access_audits
 (id,admin_account_id,reason_code,request_hash,expires_at,merchant_id,authority_transaction_id)
 VALUES('bounded','operator_actor','FIXTURE','{'a'*64}',now()+interval '1 minute','a',{xid}),
       ('expired','operator_actor','FIXTURE','{'a'*64}',now()-interval '1 minute','a',{xid});
""")
        op.sql("SELECT set_config('fawri.admin_account_id','operator_actor',true),set_config('fawri.admin_audit_id','bounded',true)")
        assert op.sql("SELECT id FROM orders ORDER BY id") == [("11",)]
        op.sql("SELECT set_config('fawri.admin_audit_id','expired',true)")
        assert scalar(op, "SELECT count(*) FROM orders") == "0"
        op.sql("ROLLBACK")
        print("G5_AUDITED_OPERATOR_VALID_WRONG_MERCHANT_EXPIRED_AND_UNKNOWN_PASS")

        assert scalar(reader, preflight) == "G5_READER_ACCEPTED"
        rejected(reader, "SELECT fawri_tenant_or_audited_admin('a')")
        reader.sql("BEGIN READ WRITE")
        rejected(reader, "INSERT INTO products VALUES (3,'a')")
        reader.sql("ROLLBACK")
        assert reader.sql("COPY (SELECT id,merchant_id FROM products ORDER BY id) TO STDOUT") == b"1\ta\n2\tb\n"
        print("G5_UNCHANGED_READER_PREFLIGHT_COPY_AND_WRITE_DENIAL_PASS")

        undo = "GRANT EXECUTE ON FUNCTION " + ", ".join("public."+sig for sig in SIG) + " TO PUBLIC"
        revoke_apps = shared.replace("GRANT", "REVOKE", 1).replace(" TO ", " FROM ")
        revoke_auth = settings.replace("GRANT", "REVOKE", 1).replace(" TO ", " FROM ")
        owner.sql(f"BEGIN; {undo}; {revoke_apps}; {revoke_auth}; COMMIT;")
        for query, old in baseline.values():
            assert owner.sql(query) == [old]
        assert owner.sql(snapshot_sql) == rights
        assert scalar(reader, preflight) == "G5_READER_DENIED"
        print("G5_SYNTHETIC_ACL_ROLLBACK_EXACT_PASS")
    finally:
        for session in reversed(sessions):
            session.close()
        pg("pg_ctl", "-D", data, "-m", "immediate", "-w", "stop")

with TemporaryDirectory(prefix="fawri-g5-acl-", dir="/tmp") as root:
    run_cluster(native, Path(root))
assert not Path(root).exists()
print("G5_TEMP_CLUSTER_CLEANUP_PASS")
