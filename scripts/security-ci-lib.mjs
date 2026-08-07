const PLACEHOLDER_VALUE = /^(?:example|sample|test|testing|dummy|placeholder|redacted|masked|changeme|not[-_ ]?set|fawri_ci|candidate|localhost|null|undefined|none)$/i;
const ENV_REFERENCE = /^(?:\$\{?[A-Z0-9_]+\}?|process\.env\.[A-Z0-9_]+)$/i;

const HIGH_CONFIDENCE_SECRET_RULES = [
  { id: "private-key", pattern: /-{5}BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-{5}/g },
  { id: "github-token", pattern: /\bgh(?:p|o|u|s|r)_[A-Za-z0-9]{30,}\b/g },
  { id: "github-fine-grained-token", pattern: /\bgithub_pat_[A-Za-z0-9_]{40,}\b/g },
  { id: "aws-access-key", pattern: /\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/g },
  { id: "slack-token", pattern: /\bxox[baprs]-[A-Za-z0-9-]{20,}\b/g },
  { id: "stripe-live-secret", pattern: /\bsk_live_[A-Za-z0-9]{20,}\b/g },
  { id: "openai-secret", pattern: /\bsk-(?:proj-|svcacct-)?[A-Za-z0-9_-]{24,}\b/g },
  { id: "google-api-key", pattern: /\bAIza[0-9A-Za-z_-]{30,}\b/g },
  { id: "meta-access-token", pattern: /\bEAA[A-Za-z0-9]{30,}\b/g },
  {
    id: "credential-url",
    pattern: /\b(?:postgres(?:ql)?|mysql|mongodb(?:\+srv)?|redis):\/\/[^\s:/]+:([^\s@]+)@([^\s/]+)/gi,
    validate(match) {
      const password = match[1] ?? "";
      const host = (match[2] ?? "").split(":")[0] ?? "";
      return !isPlaceholder(password) && !/^(?:127\.0\.0\.1|localhost)$/i.test(host);
    },
  },
];

const ASSIGNMENT_SECRET_RULES = [
  {
    id: "named-secret",
    pattern: /\b(?:access[_-]?token|page[_-]?access[_-]?token|refresh[_-]?token|client[_-]?secret|webhook[_-]?secret|app[_-]?secret|api[_-]?key|password|authorization|bearer[_-]?token)\b\s*(?:=|:)\s*["']?([^\s,"'\]}]{12,})/gi,
    validate(match) {
      const value = (match[1] ?? "").trim();
      return !isPlaceholder(value) && !/(?:test|example|dummy|placeholder|redacted|sample|fake|fixture)/i.test(value);
    },
  },
];

const OUTPUT_PRIVATE_DATA_RULES = [
  {
    id: "email-field",
    pattern: /\b(?:customer[_-]?email|merchant[_-]?email|user[_-]?email|email)\b\s*(?:=|:)\s*["']?([^\s,"'\]}]+@[^\s,"'\]}]+)/gi,
    validate(match) {
      const value = match[1] ?? "";
      return !/@example\.(?:com|org|net)$/i.test(value);
    },
  },
  {
    id: "phone-field",
    pattern: /\b(?:customer[_-]?phone|merchant[_-]?phone|user[_-]?phone|phone)\b\s*(?:=|:)\s*["']?(\+?\d[\d ()-]{7,}\d)/gi,
  },
  {
    id: "customer-content-field",
    pattern: /\b(?:customer[_-]?message|message[_-]?body|message[_-]?text|raw[_-]?message|payment[_-]?evidence)\b\s*(?:=|:)\s*["']?([^\n\r]{12,})/gi,
    validate(match) {
      const value = (match[1] ?? "").trim();
      return !isPlaceholder(value) && !/^\[REDACTED/i.test(value);
    },
  },
  {
    id: "webhook-payload",
    pattern: /\b(?:webhook[_-]?payload|raw[_-]?payload|payload[_-]?body|webhook[_-]?body)\b\s*(?:=|:)\s*([^\n\r]{12,})/gi,
    validate(match) {
      const value = (match[1] ?? "").trim();
      return !isPlaceholder(value) && !/^\[REDACTED/i.test(value);
    },
  },
];

function isPlaceholder(value) {
  const normalized = String(value ?? "").replace(/^['"]|['"]$/g, "").trim();
  return PLACEHOLDER_VALUE.test(normalized) || ENV_REFERENCE.test(normalized);
}

function cloneGlobalRegex(pattern) {
  const flags = pattern.flags.includes("g") ? pattern.flags : `${pattern.flags}g`;
  return new RegExp(pattern.source, flags);
}

export function findSensitiveText(text, { includePrivateData = false, includeAssignments = true } = {}) {
  const findings = [];
  const rules = [
    ...HIGH_CONFIDENCE_SECRET_RULES,
    ...(includeAssignments ? ASSIGNMENT_SECRET_RULES : []),
    ...(includePrivateData ? OUTPUT_PRIVATE_DATA_RULES : []),
  ];

  for (const rule of rules) {
    const pattern = cloneGlobalRegex(rule.pattern);
    for (const match of String(text).matchAll(pattern)) {
      if (rule.validate && !rule.validate(match)) continue;
      findings.push({
        rule: rule.id,
        index: match.index ?? 0,
        length: Math.max(1, match[0]?.length ?? 1),
      });
    }
  }

  return findings.sort((left, right) => left.index - right.index || right.length - left.length);
}

export function redactSensitiveText(text, { includePrivateData = true, includeAssignments = true } = {}) {
  const input = String(text);
  const findings = findSensitiveText(input, { includePrivateData, includeAssignments });
  if (findings.length === 0) return { text: input, findings };

  let cursor = 0;
  const parts = [];
  for (const finding of findings) {
    if (finding.index < cursor) continue;
    parts.push(input.slice(cursor, finding.index));
    parts.push(`[REDACTED:${finding.rule}]`);
    cursor = finding.index + finding.length;
  }
  parts.push(input.slice(cursor));
  return { text: parts.join(""), findings };
}

export function summarizeFindings(findings) {
  const counts = new Map();
  for (const finding of findings) counts.set(finding.rule, (counts.get(finding.rule) ?? 0) + 1);
  return [...counts.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([rule, count]) => ({ rule, count }));
}

export function parseAuditSeverityCounts(payload) {
  if (!payload || typeof payload !== "object") throw new Error("audit output is not an object");
  const source = payload?.metadata?.vulnerabilities;
  const severities = ["info", "low", "moderate", "high", "critical"];
  const counts = Object.fromEntries(severities.map((severity) => [severity, 0]));

  if (source && typeof source === "object") {
    for (const severity of severities) {
      const value = Number(source[severity] ?? 0);
      if (!Number.isFinite(value) || value < 0) throw new Error(`invalid ${severity} vulnerability count`);
      counts[severity] = value;
    }
  } else if (payload.advisories && typeof payload.advisories === "object") {
    for (const advisory of Object.values(payload.advisories)) {
      const severity = String(advisory?.severity ?? "").toLowerCase();
      if (severity in counts) counts[severity] += 1;
    }
  } else {
    throw new Error("audit output does not contain vulnerability counts");
  }

  counts.total = severities.reduce((sum, severity) => sum + counts[severity], 0);
  return counts;
}
