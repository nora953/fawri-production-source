from pathlib import Path

path = Path('artifacts/api-server/src/routes/auth-public-routes.ts')
text = path.read_text(encoding='utf-8')

old_import = '''import { operationalPostgresAuthorityRequired } from "../services/operationalPostgresAuthority";\n'''
new_import = '''import { operationalPostgresAuthorityRequired } from "../services/operationalPostgresAuthority";\nimport {\n  verifyMerchantOtpChallengeAuthoritative,\n} from "../services/postgresMerchantAuthSecurityAuthority";\n'''
if text.count(old_import) != 1:
    raise SystemExit('auth-public operational import target mismatch')
text = text.replace(old_import, new_import, 1)

old_call = '''  const result = authSecurityStore.verifyOtpChallenge({\n    challengeId,\n    target: phone,\n    purpose: "signup",\n    code,\n    ip: requestIp(req),\n  });\n'''
new_call = '''  const result = await verifyMerchantOtpChallengeAuthoritative({\n    challengeId,\n    target: phone,\n    purpose: "signup",\n    code,\n    ip: requestIp(req),\n  });\n'''
if text.count(old_call) != 1:
    raise SystemExit('signup OTP verify target mismatch')
text = text.replace(old_call, new_call, 1)

old_reset = '''  const result = authSecurityStore.verifyOtpChallenge({\n    challengeId,\n    target: phone,\n    purpose: "password_reset",\n    code,\n    ip: requestIp(req),\n  });\n'''
new_reset = '''  const result = await verifyMerchantOtpChallengeAuthoritative({\n    challengeId,\n    target: phone,\n    purpose: "password_reset",\n    code,\n    ip: requestIp(req),\n  });\n'''
if text.count(old_reset) != 1:
    raise SystemExit('password reset OTP verify target mismatch')
text = text.replace(old_reset, new_reset, 1)

path.write_text(text, encoding='utf-8')
