from pathlib import Path

path = Path('artifacts/fawri/src/pages/dashboard/SupportPage.tsx')
text = path.read_text(encoding='utf-8')


def replace_once(old: str, new: str, label: str) -> None:
    global text
    count = text.count(old)
    if count != 1:
        raise RuntimeError(f'{label}: expected one match, found {count}')
    text = text.replace(old, new, 1)


replace_once(
    "  const formatInspectionDateTime = (value: string) =>\n    inspectionDateTimeFormatter.format(new Date(value));\n",
    "  const kurdishInspectionDateTimeFormatter = useMemo(\n    () =>\n      new Intl.DateTimeFormat('en-CA-u-ca-gregory-nu-latn', {\n        year: 'numeric',\n        month: '2-digit',\n        day: '2-digit',\n        hour: '2-digit',\n        minute: '2-digit',\n        hourCycle: 'h23',\n      }),\n    [],\n  );\n  const formatInspectionDateTime = (value: string) => {\n    const date = new Date(value);\n    if (lang !== 'ku') return inspectionDateTimeFormatter.format(date);\n\n    const parts = kurdishInspectionDateTimeFormatter.formatToParts(date);\n    const part = (type: Intl.DateTimeFormatPartTypes) =>\n      parts.find((item) => item.type === type)?.value ?? '';\n\n    return `${part('year')}/${part('month')}/${part('day')} — ${part('hour')}:${part('minute')}`;\n  };\n",
    'add fixed Kurdish date-time format',
)

replacements = [
    (
        "{inspectionText.decisionAt}: {formatInspectionDateTime(latestInspectionRequest.responded_at)}",
        "{inspectionText.decisionAt}: <bdi dir=\"ltr\">{formatInspectionDateTime(latestInspectionRequest.responded_at)}</bdi>",
        'isolate decision time direction',
    ),
    (
        "{inspectionText.endedAt}: {formatInspectionDateTime(latestInspectionRequest.ended_at)}",
        "{inspectionText.endedAt}: <bdi dir=\"ltr\">{formatInspectionDateTime(latestInspectionRequest.ended_at)}</bdi>",
        'isolate end time direction',
    ),
    (
        "{inspectionText.requestExpires}: {formatInspectionDateTime(latestInspectionRequest.request_expires_at)}",
        "{inspectionText.requestExpires}: <bdi dir=\"ltr\">{formatInspectionDateTime(latestInspectionRequest.request_expires_at)}</bdi>",
        'isolate request expiry direction',
    ),
    (
        "{inspectionText.approvedUntil}: {formatInspectionDateTime(latestInspectionRequest.session_expires_at)}",
        "{inspectionText.approvedUntil}: <bdi dir=\"ltr\">{formatInspectionDateTime(latestInspectionRequest.session_expires_at)}</bdi>",
        'isolate approval expiry direction',
    ),
]

for old, new, label in replacements:
    replace_once(old, new, label)

path.write_text(text, encoding='utf-8')
print('Fixed Kurdish inspection date-time order and isolated numeric direction.')
