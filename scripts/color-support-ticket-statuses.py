from pathlib import Path

MERCHANT = Path('artifacts/fawri/src/pages/dashboard/SupportPage.tsx')
ADMIN = Path('artifacts/fawri/src/components/admin/AdminSupportTab.tsx')


def replace_once(text: str, old: str, new: str, label: str) -> str:
    count = text.count(old)
    if count != 1:
        raise RuntimeError(f'{label}: expected one match, found {count}')
    return text.replace(old, new, 1)


merchant = MERCHANT.read_text(encoding='utf-8')
merchant = replace_once(
    merchant,
    """  const statusLabel = (value: SupportStatus) =>
    ({
      open: t.support_status_open,
      in_progress: t.support_status_in_progress,
      resolved: t.support_status_resolved,
      closed: t.support_status_closed,
    })[value];
""",
    """  const statusLabel = (value: SupportStatus) =>
    ({
      open: t.support_status_open,
      in_progress: t.support_status_in_progress,
      resolved: t.support_status_resolved,
      closed: t.support_status_closed,
    })[value];

  const ticketStatusClass = (value: SupportStatus) =>
    ({
      open: 'border-border bg-card hover:bg-muted/60',
      in_progress:
        'border-yellow-300 bg-yellow-50 hover:bg-yellow-100/70 dark:border-yellow-800 dark:bg-yellow-950/30 dark:hover:bg-yellow-950/45',
      resolved:
        'border-green-300 bg-green-50 hover:bg-green-100/70 dark:border-green-800 dark:bg-green-950/30 dark:hover:bg-green-950/45',
      closed:
        'border-red-300 bg-red-50 hover:bg-red-100/70 dark:border-red-800 dark:bg-red-950/30 dark:hover:bg-red-950/45',
    })[value];

  const statusBadgeClass = (value: SupportStatus) =>
    ({
      open: 'bg-muted text-foreground',
      in_progress:
        'bg-yellow-100 text-yellow-900 dark:bg-yellow-950/70 dark:text-yellow-100',
      resolved:
        'bg-green-100 text-green-900 dark:bg-green-950/70 dark:text-green-100',
      closed: 'bg-red-100 text-red-900 dark:bg-red-950/70 dark:text-red-100',
    })[value];
""",
    'merchant status helpers',
)
merchant = replace_once(
    merchant,
    """                  className={`w-full rounded-xl border p-3 text-start transition ${
                    selectedId === ticket.id
                      ? 'border-orange-400 bg-orange-50 dark:bg-orange-950/20'
                      : 'hover:bg-muted/60'
                  }`}
""",
    """                  className={`w-full rounded-xl border p-3 text-start transition ${ticketStatusClass(
                    ticket.status,
                  )} ${
                    selectedId === ticket.id
                      ? 'ring-2 ring-foreground/20 ring-offset-1 ring-offset-background'
                      : ''
                  }`}
""",
    'merchant ticket card colors',
)
merchant = replace_once(
    merchant,
    """                    <span className=\"shrink-0 rounded-full bg-muted px-2 py-1 text-[10px] font-bold\">
                      {statusLabel(ticket.status)}
                    </span>
""",
    """                    <span
                      className={`shrink-0 rounded-full px-2 py-1 text-[10px] font-bold ${statusBadgeClass(
                        ticket.status,
                      )}`}
                    >
                      {statusLabel(ticket.status)}
                    </span>
""",
    'merchant list status badge',
)
merchant = replace_once(
    merchant,
    """                  <span className=\"rounded-full bg-muted px-3 py-1 text-xs font-bold\">
                    {statusLabel(selectedTicket.status)}
                  </span>
""",
    """                  <span
                    className={`rounded-full px-3 py-1 text-xs font-bold ${statusBadgeClass(
                      selectedTicket.status,
                    )}`}
                  >
                    {statusLabel(selectedTicket.status)}
                  </span>
""",
    'merchant detail status badge',
)
MERCHANT.write_text(merchant, encoding='utf-8')

admin = ADMIN.read_text(encoding='utf-8')
admin = replace_once(
    admin,
    """  const statusLabel = (status: AdminSupportTicketStatus) =>
    ({
      open: text.statusOpen,
      in_progress: text.statusInProgress,
      resolved: text.statusResolved,
      closed: text.statusClosed,
    })[status];
""",
    """  const statusLabel = (status: AdminSupportTicketStatus) =>
    ({
      open: text.statusOpen,
      in_progress: text.statusInProgress,
      resolved: text.statusResolved,
      closed: text.statusClosed,
    })[status];

  const ticketStatusClass = (status: AdminSupportTicketStatus) =>
    ({
      open: 'border-border bg-card hover:bg-muted/50',
      in_progress:
        'border-yellow-300 bg-yellow-50 hover:bg-yellow-100/70 dark:border-yellow-800 dark:bg-yellow-950/30 dark:hover:bg-yellow-950/45',
      resolved:
        'border-green-300 bg-green-50 hover:bg-green-100/70 dark:border-green-800 dark:bg-green-950/30 dark:hover:bg-green-950/45',
      closed:
        'border-red-300 bg-red-50 hover:bg-red-100/70 dark:border-red-800 dark:bg-red-950/30 dark:hover:bg-red-950/45',
    })[status];

  const statusBadgeClass = (status: AdminSupportTicketStatus) =>
    ({
      open: 'bg-muted text-foreground',
      in_progress:
        'bg-yellow-100 text-yellow-900 dark:bg-yellow-950/70 dark:text-yellow-100',
      resolved:
        'bg-green-100 text-green-900 dark:bg-green-950/70 dark:text-green-100',
      closed: 'bg-red-100 text-red-900 dark:bg-red-950/70 dark:text-red-100',
    })[status];
""",
    'admin status helpers',
)
admin = replace_once(
    admin,
    """                  className={`w-full rounded-xl border p-3 text-start transition ${
                    selectedId === ticket.id
                      ? 'border-orange-400 bg-orange-50 dark:bg-orange-950/20'
                      : 'hover:bg-muted/50'
                  }`}
""",
    """                  className={`w-full rounded-xl border p-3 text-start transition ${ticketStatusClass(
                    ticket.status,
                  )} ${
                    selectedId === ticket.id
                      ? 'ring-2 ring-foreground/20 ring-offset-1 ring-offset-background'
                      : ''
                  }`}
""",
    'admin ticket card colors',
)
admin = replace_once(
    admin,
    """                    <span className=\"shrink-0 rounded-full bg-muted px-2 py-1 text-[10px] font-bold\">
                      {statusLabel(ticket.status)}
                    </span>
""",
    """                    <span
                      className={`shrink-0 rounded-full px-2 py-1 text-[10px] font-bold ${statusBadgeClass(
                        ticket.status,
                      )}`}
                    >
                      {statusLabel(ticket.status)}
                    </span>
""",
    'admin list status badge',
)
admin = replace_once(
    admin,
    """                  <span className=\"rounded-full bg-muted px-3 py-1 text-xs font-bold\">
                    {statusLabel(selectedTicket.status)}
                  </span>
""",
    """                  <span
                    className={`rounded-full px-3 py-1 text-xs font-bold ${statusBadgeClass(
                      selectedTicket.status,
                    )}`}
                  >
                    {statusLabel(selectedTicket.status)}
                  </span>
""",
    'admin detail status badge',
)
ADMIN.write_text(admin, encoding='utf-8')

print('Applied support ticket status colors for merchant, assistant admin, and owner views.')
