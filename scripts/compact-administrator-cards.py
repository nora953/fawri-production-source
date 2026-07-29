from pathlib import Path

path = Path('artifacts/fawri/src/components/admin/AdministratorsTab.tsx')
text = path.read_text(encoding='utf-8')


def replace_once(old: str, new: str, label: str) -> None:
    global text
    count = text.count(old)
    if count != 1:
        raise RuntimeError(f'{label}: expected one match, found {count}')
    text = text.replace(old, new, 1)


replace_once(
    '<section className="space-y-4" dir={adminText.dir}>',
    '<section className="space-y-3" dir={adminText.dir}>',
    'section spacing',
)

replace_once(
    '<div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">',
    '<div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">',
    'header spacing',
)

replace_once(
    '<div className="grid gap-4 lg:grid-cols-2">',
    '<div className="grid items-start gap-3 lg:grid-cols-2">',
    'administrator grid spacing',
)

replace_once(
    '<div className="flex items-start justify-between gap-3 border-b bg-muted/30 p-4 sm:p-5">',
    '<div className="flex items-start justify-between gap-3 border-b bg-muted/30 p-3.5">',
    'card header padding',
)

replace_once(
    '<div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">',
    '<div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">',
    'card avatar size',
)

replace_once(
    '<p className="mt-1 truncate text-sm text-muted-foreground">',
    '<p className="mt-0.5 truncate text-xs text-muted-foreground">',
    'role text spacing',
)

replace_once(
    '<div className="space-y-4 p-4 sm:p-5">',
    '<div className="space-y-3 p-3.5">',
    'card content spacing',
)

replace_once(
    '''                    <div className="flex items-start gap-3">
                      <Phone
                        className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground"
                        aria-hidden="true"
                      />

                      <div className="min-w-0">
                        <p className="text-xs text-muted-foreground">
                          {t.phone}
                        </p>
                        <p
                          className="mt-1 break-all text-sm font-medium"
                          dir="ltr"
                        >
                          {administrator.phone || "—"}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-start gap-3">
                      <UserRound
                        className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground"
                        aria-hidden="true"
                      />

                      <div className="min-w-0">
                        <p className="text-xs text-muted-foreground">
                          {t.language}
                        </p>
                        <p className="mt-1 text-sm font-medium">
                          {t.languages[administrator.language] ??
                            administrator.language}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-start gap-3">
                      <CalendarDays
                        className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground"
                        aria-hidden="true"
                      />

                      <div className="min-w-0">
                        <p className="text-xs text-muted-foreground">
                          {t.createdAt}
                        </p>
                        <p className="mt-1 text-sm font-medium">
                          {formatDate(administrator.created_at, language)}
                        </p>
                      </div>
                    </div>
''',
    '''                    <div className="grid gap-2 sm:grid-cols-3">
                      <div className="flex min-w-0 items-start gap-2 rounded-xl border border-border/70 bg-muted/20 p-2.5">
                        <Phone
                          className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground"
                          aria-hidden="true"
                        />

                        <div className="min-w-0">
                          <p className="text-[11px] text-muted-foreground">
                            {t.phone}
                          </p>
                          <p
                            className="mt-0.5 break-all text-xs font-semibold"
                            dir="ltr"
                          >
                            {administrator.phone || "—"}
                          </p>
                        </div>
                      </div>

                      <div className="flex min-w-0 items-start gap-2 rounded-xl border border-border/70 bg-muted/20 p-2.5">
                        <UserRound
                          className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground"
                          aria-hidden="true"
                        />

                        <div className="min-w-0">
                          <p className="text-[11px] text-muted-foreground">
                            {t.language}
                          </p>
                          <p className="mt-0.5 text-xs font-semibold">
                            {t.languages[administrator.language] ??
                              administrator.language}
                          </p>
                        </div>
                      </div>

                      <div className="flex min-w-0 items-start gap-2 rounded-xl border border-border/70 bg-muted/20 p-2.5">
                        <CalendarDays
                          className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground"
                          aria-hidden="true"
                        />

                        <div className="min-w-0">
                          <p className="text-[11px] text-muted-foreground">
                            {t.createdAt}
                          </p>
                          <p className="mt-0.5 text-xs font-semibold">
                            {formatDate(administrator.created_at, language)}
                          </p>
                        </div>
                      </div>
                    </div>
''',
    'compact administrator details grid',
)

replace_once(
    '<div className="space-y-2 border-t pt-4">',
    '<div className="grid gap-2 border-t pt-3 sm:grid-cols-2">',
    'administrator action buttons grid',
)

replace_once(
    '<div className="flex items-center gap-2 border-t pt-4 text-sm">',
    '<div className="flex items-center gap-2 border-t pt-3 text-xs">',
    'verification row spacing',
)

path.write_text(text, encoding='utf-8')
print('Compacted administrator cards for desktop while preserving mobile stacking.')
