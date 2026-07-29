from pathlib import Path

path = Path('artifacts/fawri/src/components/admin/AdministratorsTab.tsx')
text = path.read_text(encoding='utf-8')
old = '''  const permissionList: readonly AdminPermission[] = [
    "view_merchants",
    "manage_merchant_status",
    "manage_subscriptions",
    "manage_channels",
    "view_logs",
    "inspect_merchant_sessions",
  ];
'''
new = '''  const permissionList: readonly AdminPermission[] = [
    "view_merchants",
    "manage_merchant_status",
    "manage_subscriptions",
    "manage_channels",
    "view_logs",
    "inspect_merchant_sessions",
    "manage_support",
  ];
'''
count = text.count(old)
if count != 1:
    raise RuntimeError(f'permission list: expected one match, found {count}')
path.write_text(text.replace(old, new, 1), encoding='utf-8')
print('Added manage_support to the assistant permission list.')
