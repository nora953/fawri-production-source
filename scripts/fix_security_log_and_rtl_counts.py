from pathlib import Path

ADMIN_PAGE = Path("artifacts/fawri/src/pages/AdminPage.tsx")
MONITOR_PAGE = Path("artifacts/fawri/src/pages/AdminWorkMonitorPage.tsx")


def replace_once(text: str, old: str, new: str, label: str) -> str:
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"{label}: expected exactly one match, found {count}")
    return text.replace(old, new, 1)


# ---------------------------------------------------------------------------
# 1. Localize Work Monitor security actions in the owner's main admin log.
# ---------------------------------------------------------------------------
admin = ADMIN_PAGE.read_text(encoding="utf-8")

security_maps = '''  const securityActionLabels: Record<string, string> =
    lang === "ar"
      ? {
          assistant_device_trusted: "منح الثقة لجهاز المسؤول المساعد",
          assistant_device_trust_revoked: "سحب الثقة من جهاز المسؤول المساعد",
          assistant_session_revoked: "إنهاء جلسة المسؤول المساعد",
          assistant_sessions_revoked: "إنهاء جميع جلسات المسؤول المساعد",
        }
      : lang === "ku"
        ? {
            assistant_device_trusted: "متمانەپێکردنی ئامێری بەڕێوەبەری یاریدەدەر",
            assistant_device_trust_revoked: "سەندنەوەی متمانە لە ئامێری بەڕێوەبەری یاریدەدەر",
            assistant_session_revoked: "کۆتاییهێنان بە دانیشتنی بەڕێوەبەری یاریدەدەر",
            assistant_sessions_revoked: "کۆتاییهێنان بە هەموو دانیشتنەکانی بەڕێوەبەری یاریدەدەر",
          }
        : {
            assistant_device_trusted: "Trust assistant device",
            assistant_device_trust_revoked: "Revoke assistant device trust",
            assistant_session_revoked: "Terminate assistant session",
            assistant_sessions_revoked: "Terminate all assistant sessions",
          };

  const securityActionDetails: Record<string, string> =
    lang === "ar"
      ? {
          assistant_device_trusted: "تم منح الثقة لجهاز المسؤول المساعد",
          assistant_device_trust_revoked: "تم سحب الثقة من جهاز المسؤول المساعد",
          assistant_session_revoked: "تم إنهاء جلسة المسؤول المساعد",
          assistant_sessions_revoked: "تم إنهاء جميع جلسات المسؤول المساعد",
        }
      : lang === "ku"
        ? {
            assistant_device_trusted: "متمانە بە ئامێری بەڕێوەبەری یاریدەدەر درا",
            assistant_device_trust_revoked: "متمانە لە ئامێری بەڕێوەبەری یاریدەدەر سەندرایەوە",
            assistant_session_revoked: "دانیشتنی بەڕێوەبەری یاریدەدەر کۆتایی پێ هات",
            assistant_sessions_revoked: "هەموو دانیشتنەکانی بەڕێوەبەری یاریدەدەر کۆتاییان پێ هات",
          }
        : {
            assistant_device_trusted: "The assistant administrator device was trusted",
            assistant_device_trust_revoked: "Trust was revoked from the assistant administrator device",
            assistant_session_revoked: "The assistant administrator session was terminated",
            assistant_sessions_revoked: "All assistant administrator sessions were terminated",
          };

'''

admin = replace_once(
    admin,
    '  const actionLabel: Record<string, string> = {\n',
    security_maps + '  const actionLabel: Record<string, string> = {\n',
    "owner log security translation maps",
)

# Add the new action labels to the existing owner-log label map without
# changing any older action mapping.
action_start = admin.index('  const actionLabel: Record<string, string> = {\n')
action_end = admin.index('\n  };', action_start)
action_block = admin[action_start:action_end]
if 'assistant_device_trusted:' in action_block:
    raise SystemExit("owner log action labels already contain the security actions")

action_insert = '''
    assistant_device_trusted: securityActionLabels.assistant_device_trusted,
    assistant_device_trust_revoked:
      securityActionLabels.assistant_device_trust_revoked,
    assistant_session_revoked: securityActionLabels.assistant_session_revoked,
    assistant_sessions_revoked:
      securityActionLabels.assistant_sessions_revoked,'''
admin = admin[:action_end] + action_insert + admin[action_end:]

admin = replace_once(
    admin,
    '''  const getLocalizedDetails = (log: AdminLog) => {
    const meta = log.meta ?? {};
''',
    '''  const getLocalizedDetails = (log: AdminLog) => {
    const localizedSecurityDetail = securityActionDetails[log.action_type];
    if (localizedSecurityDetail) return localizedSecurityDetail;

    const meta = log.meta ?? {};
''',
    "owner log localized security details",
)

ADMIN_PAGE.write_text(admin, encoding="utf-8")


# ---------------------------------------------------------------------------
# 2. Render limit counters in stable language-aware text instead of `1 / 2`.
#    Unicode isolates keep the numeric order correct inside RTL interfaces.
# ---------------------------------------------------------------------------
monitor = MONITOR_PAGE.read_text(encoding="utf-8")

count_helper = '''
function formatLimitCount(
  current: number,
  limit: number,
  lang: InterfaceLanguage,
): string {
  const currentNumber = `\\u2066${current}\\u2069`;
  const limitNumber = `\\u2066${limit}\\u2069`;

  if (lang === "en") return `${currentNumber} of ${limitNumber}`;
  if (lang === "ku") return `${currentNumber} لە ${limitNumber}`;
  return `${currentNumber} من ${limitNumber}`;
}
'''

monitor = replace_once(
    monitor,
    '''function logLabel(log: LogRecord, lang: InterfaceLanguage): string {
  const known = LOG_LABELS[lang][log.action_type];
  if (known) return known;
  if (lang === "en") return log.details || log.action_type.replace(/_/g, " ");
  return lang === "ku" ? "کردارێکی بەڕێوەبردن تۆمار کرا" : "تم تسجيل عملية إدارية";
}
''',
    '''function logLabel(log: LogRecord, lang: InterfaceLanguage): string {
  const known = LOG_LABELS[lang][log.action_type];
  if (known) return known;
  if (lang === "en") return log.details || log.action_type.replace(/_/g, " ");
  return lang === "ku" ? "کردارێکی بەڕێوەبردن تۆمار کرا" : "تم تسجيل عملية إدارية";
}
''' + count_helper,
    "stable localized counter helper",
)

monitor = replace_once(
    monitor,
    '''                  [Activity, text.sessions, `${data.summary.open_session_count} / ${data.summary.session_limit}`],
                  [ShieldCheck, text.trustedDevices, `${data.summary.trusted_device_count} / ${data.summary.trusted_device_limit}`],
''',
    '''                  [
                    Activity,
                    text.sessions,
                    formatLimitCount(
                      data.summary.open_session_count,
                      data.summary.session_limit,
                      lang,
                    ),
                  ],
                  [
                    ShieldCheck,
                    text.trustedDevices,
                    formatLimitCount(
                      data.summary.trusted_device_count,
                      data.summary.trusted_device_limit,
                      lang,
                    ),
                  ],
''',
    "Work Monitor RTL limit counters",
)

MONITOR_PAGE.write_text(monitor, encoding="utf-8")

print("Owner security log localization and RTL counters fixed.")
