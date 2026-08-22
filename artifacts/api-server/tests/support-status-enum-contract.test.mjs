import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const authorityPath = path.resolve(
  here,
  "../src/services/postgresSupportAuthority.ts",
);
const authority = fs.readFileSync(authorityPath, "utf8");

function statusUpdateBlock() {
  const match = authority.match(
    /export async function updateSupportTicketStatusPostgres[\s\S]*?\n}\n\nexport async function createInspectionRequestPostgres/,
  );
  assert.ok(match, "support status update function must remain present");
  return match[0];
}

test("support ticket status SQL binds the PostgreSQL enum explicitly", () => {
  const block = statusUpdateBlock();

  assert.match(block, /SET status = \$2::support_ticket_status/);
  assert.doesNotMatch(block, /SET status = \$2,/);

  const typedStatusUses = block.match(/\$2::support_ticket_status/g) || [];
  assert.equal(
    typedStatusUses.length,
    6,
    "every SQL use of the status parameter must keep an explicit support_ticket_status cast",
  );
});
