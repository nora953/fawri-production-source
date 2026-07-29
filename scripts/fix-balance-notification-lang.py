from pathlib import Path

path = Path('artifacts/fawri/src/components/layout/DashboardLayout.tsx')
text = path.read_text(encoding='utf-8')
old = "  const { t, dir } = useI18n();"
new = "  const { t, dir, lang } = useI18n();"
count = text.count(old)
if count != 1:
    raise RuntimeError(f'language binding: expected one match, found {count}')
path.write_text(text.replace(old, new, 1), encoding='utf-8')
print('Fixed dashboard notification language binding.')
