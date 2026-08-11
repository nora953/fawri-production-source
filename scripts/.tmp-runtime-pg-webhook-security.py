from pathlib import Path

path = Path('artifacts/api-server/src/middleware/metaWebhookSecurity.ts')
text = path.read_text(encoding='utf-8')

replacements = [
('''import { isTrustedMetaWebhookInternalReplay } from "../services/metaWebhookInternalReplay";\n''', '''import { isTrustedMetaWebhookInternalReplay } from "../services/metaWebhookInternalReplay";\nimport { operationalPostgresAuthorityRequired } from "../services/operationalPostgresAuthority";\n'''),
('''  if (normalizedIds.length === 0) return;\n\n  const storePath = getFawriDataFilePath("processed-meta-events.json");\n''', '''  if (normalizedIds.length === 0 || operationalPostgresAuthorityRequired()) return;\n\n  const storePath = getFawriDataFilePath("processed-meta-events.json");\n'''),
('''function filterDuplicateEvents(body: Record<string, unknown>): {\n  body: Record<string, unknown>;\n  accepted: number;\n  duplicates: number;\n  acceptedEventIds: string[];\n} {\n  const storePath = getFawriDataFilePath("processed-meta-events.json");\n''', '''function filterDuplicateEvents(body: Record<string, unknown>): {\n  body: Record<string, unknown>;\n  accepted: number;\n  duplicates: number;\n  acceptedEventIds: string[];\n} {\n  if (operationalPostgresAuthorityRequired()) {\n    const acceptedEventIds: string[] = [];\n    for (const entryValue of Array.isArray(body.entry) ? body.entry : []) {\n      const entry = entryValue && typeof entryValue === "object"\n        ? (entryValue as Record<string, unknown>)\n        : {};\n      const pageId = String(entry.id || "").trim();\n      for (const event of Array.isArray(entry.messaging) ? entry.messaging : []) {\n        acceptedEventIds.push(getMetaWebhookEventId(pageId, event));\n      }\n    }\n    return {\n      body,\n      accepted: acceptedEventIds.length,\n      duplicates: 0,\n      acceptedEventIds,\n    };\n  }\n\n  const storePath = getFawriDataFilePath("processed-meta-events.json");\n'''),
]

for old, new in replacements:
    count = text.count(old)
    if count != 1:
        raise SystemExit(f'expected webhook-security target exactly once, found {count}: {old[:90]!r}')
    text = text.replace(old, new, 1)

path.write_text(text, encoding='utf-8')
