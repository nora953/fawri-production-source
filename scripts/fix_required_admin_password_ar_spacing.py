from pathlib import Path

path = Path("artifacts/fawri/src/components/admin/RequiredAdminPasswordChangeDialog.tsx")
text = path.read_text()

old_block = '<div className="space-y-2">'
new_block = '<div className={lang === "ar" ? "space-y-1" : "space-y-2"}>'
count = text.count(old_block)
if count != 2:
    raise SystemExit(f"Expected 2 password field blocks, found {count}")
text = text.replace(old_block, new_block)

labels = [
    '<Label htmlFor="required-admin-new-password">{text.password}</Label>',
    '<Label htmlFor="required-admin-confirm-password">{text.confirm}</Label>',
]

for label in labels:
    if text.count(label) != 1:
        raise SystemExit(f"Expected one label match: {label}")
    opening, content = label.split(">", 1)
    text = text.replace(
        label,
        f'{opening} className={{lang === "ar" ? "block leading-6" : undefined}}>{content}',
        1,
    )

path.write_text(text)
print("Required admin password Arabic field spacing aligned with approved dialog.")
