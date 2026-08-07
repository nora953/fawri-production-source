import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { findSensitiveText, parseAuditSeverityCounts, redactSensitiveText } from "./security-ci-lib.mjs";
import { validateRepositoryPolicy } from "./security-final-audit.mjs";

function makeToken(prefix, length = 40) {
  return `${prefix}${"A".repeat(length)}`;
}

test("redaction detects Meta token, customer message, and webhook payload without preserving values", () => {
  const metaToken = makeToken("EAA", 45);
  const customerMessage = "please deliver this private order tomorrow";
  const webhookPayload = '{"sender":"customer-123","message":"private payload"}';
  const input = `page_access_token=${metaToken}\ncustomer_message=${customerMessage}\nwebhook_payload=${webhookPayload}`;
  const findings = findSensitiveText(input, { includePrivateData: true });
  assert.ok(findings.some((item) => item.rule === "meta-access-token" || item.rule === "named-secret"));
  assert.ok(findings.some((item) => item.rule === "customer-content-field"));
  assert.ok(findings.some((item) => item.rule === "webhook-payload"));
  const redacted = redactSensitiveText(input, { includePrivateData: true }).text;
  assert.equal(redacted.includes(metaToken), false);
  assert.equal(redacted.includes(customerMessage), false);
  assert.equal(redacted.includes(webhookPayload), false);
  assert.match(redacted, /\[REDACTED:/);
});

test("placeholder credentials are not treated as production secrets", () => {
  const input = "POSTGRES_PASSWORD: fawri_ci\naccess_token=${META_ACCESS_TOKEN}\nemail=test@example.com";
  assert.deepEqual(findSensitiveText(input, { includePrivateData: true }), []);
});

test("secret rules ignore runtime expressions and still catch hardcoded literals", () => {
  const runtimeSource = [
    'const appSecret = String(process.env.META_APP_SECRET || "").trim();',
    'const password = String(req.body?.password || "");',
    'password: "merchant-hash",',
  ].join("\n");
  assert.deepEqual(findSensitiveText(runtimeSource, { includeAssignments: true }), []);

  const literal = "Sup3rS3cretValue!";
  const hardcoded = `META_APP_SECRET=${literal}\npassword=\"${literal}\"`;
  const findings = findSensitiveText(hardcoded, { includeAssignments: true });
  assert.ok(findings.some((item) => item.rule === "env-secret-literal"));
  assert.ok(findings.some((item) => item.rule === "named-secret"));
  assert.equal(redactSensitiveText(hardcoded).text.includes(literal), false);
});

test("dependency audit parser returns exact severity counts", () => {
  const counts = parseAuditSeverityCounts({
    metadata: { vulnerabilities: { info: 1, low: 2, moderate: 3, high: 4, critical: 5 } },
  });
  assert.deepEqual(counts, { info: 1, low: 2, moderate: 3, high: 4, critical: 5, total: 15 });
});

test("dependency audit parser fails closed on malformed output", () => {
  assert.throws(() => parseAuditSeverityCounts({ metadata: {} }), /does not contain vulnerability counts/);
});

test("repository policy requires protected workflows and pnpm hardening", () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "fawri-policy-"));
  try {
    const workflowDir = path.join(root, ".github", "workflows");
    mkdirSync(workflowDir, { recursive: true });
    const protectedNames = [
      "meta-webhook-pipeline.yml",
      "merchant-access-security.yml",
      "merchant-settings.yml",
      "postgresql-schema.yml",
      "postgresql-migration-candidate.yml",
      "complete-migration-safety.yml",
      "complete-schema-candidate.yml",
      "order-operations.yml",
      "browser-storage-audit.yml",
    ];
    for (const name of protectedNames) writeFileSync(path.join(workflowDir, name), "name: existing\n");
    const safeWorkflow = "permissions:\n  contents: read\nsteps:\n  - uses: actions/checkout@v4\n    with:\n      persist-credentials: false\n";
    writeFileSync(path.join(workflowDir, "quality-gates.yml"), safeWorkflow);
    writeFileSync(path.join(workflowDir, "security-supply-chain.yml"), safeWorkflow);
    writeFileSync(path.join(root, "pnpm-workspace.yaml"), "autoInstallPeers: false\nminimumReleaseAge: 1440\n");
    writeFileSync(path.join(root, "package.json"), JSON.stringify({ scripts: { preinstall: "echo 'Use pnpm instead'" } }));
    writeFileSync(path.join(root, "pnpm-lock.yaml"), "lockfileVersion: '9.0'\n");

    const report = validateRepositoryPolicy(root, ["pnpm-lock.yaml", "pnpm-workspace.yaml", "package.json"]);
    assert.equal(report.status, "pass");

    writeFileSync(path.join(workflowDir, "quality-gates.yml"), `${safeWorkflow}continue-on-error: true\n`);
    const unsafe = validateRepositoryPolicy(root, ["pnpm-lock.yaml", "pnpm-workspace.yaml", "package.json"]);
    assert.equal(unsafe.status, "fail");
    assert.ok(unsafe.violations.some((item) => item.includes("continue-on-error")));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
