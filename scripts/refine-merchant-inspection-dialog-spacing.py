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
    "                      closeButtonClassName={dir === 'rtl' ? 'left-4 right-auto' : 'left-auto right-4'}\n",
    "                      closeButtonClassName={dir === 'rtl' ? 'top-2.5 left-4 right-auto' : 'top-2.5 left-auto right-4'}\n",
    'raise inspection dialog close button',
)

replace_once(
    "                      <div className={`rounded-xl border p-4 ${latestInspectionToneClass}`}>\n",
    "                      <div className={`rounded-xl border px-4 pb-4 pt-3 ${latestInspectionToneClass}`}>\n",
    'tighten inspection details card top spacing',
)

replace_once(
    "                          <p className=\"mt-2 text-xs text-muted-foreground\">\n                            {inspectionText.decisionAt}: {new Date(latestInspectionRequest.responded_at).toLocaleString(locale)}\n                          </p>\n",
    "                          <p className=\"mt-2 pb-1 text-xs text-muted-foreground\">\n                            {inspectionText.decisionAt}: {new Date(latestInspectionRequest.responded_at).toLocaleString(locale)}\n                          </p>\n",
    'add spacing below merchant decision time',
)

path.write_text(text, encoding='utf-8')
print('Refined merchant inspection dialog close button and spacing.')
