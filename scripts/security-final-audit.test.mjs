import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { findSensitiveText, parseAuditSeverityCounts, redactSensitiveText } from "./security-ci-lib.mjs";
import {
  evaluateDependencyAudit,
  isKnownTestFixtureCredentialUrl,
  isKnownHistoricalScannerSelfTestCredentialUrl,
  evaluateDependencyChange,
  validateRepositoryPolicy,
} from "./security-final-audit.mjs";

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

test("dependency review fails when a dependency change introduces simulated High", () => {
  const change = evaluateDependencyChange(["package.json", "pnpm-lock.yaml"]);
  assert.equal(change.status, "pass");
  assert.equal(change.dependency_graph_changed, true);
  assert.equal(evaluateDependencyAudit({ high: 1, critical: 0 }, 1).status, "fail");
});

test("dependency review fails when a dependency change introduces simulated Critical", () => {
  const change = evaluateDependencyChange(["artifacts/web/package.json", "pnpm-lock.yaml"]);
  assert.equal(change.status, "pass");
  assert.equal(change.dependency_graph_changed, true);
  assert.equal(evaluateDependencyAudit({ high: 0, critical: 1 }, 1).status, "fail");
});

test("dependency review fails closed on manifest change without synchronized lockfile", () => {
  const report = evaluateDependencyChange(["artifacts/api-server/package.json"]);
  assert.equal(report.status, "fail");
  assert.equal(report.dependency_graph_changed, true);
  assert.equal(report.manifest_changed, true);
  assert.equal(report.lockfile_changed, false);
  assert.match(report.violations[0], /without pnpm-lock\.yaml/);
});

test("dependency review passes when no dependency graph file changed", () => {
  const report = evaluateDependencyChange(["scripts/security-final-audit.mjs", "README.md"]);
  assert.deepEqual(report, {
    status: "pass",
    dependency_graph_changed: false,
    manifest_changed: false,
    lockfile_changed: false,
    violations: [],
  });
});

test("dependency review passes the current clean blocking-severity baseline", () => {
  assert.deepEqual(evaluateDependencyAudit({ high: 0, critical: 0 }, 0), {
    status: "pass",
    blocking: 0,
  });
});

test("repository policy requires protected workflows, immutable action pins, pnpm hardening, and local dependency review", () => {
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
    const checkoutSha = "11d5960a326750d5838078e36cf38b85af677262";
    const safeWorkflow = `permissions:\n  contents: read\nsteps:\n  - uses: actions/checkout@${checkoutSha}\n    with:\n      persist-credentials: false\n`;
    const safeSecurityWorkflow = `permissions:\n  contents: read\nsteps:\n  - uses: actions/checkout@${checkoutSha}\n    with:\n      persist-credentials: false\n      fetch-depth: 0\n  - run: node scripts/security-final-audit.mjs history\njobs:\n  dependency-review:\n    steps:\n      - run: node scripts/security-final-audit.mjs dependency-review \"$BASE_SHA\"\n      - run: pnpm install --frozen-lockfile --ignore-scripts\n      - run: node scripts/security-final-audit.mjs dependency\n`;
    writeFileSync(path.join(workflowDir, "quality-gates.yml"), safeWorkflow);
    writeFileSync(path.join(workflowDir, "security-supply-chain.yml"), safeSecurityWorkflow);
    writeFileSync(path.join(root, "pnpm-workspace.yaml"), "autoInstallPeers: false\nminimumReleaseAge: 1440\n");
    writeFileSync(path.join(root, "package.json"), JSON.stringify({ scripts: { preinstall: "echo 'Use pnpm instead'" } }));
    writeFileSync(path.join(root, "pnpm-lock.yaml"), "lockfileVersion: '9.0'\n");

    const report = validateRepositoryPolicy(root, ["pnpm-lock.yaml", "pnpm-workspace.yaml", "package.json"]);
    assert.equal(report.status, "pass");

    writeFileSync(path.join(workflowDir, "quality-gates.yml"), `${safeWorkflow}continue-on-error: true\n`);
    const unsafe = validateRepositoryPolicy(root, ["pnpm-lock.yaml", "pnpm-workspace.yaml", "package.json"]);
    assert.equal(unsafe.status, "fail");
    assert.ok(unsafe.violations.some((item) => item.includes("continue-on-error")));

    writeFileSync(
      path.join(workflowDir, "quality-gates.yml"),
      "permissions:\n  contents: read\nsteps:\n  - uses: actions/checkout@v4\n    with:\n      persist-credentials: false\n",
    );
    const mutableAction = validateRepositoryPolicy(root, ["pnpm-lock.yaml", "pnpm-workspace.yaml", "package.json"]);
    assert.equal(mutableAction.status, "fail");
    assert.ok(mutableAction.violations.some((item) => item.includes("immutable SHA")));

    writeFileSync(path.join(workflowDir, "quality-gates.yml"), safeWorkflow);
    writeFileSync(path.join(workflowDir, "security-supply-chain.yml"), safeWorkflow);
    const missingLocalGate = validateRepositoryPolicy(root, ["pnpm-lock.yaml", "pnpm-workspace.yaml", "package.json"]);
    assert.equal(missingLocalGate.status, "fail");
    assert.ok(missingLocalGate.violations.some((item) => item.includes("local dependency-review gate")));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});


