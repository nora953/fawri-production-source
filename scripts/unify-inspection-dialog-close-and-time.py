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
    "  const locale = lang === 'en' ? 'en-US' : lang === 'ku' ? 'ckb-IQ' : 'ar-IQ';\n  const inspectionText = lang === 'en' ? INSPECTION_TEXT.en : lang === 'ku' ? INSPECTION_TEXT.ku : INSPECTION_TEXT.ar;\n",
    "  const locale = lang === 'en' ? 'en-US' : lang === 'ku' ? 'ckb-IQ' : 'ar-IQ';\n  const inspectionDateTimeFormatter = useMemo(\n    () =>\n      new Intl.DateTimeFormat(locale, {\n        year: 'numeric',\n        month: '2-digit',\n        day: '2-digit',\n        hour: '2-digit',\n        minute: '2-digit',\n        hour12: false,\n      }),\n    [locale],\n  );\n  const formatInspectionDateTime = (value: string) =>\n    inspectionDateTimeFormatter.format(new Date(value));\n  const inspectionText = lang === 'en' ? INSPECTION_TEXT.en : lang === 'ku' ? INSPECTION_TEXT.ku : INSPECTION_TEXT.ar;\n",
    'add inspection date formatter',
)

replace_once(
    "                      closeButtonClassName={dir === 'rtl' ? 'top-2.5 left-4 right-auto' : 'top-2.5 left-auto right-4'}\n",
    "                      closeButtonClassName={dir === 'rtl' ? 'left-4 right-auto top-3' : 'left-auto right-4 top-3'}\n",
    'unify close button height',
)

replace_once(
    "                      <DialogHeader>\n                        <DialogTitle className=\"text-start\">{inspectionText.title}</DialogTitle>\n                      </DialogHeader>\n",
    "                      <DialogHeader className=\"min-h-10 justify-center\">\n                        <DialogTitle className=\"pe-12 text-start\">{inspectionText.title}</DialogTitle>\n                      </DialogHeader>\n",
    'standardize inspection dialog header height',
)

for old, new, label in [
    (
        "{inspectionText.decisionAt}: {new Date(latestInspectionRequest.responded_at).toLocaleString(locale)}",
        "{inspectionText.decisionAt}: {formatInspectionDateTime(latestInspectionRequest.responded_at)}",
        'format inspection decision time',
    ),
    (
        "{inspectionText.endedAt}: {new Date(latestInspectionRequest.ended_at).toLocaleString(locale)}",
        "{inspectionText.endedAt}: {formatInspectionDateTime(latestInspectionRequest.ended_at)}",
        'format inspection end time',
    ),
    (
        "{inspectionText.requestExpires}: {new Date(latestInspectionRequest.request_expires_at).toLocaleString(locale)}",
        "{inspectionText.requestExpires}: {formatInspectionDateTime(latestInspectionRequest.request_expires_at)}",
        'format inspection request expiry',
    ),
    (
        "{inspectionText.approvedUntil}: {new Date(latestInspectionRequest.session_expires_at).toLocaleString(locale)}",
        "{inspectionText.approvedUntil}: {formatInspectionDateTime(latestInspectionRequest.session_expires_at)}",
        'format inspection approval expiry',
    ),
]:
    replace_once(old, new, label)

path.write_text(text, encoding='utf-8')
print('Unified the inspection dialog close button height and localized inspection times.')
