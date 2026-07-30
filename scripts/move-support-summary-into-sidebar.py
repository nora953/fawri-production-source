from pathlib import Path

path = Path('artifacts/fawri/src/components/admin/AdminSupportTab.tsx')
text = path.read_text(encoding='utf-8')


def replace_once(old: str, new: str, label: str) -> None:
    global text
    count = text.count(old)
    if count != 1:
        raise RuntimeError(f'{label}: expected one match, found {count}')
    text = text.replace(old, new, 1)


replace_once(
    '''      <div className="flex shrink-0 flex-col gap-2 rounded-2xl border bg-card p-3 shadow-sm sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <Headphones className="h-5 w-5 text-primary" />
            <h2 className="text-base font-black sm:text-lg">{text.title}</h2>
          </div>
          <p className="mt-0.5 text-xs leading-5 text-muted-foreground sm:text-sm">{text.subtitle}</p>
        </div>
        <div className="rounded-xl border bg-muted/30 px-3 py-1.5 text-center">
          <p className="text-[10px] font-medium text-muted-foreground">{text.activeTickets}</p>
          <p className="mt-0.5 text-lg font-black tabular-nums">{activeCount}</p>
        </div>
      </div>

      {isOwner && (
        <div className="shrink-0 rounded-xl border border-sky-200 bg-sky-50 px-4 py-2 text-sm font-semibold leading-5 text-sky-900 dark:border-sky-900/70 dark:bg-sky-950/30 dark:text-sky-100">
          {text.ownerNotice}
        </div>
      )}

''',
    '',
    'remove full-width support summary',
)

replace_once(
    '''        <div className="grid min-h-[480px] flex-1 overflow-hidden rounded-2xl border bg-card shadow-sm md:min-h-0 lg:grid-cols-[300px_1fr]">
          <div className="min-h-0 overflow-hidden border-b lg:border-b-0 lg:border-e">
            <div className="h-full max-h-72 space-y-2 overflow-y-auto p-3 lg:max-h-none">
''',
    '''        <div className="grid min-h-[480px] flex-1 overflow-hidden rounded-2xl border bg-card shadow-sm md:min-h-0 lg:grid-cols-[300px_1fr]">
          <div className="flex min-h-0 flex-col overflow-hidden border-b lg:border-b-0 lg:border-e">
            <div className="shrink-0 border-b bg-background p-3">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <Headphones className="h-4 w-4 shrink-0 text-primary" />
                    <h2 className="truncate text-sm font-black">{text.title}</h2>
                  </div>
                  <p className="mt-1 line-clamp-2 text-[11px] leading-4 text-muted-foreground">
                    {text.subtitle}
                  </p>
                </div>
                <div className="shrink-0 rounded-xl border bg-muted/30 px-2.5 py-1 text-center">
                  <p className="text-[9px] font-medium leading-3 text-muted-foreground">{text.activeTickets}</p>
                  <p className="text-base font-black leading-5 tabular-nums">{activeCount}</p>
                </div>
              </div>

              {isOwner && (
                <p className="mt-2 rounded-lg border border-sky-200 bg-sky-50 px-2.5 py-1.5 text-[10px] font-semibold leading-4 text-sky-900 dark:border-sky-900/70 dark:bg-sky-950/30 dark:text-sky-100">
                  {text.ownerNotice}
                </p>
              )}
            </div>

            <div className="min-h-0 flex-1 max-h-72 space-y-2 overflow-y-auto p-3 lg:max-h-none">
''',
    'move support summary into ticket sidebar',
)

path.write_text(text, encoding='utf-8')
print('Moved the support summary and active ticket count into the ticket sidebar.')
