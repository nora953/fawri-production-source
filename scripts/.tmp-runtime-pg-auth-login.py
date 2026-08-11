from pathlib import Path

path = Path('artifacts/api-server/src/routes/auth-login-route-support.ts')
text = path.read_text(encoding='utf-8')

old_import = '''import { operationalPostgresAuthorityRequired } from "../services/operationalPostgresAuthority";\n'''
new_import = '''import { operationalPostgresAuthorityRequired } from "../services/operationalPostgresAuthority";\nimport {\n  checkMerchantLoginAllowedAuthoritative,\n  recordMerchantLoginAttemptAuthoritative,\n} from "../services/postgresMerchantAuthSecurityAuthority";\n'''
if text.count(old_import) != 1:
    raise SystemExit('auth-login operational import target mismatch')
text = text.replace(old_import, new_import, 1)

old_allowed = '''  const allowed = authSecurityStore.checkLoginAllowed({\n    target: phone,\n    accountKind: kind,\n    ip: requestIp(req),\n  });\n'''
new_allowed = '''  const allowed = await checkMerchantLoginAllowedAuthoritative({\n    target: phone,\n    accountKind: kind,\n    ip: requestIp(req),\n  });\n'''
if text.count(old_allowed) != 1:
    raise SystemExit('auth-login allow target mismatch')
text = text.replace(old_allowed, new_allowed, 1)

old_record = '''    authSecurityStore.recordLoginAttempt({\n      target: phone,\n      accountKind: kind,\n      ip: requestIp(req),\n      success: false,\n      reason: "invalid_credentials",\n      ...(found ? { accountId: found.account.id } : {}),\n    });\n'''
new_record = '''    await recordMerchantLoginAttemptAuthoritative({\n      target: phone,\n      accountKind: kind,\n      ip: requestIp(req),\n      success: false,\n      reason: "invalid_credentials",\n      ...(found ? { accountId: found.account.id } : {}),\n    });\n'''
if text.count(old_record) != 1:
    raise SystemExit('invalid-credentials record target mismatch')
text = text.replace(old_record, new_record, 1)

old_device = '''      authSecurityStore.recordLoginAttempt({\n        target: phone,\n        accountKind: kind,\n        ip: requestIp(req),\n        success: false,\n        reason: "device_approval_required",\n        accountId: found.account.id,\n      });\n'''
new_device = '''      await recordMerchantLoginAttemptAuthoritative({\n        target: phone,\n        accountKind: kind,\n        ip: requestIp(req),\n        success: false,\n        reason: "device_approval_required",\n        accountId: found.account.id,\n      });\n'''
if text.count(old_device) != 1:
    raise SystemExit('device-approval record target mismatch')
text = text.replace(old_device, new_device, 1)

old_success = '''  authSecurityStore.recordLoginAttempt({\n    target: phone,\n    accountKind: kind,\n    ip: requestIp(req),\n    success: true,\n    reason: "valid_credentials",\n    accountId: found.account.id,\n  });\n'''
new_success = '''  await recordMerchantLoginAttemptAuthoritative({\n    target: phone,\n    accountKind: kind,\n    ip: requestIp(req),\n    success: true,\n    reason: "valid_credentials",\n    accountId: found.account.id,\n  });\n'''
if text.count(old_success) != 1:
    raise SystemExit('successful-login record target mismatch')
text = text.replace(old_success, new_success, 1)

path.write_text(text, encoding='utf-8')
