from pathlib import Path

path = Path('artifacts/api-server/src/routes/auth.ts')
text = path.read_text(encoding='utf-8')


def replace_once(old: str, new: str, label: str) -> None:
    global text
    count = text.count(old)
    if count != 1:
        raise RuntimeError(f'{label}: expected one match, found {count}')
    text = text.replace(old, new, 1)


replace_once(
    '''      const pendingExpired =
        request.status === "pending" &&
        new Date(request.request_expires_at).getTime() <= timestamp;
      const approvedExpired =
        request.status === "approved" &&
        Boolean(request.session_expires_at) &&
        new Date(request.session_expires_at || 0).getTime() <= timestamp;

      if (!pendingExpired && !approvedExpired) continue;
''',
    '''      const ticketInactive =
        ticket.status === "resolved" || ticket.status === "closed";
      const activeRequestOnInactiveTicket =
        ticketInactive &&
        (request.status === "pending" || request.status === "approved");
      const pendingExpired =
        request.status === "pending" &&
        new Date(request.request_expires_at).getTime() <= timestamp;
      const approvedExpired =
        request.status === "approved" &&
        Boolean(request.session_expires_at) &&
        new Date(request.session_expires_at || 0).getTime() <= timestamp;

      if (!activeRequestOnInactiveTicket && !pendingExpired && !approvedExpired) continue;
''',
    'inspection expiration on inactive ticket',
)

replace_once(
    '''    (ticket) =>
      ticket.merchant_id === merchantId &&
      (ticket.inspection_requests || []).some((request) => {
''',
    '''    (ticket) =>
      ticket.merchant_id === merchantId &&
      (ticket.status === "open" || ticket.status === "in_progress") &&
      (ticket.inspection_requests || []).some((request) => {
''',
    'active inspection ignores inactive tickets',
)

replace_once(
    '''    ticket.status = status;
    ticket.updated_at = now();
    if (status === "resolved") ticket.closed_at = ticket.updated_at;
    else delete ticket.closed_at;

    appendAdminLog(
''',
    '''    ticket.status = status;
    ticket.updated_at = now();
    if (status === "resolved") {
      ticket.closed_at = ticket.updated_at;
      refreshInspectionRequestExpirations(db);
    } else {
      delete ticket.closed_at;
    }

    appendAdminLog(
''',
    'resolve ticket inspection cleanup',
)

path.write_text(text, encoding='utf-8')
print('Ended active inspection requests when their support ticket is resolved or closed.')
