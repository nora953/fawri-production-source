import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const testDirectory = path.dirname(fileURLToPath(import.meta.url));
const callbackSourcePath = path.resolve(
  testDirectory,
  "../src/routes/indexModulePart4.ts",
);
const source = readFileSync(callbackSourcePath, "utf8");

function callbackBody() {
  const start = source.indexOf('router.get("/meta/callback"');
  const end = source.indexOf('router.use("/bot-training"', start);
  assert.ok(start >= 0, "Meta OAuth callback route is missing");
  assert.ok(end > start, "Meta OAuth callback route boundary is missing");
  return source.slice(start, end);
}

test("Meta OAuth callback rechecks merchant access before external Page subscription", () => {
  const callback = callbackBody();
  const initialAccessCheck = callback.indexOf(
    "getMerchantOperationalDecisionAuthoritative",
  );
  const tokenExchange = callback.indexOf("/oauth/access_token");
  const pageDiscovery = callback.indexOf("/me/accounts");
  const subscribe = callback.indexOf("/subscribed_apps");
  const localPersistence = callback.indexOf("connectMetaChannelAuthoritative");

  assert.ok(initialAccessCheck >= 0, "callback must check merchant operational access");
  assert.ok(tokenExchange > initialAccessCheck, "merchant access must be checked before token exchange");
  assert.ok(pageDiscovery > tokenExchange, "Meta Page discovery must follow token exchange");
  assert.ok(subscribe > pageDiscovery, "Meta Page subscription must follow Page discovery");
  assert.ok(localPersistence > subscribe, "local channel persistence must follow provider subscription attempt");

  const immediatelyBeforeExternalActivation = callback.slice(
    pageDiscovery,
    subscribe,
  );
  assert.match(
    immediatelyBeforeExternalActivation,
    /getMerchantOperationalDecisionAuthoritative\s*\(/,
    "merchant operational access must be re-read after Page discovery and before subscribed_apps",
  );

  const compensationEndpoint = callback.indexOf(
    "/subscribed_apps",
    localPersistence,
  );
  const compensationDelete = callback.indexOf(
    'method: "DELETE"',
    localPersistence,
  );
  assert.ok(
    compensationEndpoint > localPersistence,
    "operational denial after provider subscription must retain a provider unsubscribe compensation path",
  );
  assert.ok(
    compensationDelete > compensationEndpoint,
    "provider cutoff compensation must unsubscribe the Page rather than issue another subscription",
  );
});
