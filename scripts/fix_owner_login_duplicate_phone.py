from pathlib import Path


def replace_once(path: Path, old: str, new: str, label: str) -> None:
    text = path.read_text()
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"{label}: expected exactly one match, found {count}")
    path.write_text(text.replace(old, new, 1))


auth = Path("artifacts/api-server/src/routes/auth.ts")
replace_once(
    auth,
    '''  const db = ensureDb();
  const matchingAccount = db.merchants.find(
    (item) => normalizePhone(item.phone) === phone,
  );
  const merchant =
    matchingAccount && verifyPassword(password, matchingAccount.password)
      ? matchingAccount
      : undefined;

  if (!merchant) {
    if (matchingAccount?.is_admin === true) {
      const device = getAdminDeviceContext(req);
      recordAdminFailedLogin({
        adminId: matchingAccount.id,
        phone,
        deviceId: device.deviceId,
        deviceLabel: device.deviceLabel,
        reason: "invalid_credentials",
      });
    }
''',
    '''  const db = ensureDb();
  const matchingAccounts = db.merchants.filter(
    (item) => normalizePhone(item.phone) === phone,
  );
  const merchant = matchingAccounts.find((item) =>
    verifyPassword(password, item.password),
  );

  if (!merchant) {
    const matchingAdmin = matchingAccounts.find(
      (item) => item.is_admin === true,
    );
    if (matchingAdmin) {
      const device = getAdminDeviceContext(req);
      recordAdminFailedLogin({
        adminId: matchingAdmin.id,
        phone,
        deviceId: device.deviceId,
        deviceLabel: device.deviceLabel,
        reason: "invalid_credentials",
      });
    }
''',
    "login account matching",
)

test_file = Path(
    "artifacts/api-server/tests/admin-work-monitor.integration.test.mjs"
)
replace_once(
    test_file,
    '''      merchants: [
        {
          ...baseAdmin,
          id: "owner-admin",
''',
    '''      merchants: [
        {
          id: "duplicate-merchant",
          owner_name: "Duplicate phone merchant",
          store_name: "Duplicate Store",
          phone: "07111111111",
          password: "DifferentPass1@",
          activity_type: "retail",
          status: "approved",
          language: "en",
          theme_preference: "auto",
          created_at: "2026-08-02T00:00:00.000Z",
          otp_verified: true,
          warning_stage: 0,
          retention_status: "protected",
        },
        {
          ...baseAdmin,
          id: "owner-admin",
''',
    "duplicate-phone regression fixture",
)
replace_once(
    test_file,
    '''  const ownerLogin = await login("07111111111", "OwnerPass1@");
  assert.equal(ownerLogin.response.status, 200);
  const ownerHeaders = {
''',
    '''  const ownerLogin = await login("07111111111", "OwnerPass1@");
  assert.equal(ownerLogin.response.status, 200);
  assert.equal(ownerLogin.body.merchant.id, "owner-admin");
  assert.equal(ownerLogin.body.merchant.admin_role, "owner_admin");
  const ownerHeaders = {
''',
    "owner duplicate-phone regression assertion",
)

print("Owner login duplicate-phone matching fixed.")
