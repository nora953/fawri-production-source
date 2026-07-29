from pathlib import Path

PATH = Path('artifacts/fawri/src/pages/AdminPage.tsx')


def replace_once(text: str, old: str, new: str, label: str) -> str:
    count = text.count(old)
    if count != 1:
        raise RuntimeError(f'{label}: expected one match, found {count}')
    return text.replace(old, new, 1)


def replace_between(text: str, start: str, end: str, replacement: str, label: str) -> str:
    start_index = text.find(start)
    if start_index < 0:
        raise RuntimeError(f'{label}: start marker not found')
    end_index = text.find(end, start_index)
    if end_index < 0:
        raise RuntimeError(f'{label}: end marker not found')
    if text.find(start, start_index + len(start)) >= 0:
        raise RuntimeError(f'{label}: multiple start markers found')
    return text[:start_index] + replacement + text[end_index:]


text = PATH.read_text(encoding='utf-8')

compact_desktop_actions = '''  return (
    <div
      className="flex min-w-0 flex-col gap-2 rounded-xl border border-border/80 bg-muted/20 p-2.5 shadow-sm"
      dir={adminText.dir}
    >
      <Button
        variant="outline"
        size="sm"
        className="h-9 w-full justify-center gap-2 text-xs font-semibold"
        onClick={onView}
        title={adminText.actionViewDetails}
      >
        <Eye className="h-4 w-4 shrink-0" />
        <span>{adminText.actionViewDetails}</span>
      </Button>

      <div className="flex items-center justify-between gap-2 rounded-lg border border-border/70 bg-background px-2.5 py-2">
        <span className="text-[10px] font-medium text-muted-foreground">
          {adminText.mainTableActions}
        </span>
        <ActionsMenu
          mobile
          merchant={merchant}
          sub={sub}
          onView={onView}
          onApprove={onApprove}
          onReject={onReject}
          onSuspend={onSuspend}
          onUnsuspend={onUnsuspend}
          onRestore={onRestore}
          onResetReplies={onResetReplies}
          onAddReplies={onAddReplies}
          onDeductReplies={onDeductReplies}
          onToggleAutoReply={onToggleAutoReply}
          onChangePlan={onChangePlan}
          onRenewPlan={onRenewPlan}
          onDelete={onDelete}
          canManageMerchants={canManageMerchants}
          canManageSubscriptions={canManageSubscriptions}
          deletionAction={deletionAction}
        />
      </div>
    </div>
  );
}

'''

text = replace_between(
    text,
    '  const desktopActionButtonClass =',
    'function hasAdminPermission(',
    compact_desktop_actions,
    'desktop action layout',
)

text = replace_once(
    text,
    'className="grid gap-4 md:grid-cols-2 lg:hidden"',
    'className="grid gap-4 md:grid-cols-2 xl:hidden"',
    'responsive merchant cards breakpoint',
)

text = replace_once(
    text,
    'className="hidden overflow-x-auto rounded-xl border border-border/80 bg-card shadow-sm lg:block"',
    'className="hidden overflow-hidden rounded-xl border border-border/80 bg-card shadow-sm xl:block"',
    'desktop table wrapper',
)

text = replace_once(
    text,
    '<table className="w-full min-w-[1140px] text-sm">',
    '<table className="w-full table-fixed text-sm">',
    'desktop table sizing',
)

text = replace_once(
    text,
    '''                          adminText.mainTableRegistered,
                          adminText.mainTableActions,
''',
    '''                          adminText.mainTableActions,
''',
    'registered table heading',
)

text = replace_once(
    text,
    '"px-4 py-3.5 text-xs font-semibold text-muted-foreground " +',
    '"px-2.5 py-3.5 text-xs font-semibold text-muted-foreground " +',
    'table heading padding',
)

text = replace_once(
    text,
    '<td className="min-w-[165px] px-3 py-4 align-top">',
    '<td className="w-[16%] px-2 py-3 align-top">',
    'store cell width',
)

text = replace_once(
    text,
    '''                                <p className="mt-1.5 break-words rounded-lg bg-muted/60 px-2.5 py-2 text-xs font-semibold leading-5 text-foreground">
                                  {m.owner_name}
                                </p>
''',
    '''                                <p className="mt-1.5 break-words rounded-lg bg-muted/60 px-2.5 py-2 text-xs font-semibold leading-5 text-foreground">
                                  {m.owner_name}
                                </p>
                                <div className="mt-3 flex items-center justify-between gap-2 border-t border-border/60 pt-2 text-[9px] text-muted-foreground">
                                  <span>{adminText.mainTableRegistered}</span>
                                  <strong className="font-semibold tabular-nums text-foreground" dir="ltr">
                                    {new Date(m.created_at).toLocaleDateString(locale)}
                                  </strong>
                                </div>
''',
    'registration date in store card',
)

text = replace_once(
    text,
    '<td className="min-w-[155px] px-3 py-4 align-top">',
    '<td className="w-[16%] px-2 py-3 align-top">',
    'phone activity cell width',
)

text = replace_once(
    text,
    '<td className="min-w-[175px] px-4 py-4 align-middle">',
    '<td className="w-[15%] px-2 py-3 align-middle">',
    'status cell width',
)

text = replace_once(
    text,
    '<td className="min-w-[240px] px-4 py-4 align-middle">',
    '<td className="w-[30%] px-2 py-3 align-middle">',
    'subscription cell width',
)

text = replace_once(
    text,
    '''                            <td className="min-w-[125px] px-4 py-4 align-middle">
                              <div className="inline-flex rounded-lg border bg-muted/20 px-3 py-2 text-xs font-semibold tabular-nums text-muted-foreground" dir="ltr">
                                {new Date(m.created_at).toLocaleDateString(locale)}
                              </div>
                            </td>

''',
    '',
    'standalone registration cell',
)

text = replace_once(
    text,
    '<td className="min-w-[360px] px-3 py-4 align-top">',
    '<td className="w-[23%] px-2 py-3 align-middle">',
    'actions cell width',
)

PATH.write_text(text, encoding='utf-8')
print('Compacted the desktop merchant table without removing any actions.')
