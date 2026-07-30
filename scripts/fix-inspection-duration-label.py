from pathlib import Path

path = Path('artifacts/fawri/src/components/admin/AdminSupportTab.tsx')
text = path.read_text(encoding='utf-8')


def replace_once(old: str, new: str, label: str) -> None:
    global text
    count = text.count(old)
    if count != 1:
        raise RuntimeError(f'{label}: expected one match, found {count}')
    text = text.replace(old, new, 1)


replace_once(
    "    inspectionDuration: 'المدة عند الموافقة: 30 دقيقة',\n",
    "    inspectionDuration: 'مدة الموافقة',\n    inspectionMinutes: 'دقيقة',\n",
    'Arabic inspection duration text',
)
replace_once(
    "    inspectionDuration: 'ماوە لە دوای ڕەزامەندی: 30 خولەک',\n",
    "    inspectionDuration: 'ماوەی ڕەزامەندی',\n    inspectionMinutes: 'خولەک',\n",
    'Kurdish inspection duration text',
)
replace_once(
    "    inspectionDuration: 'Duration after approval: 30 minutes',\n",
    "    inspectionDuration: 'Approval duration',\n    inspectionMinutes: 'minutes',\n",
    'English inspection duration text',
)
replace_once(
    """                      <span><strong className=\"text-foreground\">{text.inspectionDuration}:</strong> 30</span>
""",
    """                      <span><strong className=\"text-foreground\">{text.inspectionDuration}:</strong> {request.session_duration_minutes} {text.inspectionMinutes}</span>
""",
    'inspection duration rendering',
)

path.write_text(text, encoding='utf-8')
print('Fixed inspection duration label in Arabic, Kurdish, and English.')
