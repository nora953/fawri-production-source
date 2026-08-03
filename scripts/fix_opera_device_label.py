from pathlib import Path

path = Path("artifacts/fawri/src/lib/store.ts")
text = path.read_text(encoding="utf-8")

old = '''  const browser = /Edg\\//i.test(userAgent)
    ? 'Edge'
    : /Firefox\\//i.test(userAgent)
      ? 'Firefox'
      : /Chrome\\//i.test(userAgent)
        ? 'Chrome'
        : /Safari\\//i.test(userAgent)
          ? 'Safari'
          : 'Browser';
'''

new = '''  const browser = /OPR\\/|Opera\\//i.test(userAgent)
    ? 'Opera'
    : /Edg\\//i.test(userAgent)
      ? 'Edge'
      : /Firefox\\//i.test(userAgent)
        ? 'Firefox'
        : /Chrome\\//i.test(userAgent)
          ? 'Chrome'
          : /Safari\\//i.test(userAgent)
            ? 'Safari'
            : 'Browser';
'''

count = text.count(old)
if count != 1:
    raise SystemExit(f"browser detection block: expected one match, found {count}")

updated = text.replace(old, new, 1)

opera_index = updated.index("/OPR\\/|Opera\\//i")
chrome_index = updated.index("/Chrome\\//i", opera_index)
if opera_index >= chrome_index:
    raise SystemExit("Opera detection must run before Chrome detection")

path.write_text(updated, encoding="utf-8")
print("Opera administrator device label detection fixed.")
