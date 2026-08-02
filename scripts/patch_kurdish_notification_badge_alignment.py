from pathlib import Path


def replace_once(path: Path, old: str, new: str, label: str) -> None:
    text = path.read_text()
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"{label}: expected 1 match, found {count}")
    path.write_text(text.replace(old, new, 1))


sidebar_path = Path("artifacts/fawri/src/components/layout/Sidebar.tsx")
bottom_nav_path = Path("artifacts/fawri/src/components/layout/BottomNav.tsx")

replace_once(
    sidebar_path,
    '''function NotificationBadge({ count }: { count: number }) {
  if (count <= 0) return null;

  return (
    <span className="absolute -end-1.5 -top-1.5 flex min-h-4 min-w-4 items-center justify-center rounded-full bg-orange-500 px-1 text-[9px] font-black leading-none text-white shadow-sm ring-2 ring-sidebar">
      {count >= 50 ? "50+" : count}
    </span>
  );
}
''',
    '''function NotificationBadge({
  count,
  isKurdish,
}: {
  count: number;
  isKurdish: boolean;
}) {
  if (count <= 0) return null;

  return (
    <span
      dir="ltr"
      className={`absolute -end-1.5 -top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-orange-500 px-1 text-[9px] leading-none tabular-nums text-white shadow-sm ring-2 ring-sidebar ${
        isKurdish ? "font-sans font-bold" : "font-black"
      }`}
    >
      {count >= 50 ? "50+" : count}
    </span>
  );
}
''',
    "desktop notification badge component",
)

replace_once(
    sidebar_path,
    '''  const { t, isRTL } = useI18n();
''',
    '''  const { t, isRTL, lang } = useI18n();
''',
    "desktop language access",
)

replace_once(
    sidebar_path,
    '''          <NotificationBadge count={unreadNotifications} />
''',
    '''          <NotificationBadge
            count={unreadNotifications}
            isKurdish={lang === "ku"}
          />
''',
    "desktop badge language prop",
)

replace_once(
    bottom_nav_path,
    '''function NavBadge({ count }: { count?: number }) {
  if (!count || count <= 0) return null;

  return (
    <span className="absolute -end-2 -top-2 flex min-h-4 min-w-4 items-center justify-center rounded-full bg-orange-500 px-1 text-[8px] font-black leading-none text-white shadow-sm ring-2 ring-background">
      {count >= 50 ? "50+" : count}
    </span>
  );
}
''',
    '''function NavBadge({
  count,
  isKurdish,
}: {
  count?: number;
  isKurdish: boolean;
}) {
  if (!count || count <= 0) return null;

  return (
    <span
      dir="ltr"
      className={`absolute -end-2 -top-2 flex h-4 min-w-4 items-center justify-center rounded-full bg-orange-500 px-1 text-[8px] leading-none tabular-nums text-white shadow-sm ring-2 ring-background ${
        isKurdish ? "font-sans font-bold" : "font-black"
      }`}
    >
      {count >= 50 ? "50+" : count}
    </span>
  );
}
''',
    "mobile notification badge component",
)

replace_once(
    bottom_nav_path,
    '''  const { t, dir } = useI18n();
''',
    '''  const { t, dir, lang } = useI18n();
''',
    "mobile language access",
)

replace_once(
    bottom_nav_path,
    '''              <NavBadge count={unreadNotifications} />
''',
    '''              <NavBadge
                count={unreadNotifications}
                isKurdish={lang === "ku"}
              />
''',
    "mobile more badge language prop",
)

replace_once(
    bottom_nav_path,
    '''                    <NavBadge count={item.badge} />
''',
    '''                    <NavBadge
                      count={item.badge}
                      isKurdish={lang === "ku"}
                    />
''',
    "mobile menu badge language prop",
)

print("Kurdish notification badge alignment applied to desktop and mobile.")
