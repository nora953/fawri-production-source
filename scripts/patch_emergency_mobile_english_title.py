from pathlib import Path

path = Path("artifacts/fawri/src/components/EmergencyCredit.tsx")
text = path.read_text()
old = '''                      <DialogTitle className="text-xl leading-7">\n                        {t.activate_emergency}\n                      </DialogTitle>\n'''
new = '''                      <DialogTitle\n                        className={\n                          isRtl\n                            ? 'text-xl leading-7'\n                            : 'min-w-0 flex-1 whitespace-normal break-words pr-10 text-xl leading-7'\n                        }\n                      >\n                        {t.activate_emergency}\n                      </DialogTitle>\n'''
count = text.count(old)
if count != 1:
    raise SystemExit(f"expected 1 title match, found {count}")
path.write_text(text.replace(old, new, 1))
print("Emergency credit English mobile title wrapping applied.")