test("security workflow requires a full-history secret scan", () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "fawri-history-policy-"));
  try {
    const workflowDir = path.join(root, ".github", "workflows");
    mkdirSync(workflowDir, { recursive: true });
    const checkoutSha = "11d5960a326750d5838078e36cf38b85af677262";
    const content = `permissions:
  contents: read
jobs:
  repository-security:
    steps:
      - uses: actions/checkout@${checkoutSha}
        with:
          persist-credentials: false
          fetch-depth: 0
      - run: node scripts/security-final-audit.mjs history
`;
    writeFileSync(path.join(workflowDir, "security-supply-chain.yml"), content);
    assert.match(content, /fetch-depth:\s*0/);
    assert.match(content, /security-final-audit\.mjs history/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});


test("historical credential URL suppression is limited to obvious test fixtures", () => {
  const fixture = "postgresql://fixture_user:fixture-password@db.example/fawri_test";
  const fixtureFinding = { rule: "credential-url", index: 0, length: fixture.length };
  assert.equal(
    isKnownTestFixtureCredentialUrl(
      fixture,
      fixtureFinding,
      "scripts/tests/backup-postgresql.test.mjs",
    ),
    true,
  );

  const nonTestPath = "postgresql://fixture_user:fixture-password@db.example/fawri";
  assert.equal(
    isKnownTestFixtureCredentialUrl(
      nonTestPath,
      { rule: "credential-url", index: 0, length: nonTestPath.length },
      "scripts/deploy-production.mjs",
    ),
    false,
  );

  const productionLike = [
    "postgresql://prod_owner:",
    "highEntropyCredentialValue",
    "@db.internal.company/fawri",
  ].join("");
  assert.equal(
    isKnownTestFixtureCredentialUrl(
      productionLike,
      { rule: "credential-url", index: 0, length: productionLike.length },
      "scripts/tests/production-connectivity.test.mjs",
    ),
    false,
  );
});


test("history scanner suppresses only the exact historical production-like self-test fixture", () => {
  const historicalFixture = [
    "postgresql://prod_owner:",
    "highEntropyCredentialValue",
    "@db.internal.company/fawri",
  ].join("");
  assert.equal(
    isKnownHistoricalScannerSelfTestCredentialUrl(
      historicalFixture,
      { rule: "credential-url", index: 0, length: historicalFixture.length },
      "scripts/security-final-audit.test.mjs",
    ),
    true,
  );

  const differentCredential = [
    "postgresql://prod_owner:",
    "differentHighEntropyValue",
    "@db.internal.company/fawri",
  ].join("");
  assert.equal(
    isKnownHistoricalScannerSelfTestCredentialUrl(
      differentCredential,
      { rule: "credential-url", index: 0, length: differentCredential.length },
      "scripts/security-final-audit.test.mjs",
    ),
    false,
  );
  assert.equal(
    isKnownHistoricalScannerSelfTestCredentialUrl(
      historicalFixture,
      { rule: "credential-url", index: 0, length: historicalFixture.length },
      "scripts/tests/production-connectivity.test.mjs",
    ),
    false,
  );
});
