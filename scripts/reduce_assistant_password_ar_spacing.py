from pathlib import Path

path = Path("artifacts/fawri/src/components/admin/AssistantPasswordResetDialog.tsx")
text = path.read_text()
old = 'className={lang === "ar" ? "space-y-3" : "space-y-2"}'
new = 'className={lang === "ar" ? "space-y-1" : "space-y-2"}'
count = text.count(old)
if count != 3:
    raise SystemExit(f"Expected 3 Arabic spacing blocks, found {count}")
path.write_text(text.replace(old, new))
print("Arabic assistant-password spacing reduced from 12px to 4px.")
