import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

test("production readiness documentation keeps provider-neutral core semantics", () => {
  const current = path.dirname(fileURLToPath(import.meta.url));
  const repoRoot = path.resolve(current, "../../..");
  const guide = fs.readFileSync(
    path.join(repoRoot, "docs/production-release-readiness.md"),
    "utf8",
  );

  assert.match(guide, /Fawri Core runtime/);
  assert.match(guide, /external launch integrations\/blockers/);
  assert.match(guide, /FAWRI_META_CUTOVER_READY=0/);
  assert.match(guide, /FAWRI_META_REPLY_TRANSPORT=disabled/);
  assert.match(guide, /FAWRI_META_CREDENTIAL_PROVIDER=disabled/);
  assert.match(guide, /AI\/Knowledge providers are optional external integrations/);

  const coreSection = guide.slice(
    guide.indexOf("Required **Fawri Core runtime** selections include:"),
    guide.indexOf("The release gate reports only safe error codes."),
  );
  for (const forbidden of [
    "FAWRI_META_CUTOVER_READY=1",
    "FAWRI_META_REPLY_TRANSPORT=live",
    "FAWRI_META_CREDENTIAL_PROVIDER=aws-kms",
    "FAWRI_KNOWLEDGE_EMBEDDING_PROVIDER=openai",
    "OPENAI_API_KEY",
  ]) {
    assert.equal(
      coreSection.includes(forbidden),
      false,
      `${forbidden} must not be documented as a Fawri Core runtime prerequisite`,
    );
  }
});
