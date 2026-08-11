from pathlib import Path

path = Path('artifacts/api-server/src/services/metaWebhookWorkerCore.ts')
text = path.read_text(encoding='utf-8')

replacements = [
('''import { getMerchantOperationalDecision } from "./merchantOperationalAccess";\nimport {\n  getMerchantOperationalSettings,\n  type MerchantOperationalSettings,\n} from "./merchantSettingsRuntime";\n''', '''import {\n  getMerchantOperationalDecisionAuthoritative,\n} from "./merchantOperationalAccess";\nimport {\n  type MerchantOperationalSettings,\n} from "./merchantSettingsRuntime";\nimport {\n  getMerchantOperationalSettingsAuthoritative,\n} from "./postgresMerchantSettingsAuthority";\n'''),
('''function readSettings(merchantId: string): MerchantOperationalSettings {\n  try {\n    return getMerchantOperationalSettings(merchantId);\n  } catch {\n    throw jobError(\n      "MERCHANT_SETTINGS_UNAVAILABLE",\n      "merchant settings are unavailable",\n      true,\n      true,\n    );\n  }\n}\n''', '''async function readSettings(merchantId: string): Promise<MerchantOperationalSettings> {\n  try {\n    return await getMerchantOperationalSettingsAuthoritative(merchantId);\n  } catch {\n    throw jobError(\n      "MERCHANT_SETTINGS_UNAVAILABLE",\n      "merchant settings are unavailable",\n      true,\n      true,\n    );\n  }\n}\n'''),
('''  const access = getMerchantOperationalDecision(merchantId);\n''', '''  const access = await getMerchantOperationalDecisionAuthoritative(merchantId);\n'''),
('''  const claimedSettings = readSettings(merchantId);\n''', '''  const claimedSettings = await readSettings(merchantId);\n'''),
('''  const beforeReservation = readSettings(merchantId);\n''', '''  const beforeReservation = await readSettings(merchantId);\n'''),
('''      beforeSend: () => {\n        const immediatelyBeforeSend = readSettings(merchantId);\n        const code = settingsSuppressionCode(\n          claimedSettings.version,\n          immediatelyBeforeSend,\n        );\n''', '''      beforeSend: async () => {\n        const immediatelyBeforeSend = await readSettings(merchantId);\n        const code = settingsSuppressionCode(\n          claimedSettings.version,\n          immediatelyBeforeSend,\n        );\n'''),
]

for old, new in replacements:
    count = text.count(old)
    if count != 1:
        raise SystemExit(f'expected worker-core target exactly once, found {count}: {old[:80]!r}')
    text = text.replace(old, new, 1)

path.write_text(text, encoding='utf-8')
