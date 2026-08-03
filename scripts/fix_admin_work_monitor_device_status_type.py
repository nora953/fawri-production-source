from pathlib import Path

path = Path("artifacts/api-server/src/services/adminWorkMonitor.ts")
text = path.read_text()
old = '''  const devices = Array.isArray(source.devices)
    ? source.devices
        .filter(
          (item): item is AdminTrustedDevice =>
            Boolean(
              item &&
                typeof item === "object" &&
                typeof item.id === "string" &&
                typeof item.admin_id === "string" &&
                typeof item.device_id === "string",
            ),
        )
        .map((item) => ({
'''
new = '''  const devices = Array.isArray(source.devices)
    ? source.devices
        .filter(
          (item): item is AdminTrustedDevice =>
            Boolean(
              item &&
                typeof item === "object" &&
                typeof item.id === "string" &&
                typeof item.admin_id === "string" &&
                typeof item.device_id === "string",
            ),
        )
        .map((item): AdminTrustedDevice => ({
'''
count = text.count(old)
if count != 1:
    raise SystemExit(f"Expected one devices normalization block, found {count}")
path.write_text(text.replace(old, new, 1))
print("Admin trusted-device status type fixed.")
