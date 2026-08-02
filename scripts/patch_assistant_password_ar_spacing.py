from pathlib import Path

path = Path("artifacts/fawri/src/components/admin/AssistantPasswordResetDialog.tsx")
text = path.read_text()

field_block = '<div className="space-y-2">'
if text.count(field_block) != 3:
    raise SystemExit(
        f"Expected 3 password field blocks, found {text.count(field_block)}"
    )
text = text.replace(
    field_block,
    '<div className={lang === "ar" ? "space-y-3" : "space-y-2"}>',
)

labels = [
    '<Label htmlFor="owner-confirm-password">{text.ownerPassword}</Label>',
    '<Label htmlFor="assistant-temporary-password">{text.temporaryPassword}</Label>',
    '<Label htmlFor="assistant-temporary-password-confirm">{text.confirmPassword}</Label>',
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
print("Arabic assistant-password field spacing applied.")
