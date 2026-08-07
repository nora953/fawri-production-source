const PLACEHOLDER_VALUE = /^(?:example|sample|test|testing|dummy|placeholder|redacted|masked|changeme|not[-_ ]?set|fawri_ci|candidate|localhost)$/i;

const HIGH_CONFIDENCE_SECRET_RULES = [
  {
    id: "private-key",
    pattern: new RegExp("-{5}BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-{5}", "g"),
  },
  {
    id: "github-token",
    pattern: new RegExp("\\bgh(?:p|o|u|s|r)_[A-Za-z0-9]{30,}\\b", "g"),
  },
  {
    id: "github-fine-grained-token",
    pattern: new RegExp("\\bgithub_pat_[A-Za-z0-9_]{40,}\\b", "g"),
  },
  {
    id: "aws-access-key",
    pattern: new RegExp("\\b(?:AKIA|ASIA)[A-Z0-9]{16}\\b", "g"),
  },
  {
    id: "slack-token",
    pattern: new RegExp("\\bxox[baprs]-[A-Za-z0-9-]{20,}\\b", "g"),
  },
  {
    id: "stripe-live-secret",
    pattern: new RegExp("\\bsk_live_[A-Za-z0-9]{20,}\\b", "g"),
  },
  {
    id: "credential-url",
    pattern: /\b(?:postgres(?:ql)?|mysql|mongodb(?:\+srv)?|redis):\/\/[^\s:/]+:([^\s@]+)@([^\s/]+)/gi,
    validate(match) {
      const password = match[1] ?? "";
      const host = (match[2] ?? "").split(":")[0] ?? "";
      return !PLACEHOLDER_VALUE.test(password) && !/^(?:127\.0\.0\.1|localhost)$/i.test(host);
    },
  },
];

const ASSIGNMENT_SECRET_RULES = [
  {
    id: "named-secret",
    pattern: /\b(?:access[_-]?token|refresh[_-]?token|client[_-]?secret|webhook[_-]?secret|api[_-]?key|password|authorization)\b\s*(?:=|:)\s*["']?([^\s,"'\]}]{20,})/gi,
    validate(match) {
      const value = match[1] ?? "";
      return !PLACEHOLDER_VALUE.test(value) &&
        !/(?:test|example|dummy|placeholder|redacted|sample|fake|local|fixture)/i.test(value) &&
        !/^\$\{?[A-Z0-9_]+\}?$/i.test(value);
    },
  },
];

const OUTPUT_PII_RULES = [
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
    pattern: /\b(?:customer[_-]?message|message[_-]?body|payment[_-]?evidence)\b\s*(?:=|:)\s*["']?([^\n\r]{12,})/gi,
    validate(match) {
      const value = (match[1] ?? "").trim();
      return !PLACEHOLDER_VALUE.test(value) && !/^\[REDACTED/i.test(value);
    },
  },
];

function cloneGlobalRegex(pattern) {
  const flags = pattern.flags.includes("g") ? pattern.flags : `${pattern.flags}g`;
  return new RegExp(pattern.source, flags);
}

export function findSensitiveText(
  text,
  { includePii = false, includeAssignments = true } = {},
) {
  const findings = [];
  const rules = [
    ...HIGH_CONFIDENCE_SECRET_RULES,
    ...(includeAssignments ? ASSIGNMENT_SECRET_RULES : []),
    ...(includePii ? OUTPUT_PII_RULES : []),
  ];

  for (const rule of rules) {
    const pattern = cloneGlobalRegex(rule.pattern);
    for (const match of text.matchAll(pattern)) {
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

export function redactSensitiveText(
  text,
  { includePii = true, includeAssignments = true } = {},
) {
  const findings = findSensitiveText(text, { includePii, includeAssignments });
  if (findings.length === 0) return { text, findings };

  let cursor = 0;
  const parts = [];
  for (const finding of findings) {
    if (finding.index < cursor) continue;
    parts.push(text.slice(cursor, finding.index));
    parts.push(`[REDACTED:${finding.rule}]`);
    cursor = finding.index + finding.length;
  }
  parts.push(text.slice(cursor));

  return { text: parts.join(""), findings };
}

export function summarizeFindings(findings) {
  const counts = new Map();
  for (const finding of findings) {
    counts.set(finding.rule, (counts.get(finding.rule) ?? 0) + 1);
  }
  return [...counts.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([rule, count]) => ({ rule, count }));
}
