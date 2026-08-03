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
      db,
      persistedAdmin,
      { id: persistedAdmin.id, store_name: persistedAdmin.owner_name },
      "assistant_admin_password_changed",
      "assistant administrator replaced temporary password with a permanent password",
      {
        meta: {
          assistant_admin_id: persistedAdmin.id,
          assistant_admin_phone: persistedAdmin.phone,
        },
      },
    );
    writeDb(db);
''',
    "assistant permanent password audit log",
)

admin_page_path = Path("artifacts/fawri/src/pages/AdminPage.tsx")
replace_once(
    admin_page_path,
    '''    assistant_admin_password_reset:
      adminText.logsActionAssistantPasswordReset,
''',
    '''    assistant_admin_password_reset:
      adminText.logsActionAssistantPasswordReset,
    assistant_admin_password_changed:
      adminText.logsActionAssistantPasswordChanged,
''',
    "admin log action mapping",
)
replace_once(
    admin_page_path,
    '''      case "assistant_admin_password_reset":
        return adminText.logAssistantAdminPasswordReset;
''',
    '''      case "assistant_admin_password_reset":
        return adminText.logAssistantAdminPasswordReset;

      case "assistant_admin_password_changed":
        return adminText.logAssistantAdminPasswordChanged;
''',
    "admin log localized details",
)

translations_path = Path("artifacts/fawri/src/lib/admin-translations.ts")
replace_once(
    translations_path,
    '    logsActionAssistantPasswordReset: "تغيير كلمة مرور مسؤول مساعد",\n',
    '    logsActionAssistantPasswordReset: "تغيير كلمة مرور مسؤول مساعد",\n    logsActionAssistantPasswordChanged: "إكمال تغيير كلمة مرور المسؤول المساعد",\n',
    "Arabic action label",
)
replace_once(
    translations_path,
    '''    logAssistantAdminPasswordReset:
      "تم تعيين كلمة مرور مؤقتة للمسؤول المساعد وإلغاء جلساته القديمة",
''',
    '''    logAssistantAdminPasswordReset:
      "تم تعيين كلمة مرور مؤقتة للمسؤول المساعد وإلغاء جلساته القديمة",
    logAssistantAdminPasswordChanged:
      "تم استبدال كلمة المرور المؤقتة بكلمة مرور دائمة وإلغاء الجلسة المؤقتة",
''',
    "Arabic action details",
)
replace_once(
    translations_path,
    '    logsActionAssistantPasswordReset: "Assistant password changed",\n',
    '    logsActionAssistantPasswordReset: "Assistant password changed",\n    logsActionAssistantPasswordChanged: "Assistant permanent password completed",\n',
    "English action label",
)
replace_once(
    translations_path,
    '''    logAssistantAdminPasswordReset:
      "A temporary password was issued and the assistant administrator sessions were revoked.",
''',
    '''    logAssistantAdminPasswordReset:
      "A temporary password was issued and the assistant administrator sessions were revoked.",
    logAssistantAdminPasswordChanged:
      "The temporary password was replaced with a permanent password and the temporary session was revoked.",
''',
    "English action details",
)
replace_once(
    translations_path,
    '  logsActionAssistantPasswordReset: "گۆڕینی وشەی نهێنی بەڕێوەبەری یاریدەدەر",\n',
    '  logsActionAssistantPasswordReset: "گۆڕینی وشەی نهێنی بەڕێوەبەری یاریدەدەر",\n  logsActionAssistantPasswordChanged: "تەواوکردنی گۆڕینی وشەی نهێنی بەڕێوەبەری یاریدەدەر",\n',
    "Kurdish action label",
)
replace_once(
    translations_path,
    '''  logAssistantAdminPasswordReset:
    "وشەی نهێنی کاتی دانرا و دانیشتنە کۆنەکانی بەڕێوەبەری یاریدەدەر هەڵوەشێنرانەوە",
''',
    '''  logAssistantAdminPasswordReset:
    "وشەی نهێنی کاتی دانرا و دانیشتنە کۆنەکانی بەڕێوەبەری یاریدەدەر هەڵوەشێنرانەوە",
  logAssistantAdminPasswordChanged:
    "وشەی نهێنی کاتی بە وشەی نهێنی هەمیشەیی گۆڕدرا و دانیشتنی کاتی هەڵوەشێنرایەوە",
''',
    "Kurdish action details",
)

test_path = Path("artifacts/api-server/tests/admin-password-reset.integration.test.mjs")
replace_once(
    test_path,
    '''  assert.equal(JSON.stringify(resetLog).includes("Temporary2@"), false);
  assert.equal(JSON.stringify(resetLog).includes("OwnerPass1@"), false);

  const persisted = JSON.parse(
''',
    '''  assert.equal(JSON.stringify(resetLog).includes("Temporary2@"), false);
  assert.equal(JSON.stringify(resetLog).includes("OwnerPass1@"), false);

  const permanentPasswordLog = ownerLogs.body.logs.find(
    (log) => log.action_type === "assistant_admin_password_changed",
  );
  assert.ok(permanentPasswordLog);
  assert.equal(permanentPasswordLog.admin_id, "assistant-admin");
  assert.equal(permanentPasswordLog.merchant_id, "assistant-admin");
  assert.equal(
    JSON.stringify(permanentPasswordLog).includes("Temporary2@"),
    false,
  );
  assert.equal(
    JSON.stringify(permanentPasswordLog).includes("Permanent3@"),
    false,
  );
  assert.equal(
    JSON.stringify(permanentPasswordLog).includes("OwnerPass1@"),
    false,
  );

  const persisted = JSON.parse(
''',
    "permanent password audit test",
)

print("Assistant permanent password audit logging applied.")
