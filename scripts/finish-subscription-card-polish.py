from pathlib import Path

FILES = {
    Path('artifacts/fawri/src/lib/translations/ar.ts'): {
        'old_warning': '  usage_90_warning: "استخدمت 90% من حد الردود. فكّر في التجديد قريباً.",',
        'new_warning': '  usage_90_warning: "استخدمت 90% من رصيد خطتك الأساسي.",',
        'anchor': '  subscription_emergency_activated: "مفعّل",',
        'insert': '''  subscription_emergency_activated: "مفعّل",
  subscription_emergency_active_with_debt: "تم استخدام رصيد الطوارئ لهذه الدورة، ولا يمكن طلبه مرة أخرى. ما زال جزء من الدين مستحقًا.",
  subscription_emergency_active_debt_paid: "تم استخدام رصيد الطوارئ لهذه الدورة، ولا يمكن طلبه مرة أخرى. تم تسديد دين الطوارئ بالكامل.",''',
    },
    Path('artifacts/fawri/src/lib/translations/en.ts'): {
        'old_warning': '  usage_90_warning: "You\'ve used 90% of your reply limit. Consider renewing soon.",',
        'new_warning': '  usage_90_warning: "You have used 90% of your base plan replies.",',
        'anchor': '  subscription_emergency_activated: "Activated",',
        'insert': '''  subscription_emergency_activated: "Activated",
  subscription_emergency_active_with_debt: "Emergency credit was used for this cycle and cannot be requested again. Part of the debt is still outstanding.",
  subscription_emergency_active_debt_paid: "Emergency credit was used for this cycle and cannot be requested again. The emergency debt has been paid in full.",''',
    },
    Path('artifacts/fawri/src/lib/translations/ku.ts'): {
        'old_warning': '  usage_90_warning: "90% ی سنووری وەڵامت بەکارهاتووە.",',
        'new_warning': '  usage_90_warning: "90% ی وەڵامە سەرەکییەکانی پلانت بەکارهاتووە.",',
        'anchor': '  subscription_emergency_activated: "چالاککراوە",',
        'insert': '''  subscription_emergency_activated: "چالاککراوە",
  subscription_emergency_active_with_debt: "کرێدیتی فریاکەوتن بۆ ئەم دەورەیە بەکارهاتووە و دووبارە ناتوانرێت داوا بکرێت. بەشێک لە قەرزەکە هێشتا ماوە.",
  subscription_emergency_active_debt_paid: "کرێدیتی فریاکەوتن بۆ ئەم دەورەیە بەکارهاتووە و دووبارە ناتوانرێت داوا بکرێت. قەرزی فریاکەوتن بە تەواوی دراوەتەوە.",''',
    },
}

for path, changes in FILES.items():
    text = path.read_text(encoding='utf-8')
    for old, new, label in [
        (changes['old_warning'], changes['new_warning'], 'usage warning'),
        (changes['anchor'], changes['insert'], 'emergency status translations'),
    ]:
        count = text.count(old)
        if count != 1:
            raise RuntimeError(f'{path}: expected one {label} match, found {count}')
        text = text.replace(old, new, 1)
    path.write_text(text, encoding='utf-8')

print('Finished subscription card translation polish.')
