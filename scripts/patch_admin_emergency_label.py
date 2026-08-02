from pathlib import Path

path = Path("artifacts/fawri/src/lib/admin-translations.ts")
text = path.read_text()
old = '    detailsEmergencyCredit: "رصيد طارئ",\n'
new = '    detailsEmergencyCredit: "رصيد الطوارئ",\n'
count = text.count(old)
if count != 1:
    raise SystemExit(f"Expected exactly one Arabic emergency label, found {count}")
path.write_text(text.replace(old, new, 1))
print("Admin Arabic emergency label updated.")
