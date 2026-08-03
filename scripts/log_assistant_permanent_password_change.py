from pathlib import Path


def replace_once(path: Path, old: str, new: str, label: str) -> None:
    text = path.read_text()
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"{label}: expected exactly one match, found {count}")
    path.write_text(text.replace(old, new, 1))


auth_path = Path("artifacts/api-server/src/routes/auth.ts")
replace_once(
    auth_path,
    '''    persistedAdmin.password = hashPassword(newPassword);
    persistedAdmin.must_change_password = false;
    revokeAdminSessions(persistedAdmin);
    writeDb(db);
''',
    '''    persistedAdmin.password = hashPassword(newPassword);
    persistedAdmin.must_change_password = false;
    revokeAdminSessions(persistedAdmin);
    appendAdminLog(
     