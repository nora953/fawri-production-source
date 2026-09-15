import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");
const read = (relative) => fs.readFileSync(path.join(root, relative), "utf8");

test("SuperQi sandbox adapter is sandbox-only and server-authoritative", () => {
  const transport = read("src/services/superQiSandboxTransport.ts");
  const webhook = read("src/services/superQiSandboxWebhook.ts");
  const authority = read("src/services/saasBillingAuthority.ts");
  const routes = read("src/routes/saas-billing.ts");

  assert.match(transport, /https:\/\/uat-sandbox-3ds-api\.qi\.iq\/api\/v1/);
  assert.match(transport, /NODE_ENV === "production"/);
  assert.match(transport, /SUPERQI_SANDBOX_PRODUCTION_FORBIDDEN/);
  assert.match(transport, /X-Terminal-Id/);
  assert.match(transport, /Authorization: basicAuthorization/);
  assert.match(transport, /currency: "IQD"/);
  assert.match(transport, /notificationUrl/);
  assert.match(transport, /finishPaymentUrl/);
  assert.match(transport, /RSA-SHA256/);
  assert.doesNotMatch(transport, /paymentgatewaytest/);
  assert.doesNotMatch(transport, /WHaNFE5C3qlChqNbAzH4/);
  assert.doesNotMatch(transport, /237984/);

  assert.match(webhook, /verifySuperQiSandboxWebhookSignature/);
  assert.match(webhook, /getSuperQiSandboxPaymentStatus/);
  assert.match(webhook, /applyVerifiedSaasBillingProviderEvent/);
  assert.match(webhook, /provider_checkout_ref = \$2/);
  assert.match(authority, /provider: "test_fake" \| "superqi_sandbox"/);
  assert.match(authority, /input\.provider === "superqi_sandbox"/);
  assert.doesNotMatch(authority, /production_ready:\s*true/);

  assert.match(routes, /\/billing\/providers\/superqi\/webhook/);
  assert.match(routes, /x-signature/);
  const webhookRouteStart = routes.indexOf('router.post("/billing/providers/superqi/webhook"');
  const catalogStart = routes.indexOf('router.get("/billing/catalog"');
  assert.ok(webhookRouteStart >= 0 && catalogStart > webhookRouteStart);
  const webhookRoute = routes.slice(webhookRouteStart, catalogStart);
  assert.doesNotMatch(webhookRoute, /requireSecureMerchantSession/);
  assert.match(webhookRoute, /handleSuperQiSandboxWebhook/);
});
