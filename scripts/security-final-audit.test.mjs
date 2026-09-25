import { execFileSync } from "node:child_process";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { findSensitiveText, parseAuditSeverityCounts, redactSensitiveText } from "./security-ci-lib.mjs";
import {
  evaluateDependencyAudit,
  evaluateDependencyChange,
  scanRepositoryHistory,
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
    const safeSecurityWorkflow = `${safeWorkflow}jobs:\n  dependency-review:\n    steps:\n      - run: node scripts/security-final-audit.mjs dependency-review \"$BASE_SHA\"\n      - run: pnpm install --frozen-lockfile --ignore-scripts\n      - run: node scripts/security-final-audit.mjs dependency\n`;
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


test("history scan finds a secret removed from HEAD without returning the secret value", () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "fawri-history-secret-"));
  const historicalSecret = `sk-proj-${"Z".repeat(40)}`;
  try {
    execFileSync("git", ["init"], { cwd: root, stdio: "ignore" });
    execFileSync("git", ["config", "user.email", "security-test@example.com"], { cwd: root });
    execFileSync("git", ["config", "user.name", "Security Test"], { cwd: root });

    writeFileSync(path.join(root, "historical.env"), `OPENAI_API_KEY=${historicalSecret}\n`);
    execFileSync("git", ["add", "historical.env"], { cwd: root });
    execFileSync("git", ["commit", "-m", "historical secret fixture"], {
      cwd: root,
      stdio: "ignore",
    });

    writeFileSync(path.join(root, "historical.env"), "OPENAI_API_KEY=redacted\n");
    execFileSync("git", ["add", "historical.env"], { cwd: root });
    execFileSync("git", ["commit", "-m", "remove historical secret"], {
      cwd: root,
      stdio: "ignore",
    });

    assert.equal(
      readFileSync(path.join(root, "historical.env"), "utf8").includes(historicalSecret),
      false,
    );
    const report = scanRepositoryHistory(root, { emit: false });
    assert.equal(report.status, "fail");
    assert.ok(report.findings.some((item) => item.rule === "openai-secret"));
    assert.ok(report.locations.some((item) => item.file === "historical.env"));
    assert.equal(JSON.stringify(report).includes(historicalSecret), false);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
