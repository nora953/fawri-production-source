import assert from "node:assert/strict";
import test from "node:test";
import { adminAuthPostgresCutoverMode } from "../src/services/adminAuthPostgresCutover";

const OPERATIONAL = "FAWRI_OPERATIONAL_POSTGRES_AUTHORITY";
const SESSION = "FAWRI_AUTH_POSTGRES_SESSION_AUTHORITY";

function restore(name: string, value: string | undefined): void {
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}

test("admin PostgreSQL cutover mode rejects either half-configured authority", () => {
  const operationalBefore = process.env[OPERATIONAL];
  const sessionBefore = process.env[SESSION];
  try {
    delete process.env[OPERATIONAL];
    delete process.env[SESSION];
    assert.equal(adminAuthPostgresCutoverMode(), "legacy");

    process.env[OPERATIONAL] = "required";
    delete process.env[SESSION];
    assert.equal(adminAuthPostgresCutoverMode(), "incomplete");

    delete process.env[OPERATIONAL];
    process.env[SESSION] = "required";
    assert.equal(adminAuthPostgresCutoverMode(), "incomplete");

    process.env[OPERATIONAL] = "required";
    process.env[SESSION] = "required";
    assert.equal(adminAuthPostgresCutoverMode(), "postgres");
  } finally {
    restore(OPERATIONAL, operationalBefore);
    restore(SESSION, sessionBefore);
  }
});
