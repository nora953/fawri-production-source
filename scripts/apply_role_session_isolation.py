from __future__ import annotations

import runpy
from pathlib import Path

ROOT = Path("/home/runner/workspace") if Path("/home/runner/workspace").exists() else Path.cwd()
BASE_PATCH = ROOT / "scripts/fix_role_session_isolation.py"
DASHBOARD = ROOT / "artifacts/fawri/src/components/layout/DashboardLayout.tsx"

if not BASE_PATCH.exists():
    raise SystemExit("Base role-session isolation patch is missing")

runpy.run_path(str(BASE_PATCH), run_name="__main__")

text = DASHBOARD.read_text(encoding="utf-8")
old = """export function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { t } = useI18n();
"""
new = """export function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { lang } = useI18n();
"""
if text.count(old) != 1:
    raise SystemExit("Dashboard access-check translation hook was not found exactly once")
text = text.replace(old, new, 1)

old_loading = """        {t.app_loading}
"""
new_loading = """        {lang === 'en' ? 'Checking account access…' : lang === 'ku' ? 'پشکنینی دەستگەیشتن بە هەژمار…' : 'جارٍ التحقق من صلاحية الدخول…'}
"""
if text.count(old_loading) != 1:
    raise SystemExit("Dashboard loading label was not found exactly once")
text = text.replace(old_loading, new_loading, 1)
DASHBOARD.write_text(text, encoding="utf-8")

print("Role and cross-tab session isolation patch finalized.")
