import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const apiRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

async function source(relativePath) {
  return readFile(path.join(apiRoot, relativePath), "utf8");
}

test("merchant password recovery verifies OTP before accepting a new password", async () => {
  const routes = await source("src/routes/auth-public-routes.ts");

  assert.match(routes, /router\.post\("\/password-reset\/verify"/);

  const verifyStart = routes.indexOf('router.post("/password-reset/verify"');
  assert.ok(verifyStart >= 0);

  const verifyEnd = routes.indexOf("router.post(", verifyStart + 1);
  const verifyRoute = routes.slice(
    verifyStart,
    verifyEnd < 0 ? undefined : verifyEnd,
  );

  assert.match(
    verifyRoute,
    /verifyMerchantOtpChallengeAuthoritative\(\{/,
  );
  assert.match(verifyRoute, /purpose:\s*"password_reset"/);
  assert.match(verifyRoute, /setMerchantPasswordRecoveryProof\(/);

  const confirmStart = routes.indexOf('router.post("/password-reset/confirm"');
  assert.ok(confirmStart >= 0);

  const confirmEnd = routes.indexOf("router.post(", confirmStart + 1);
  const confirmRoute = routes.slice(
    confirmStart,
    confirmEnd < 0 ? undefined : confirmEnd,
  );

  assert.match(confirmRoute, /merchantPasswordRecoveryProof\(/);
  assert.doesNotMatch(
    confirmRoute,
    /verifyMerchantOtpChallengeAuthoritative\(\{/,
  );
  assert.doesNotMatch(confirmRoute, /req\.body\?\.challenge_id/);
  assert.doesNotMatch(confirmRoute, /req\.body\?\.code/);
  assert.match(confirmRoute, /clearMerchantPasswordRecoveryProof\(/);
  assert.match(confirmRoute, /reauthentication_required:\s*true/);
});
