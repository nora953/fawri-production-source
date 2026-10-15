import fs from "node:fs";
import path from "node:path";

const repositoryRoot = path.resolve(process.argv[2] || ".");
const sourceRoots = [
  path.join(repositoryRoot, "artifacts", "fawri", "src"),
  path.join(repositoryRoot, "artifacts", "fawri-admin", "src"),
].filter((candidate) => fs.existsSync(candidate));

const allowedPreferencePatterns = [
  /(^|[_:-])(language|locale|lang)([_:-]|$)/i,
  /(^|[_:-])(theme|appearance|color[_-]?mode)([_:-]|$)/i,
  /(^|[_:-])(sidebar|panel|view|layout)([_:-]|$)/i,
  /(^|[_:-])(onboarding[_-]?hint|tour)([_:-]|$)/i,
];

const operationalPatterns = [
  /conversation/i,
  /message/i,
  /manual[_-]?takeover/i,
  /takeover/i,
  /reply/i,
  /order/i,
  /payment/i,
  /delivery/i,
  /setting/i,
  /training/i,
  /saved[_-]?answer/i,
  /product/i,
  /inventory/i,
  /offer/i,
  /commerce/i,
  /subscription/i,
  /channel/i,
  /token/i,
  /credential/i,
  /customer/i,
];

const ignoredDirectories = new Set([
  "node_modules",
  "dist",
  "build",
  "coverage",
  ".git",
]);
const supportedExtensions = new Set([
  ".ts",
  ".tsx",
  ".js",
  ".jsx",
  ".mts",
  ".mjs",
  ".cts",
  ".cjs",
]);

function walk(directory) {
  const files = [];
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (ignoredDirectories.has(entry.name)) continue;
    const absolutePath = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...walk(absolutePath));
    else if (supportedExtensions.has(path.extname(entry.name))) files.push(absolutePath);
  }
  return files;
}

function lineNumber(source, index) {
  return source.slice(0, index).split("\n").length;
}

function normalizeKey(value) {
  return String(value || "").trim();
}

function classifyKey(key, dynamicExpression) {
  if (dynamicExpression) return "dynamic_review_required";
  if (!key) return "unknown";
  if (operationalPatterns.some((pattern) => pattern.test(key))) {
    return "operational";
  }
  if (allowedPreferencePatterns.some((pattern) => pattern.test(key))) {
    return "ui_preference";
  }
  return "review_required";
}

function extractCalls(filePath, source) {
  const calls = [];
  const directCall = /(?:window\s*\.\s*)?(localStorage|sessionStorage)\s*\.\s*(getItem|setItem|removeItem)\s*\(\s*([^,\)]+)/g;
  const bracketCall = /(?:window\s*\.\s*)?(localStorage|sessionStorage)\s*\[\s*(["'`])([^"'`]+)\2\s*\]/g;
  const clearCall = /(?:window\s*\.\s*)?(localStorage|sessionStorage)\s*\.\s*clear\s*\(/g;

  for (const match of source.matchAll(directCall)) {
    const expression = String(match[3] || "").trim();
    const literal = expression.match(/^(["'`])([\s\S]*?)\1$/);
    const dynamicExpression = !literal;
    const key = literal ? normalizeKey(literal[2]) : expression;
    calls.push({
      file: path.relative(repositoryRoot, filePath),
      line: lineNumber(source, match.index || 0),
      storage: match[1],
      operation: match[2],
      key,
      dynamic_expression: dynamicExpression,
      classification: classifyKey(key, dynamicExpression),
    });
  }

  for (const match of source.matchAll(bracketCall)) {
    const key = normalizeKey(match[3]);
    calls.push({
      file: path.relative(repositoryRoot, filePath),
      line: lineNumber(source, match.index || 0),
      storage: match[1],
      operation: "bracket_access",
      key,
      dynamic_expression: false,
      classification: classifyKey(key, false),
    });
  }

  for (const match of source.matchAll(clearCall)) {
    calls.push({
      file: path.relative(repositoryRoot, filePath),
      line: lineNumber(source, match.index || 0),
      storage: match[1],
      operation: "clear",
      key: "*",
      dynamic_expression: false,
      classification: "operational",
    });
  }

  return calls;
}

const files = sourceRoots.flatMap(walk).sort();
const findings = files.flatMap((filePath) =>
  extractCalls(filePath, fs.readFileSync(filePath, "utf8")),
);
const counts = findings.reduce((result, finding) => {
  result[finding.classification] =
    (result[finding.classification] || 0) + 1;
  return result;
}, {});
const operationalKeys = [...new Set(
  findings
    .filter((finding) => finding.classification === "operational")
    .map((finding) => finding.key),
)].sort();
const dynamicFindings = findings.filter((finding) => finding.dynamic_expression);
const failOnOperational = process.env.FAWRI_STORAGE_AUDIT_FAIL_ON_OPERATIONAL === "1";

const report = {
  ok:
    !failOnOperational ||
    (!findings.some((finding) => finding.classification === "operational") &&
      dynamicFindings.length === 0),
  mode: "read_only",
  generated_at: new Date().toISOString(),
  repository_root: repositoryRoot,
  source_roots: sourceRoots.map((root) => path.relative(repositoryRoot, root)),
  summary: {
    scanned_files: files.length,
    findings: findings.length,
    classification_counts: counts,
    operational_keys: operationalKeys.length,
    dynamic_expressions: dynamicFindings.length,
    enforcement_enabled: failOnOperational,
  },
  operational_keys: operationalKeys,
  findings,
};

process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
process.exitCode = report.ok ? 0 : 2;
