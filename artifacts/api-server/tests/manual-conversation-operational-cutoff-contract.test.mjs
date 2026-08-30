import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const testDirectory = path.dirname(fileURLToPath(import.meta.url));
const routeSource = readFileSync(
  path.resolve(testDirectory, "../src/routes/conversation-operations.ts"),
  "utf8",
);

function manualMessageRoute() {
  const start = routeSource.indexOf(
    '"/conversations/:conversationId/messages"',
  );
  const end = routeSource.indexOf("export default router", start);
  assert.ok(start >= 0, "manual conversation message route is missing");
  assert.ok(end > start, "manual conversation message route boundary is missing");
  return routeSource.slice(start, end);
}

test("manual Meta reply rechecks merchant operational access before provider send", () => {
  const route = manualMessageRoute();
  const prepare = route.indexOf("prepareManualReplyAuthoritative");
  const providerSend = route.indexOf("await fetch(");

  assert.ok(prepare >= 0, "manual reply preparation is missing");
  assert.ok(providerSend > prepare, "manual Meta provider send is missing");

  const immediatelyBeforeProviderSend = route.slice(prepare, providerSend);
  assert.match(
    immediatelyBeforeProviderSend,
    /getMerchantOperationalDecisionAuthoritative\s*\(/,
    "merchant operational access must be re-read after manual reply preparation and before Meta send",
  );
});
