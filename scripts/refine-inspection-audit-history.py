from pathlib import Path

API = Path('artifacts/api-server/src/routes/auth.ts')
ADMIN = Path('artifacts/fawri/src/components/admin/AdminSupportTab.tsx')
MERCHANT = Path('artifacts/fawri/src/pages/dashboard/SupportPage.tsx')


def replace_once(text: str, old: str, new: str, label: str) -> str:
    count = text.count(old)
    if count != 1:
        raise RuntimeError(f'{label}: expected one match, found {count}')
    return text.replace(old, new, 1)


# ---------------------------------------------------------------------------
# API: preserve merchant consent separately from request/session end state.
# ---------------------------------------------------------------------------
api = API.read_text(encoding='utf-8')

api = replace_once(
    api,
    '''type InspectionSessionMode = "live_observation" | "independent_read_only";
type InspectionSessionRequestStatus = "pending" | "approved" | "rejected" | "expired";

type InspectionSessionRequestRecord = {
''',
    '''type InspectionSessionMode = "live_observation" | "independent_read_only";
type InspectionSessionRequestStatus = "pending" | "approved" | "rejected" | "expired";
type InspectionConsentDecision = "approved" | "rejected";
type InspectionSessionEndReason =
  | "request_timeout"
  | "approval_window_expired"
  | "ticket_resolved"
  | "ticket_closed"
  | "merchant_terminated";

type InspectionSessionRequestRecord = {
''',
    'API inspection audit types',
)

api = replace_once(
    api,
    '''  status: InspectionSessionRequestStatus;
  read_only: true;
''',
    '''  status: InspectionSessionRequestStatus;
  consent_decision?: InspectionConsentDecision;
  end_reason?: InspectionSessionEndReason;
  ended_at?: string;
  read_only: true;
''',
    'API inspection audit fields',
)

api = replace_once(
    api,
    '''              inspection_requests: normalizeInspectionRequests(ticket.inspection_requests),
''',
    '''              inspection_requests: normalizeInspectionRequests(
                ticket.inspection_requests,
                ticket.status,
              ),
''',
    'API normalize inspection requests with ticket status',
)

old_normalize = '''function normalizeInspectionRequests(value: unknown): InspectionSessionRequestRecord[] {
  if (!Array.isArray(value)) return [];

  return value
    .filter(
      (item): item is InspectionSessionRequestRecord =>
        Boolean(
          item &&
          typeof item === "object" &&
          !Array.isArray(item) &&
          typeof item.id === "string" &&
          typeof item.ticket_id === "string" &&
          typeof item.merchant_id === "string" &&
          typeof item.admin_id === "string" &&
          typeof item.admin_name === "string" &&
          isInspectionSessionMode(item.mode) &&
          typeof item.reason === "string" &&
          isInspectionSessionRequestStatus(item.status) &&
          item.read_only === true &&
          item.session_duration_minutes === 30 &&
          typeof item.requested_at === "string" &&
          typeof item.request_expires_at === "string",
        ),
    )
    .sort(
      (left, right) =>
        new Date(right.requested_at).getTime() - new Date(left.requested_at).getTime(),
    );
}
'''

new_normalize = '''function isInspectionConsentDecision(
  value: unknown,
): value is InspectionConsentDecision {
  return value === "approved" || value === "rejected";
}

function isInspectionSessionEndReason(
  value: unknown,
): value is InspectionSessionEndReason {
  return (
    value === "request_timeout" ||
    value === "approval_window_expired" ||
    value === "ticket_resolved" ||
    value === "ticket_closed" ||
    value === "merchant_terminated"
  );
}

function normalizeInspectionRequests(
  value: unknown,
  ticketStatus?: SupportTicketStatus,
): InspectionSessionRequestRecord[] {
  if (!Array.isArray(value)) return [];

  return value
    .filter(
      (item): item is InspectionSessionRequestRecord =>
        Boolean(
          item &&
          typeof item === "object" &&
          !Array.isArray(item) &&
          typeof item.id === "string" &&
          typeof item.ticket_id === "string" &&
          typeof item.merchant_id === "string" &&
          typeof item.admin_id === "string" &&
          typeof item.admin_name === "string" &&
          isInspectionSessionMode(item.mode) &&
          typeof item.reason === "string" &&
          isInspectionSessionRequestStatus(item.status) &&
          item.read_only === true &&
          item.session_duration_minutes === 30 &&
          typeof item.requested_at === "string" &&
          typeof item.request_expires_at === "string",
        ),
    )
    .map((item) => {
      const consentDecision = isInspectionConsentDecision(item.consent_decision)
        ? item.consent_decision
        : item.status === "approved" || Boolean(item.approved_at)
          ? "approved"
          : item.status === "rejected" || Boolean(item.rejected_at)
            ? "rejected"
            : undefined;
      const inferredTicketEndReason =
        ticketStatus === "resolved"
          ? "ticket_resolved"
          : ticketStatus === "closed"
            ? "ticket_closed"
            : undefined;
      const endReason = isInspectionSessionEndReason(item.end_reason)
        ? item.end_reason
        : item.status === "expired"
          ? inferredTicketEndReason ||
            (consentDecision === "approved"
              ? "approval_window_expired"
              : "request_timeout")
          : undefined;
      const endedAt =
        typeof item.ended_at === "string"
          ? item.ended_at
          : endReason
            ? item.expired_at || item.responded_at || item.session_expires_at
            : undefined;

      return {
        ...item,
        ...(consentDecision ? { consent_decision: consentDecision } : {}),
        ...(endReason ? { end_reason: endReason } : {}),
        ...(endedAt ? { ended_at: endedAt } : {}),
      };
    })
    .sort(
      (left, right) =>
        new Date(right.requested_at).getTime() - new Date(left.requested_at).getTime(),
    );
}
'''
api = replace_once(api, old_normalize, new_normalize, 'API normalize inspection audit history')

old_refresh = '''function refreshInspectionRequestExpirations(db: AuthDb): boolean {
  const timestamp = Date.now();
  let changed = false;

  for (const ticket of db.support_tickets) {
    for (const request of ticket.inspection_requests || []) {
      const ticketInactive =
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

      const expiredAt = now();
      request.status = "expired";
      request.expired_at = expiredAt;
      request.responded_at = request.responded_at || expiredAt;
      ticket.updated_at = expiredAt;
      changed = true;
    }
  }

  return changed;
}
'''

new_refresh = '''function refreshInspectionRequestExpirations(db: AuthDb): boolean {
  const timestamp = Date.now();
  let changed = false;

  for (const ticket of db.support_tickets) {
    const ticketEndReason: InspectionSessionEndReason | undefined =
      ticket.status === "resolved"
        ? "ticket_resolved"
        : ticket.status === "closed"
          ? "ticket_closed"
          : undefined;

    for (const request of ticket.inspection_requests || []) {
      if (request.ended_at) continue;

      const pendingExpired =
        request.status === "pending" &&
        new Date(request.request_expires_at).getTime() <= timestamp;
      const approvedExpired =
        request.status === "approved" &&
        Boolean(request.session_expires_at) &&
        new Date(request.session_expires_at || 0).getTime() <= timestamp;
      const pendingOnInactiveTicket =
        request.status === "pending" && Boolean(ticketEndReason);
      const approvedOnInactiveTicket =
        request.status === "approved" && Boolean(ticketEndReason);

      if (
        !pendingExpired &&
        !approvedExpired &&
        !pendingOnInactiveTicket &&
        !approvedOnInactiveTicket
      ) {
        continue;
      }

      const endedAt = now();
      if (request.status === "pending") {
        request.status = "expired";
        request.expired_at = endedAt;
        request.end_reason = ticketEndReason || "request_timeout";
      } else {
        request.consent_decision = "approved";
        request.end_reason = ticketEndReason || "approval_window_expired";
      }
      request.ended_at = endedAt;
      changed = true;
    }
  }

  return changed;
}
'''
api = replace_once(api, old_refresh, new_refresh, 'API separate consent from end state')

api = replace_once(
    api,
    '''        if (request.status === "pending") {
          return new Date(request.request_expires_at).getTime() > timestamp;
        }
        if (request.status === "approved") {
          return new Date(request.session_expires_at || 0).getTime() > timestamp;
        }
''',
    '''        if (request.ended_at) return false;
        if (request.status === "pending") {
          return new Date(request.request_expires_at).getTime() > timestamp;
        }
        if (request.status === "approved") {
          return new Date(request.session_expires_at || 0).getTime() > timestamp;
        }
''',
    'API active inspection excludes ended requests',
)

api = replace_once(
    api,
    '''    inspectionRequest.responded_at = respondedAt;
    if (decision === "approve") {
      inspectionRequest.status = "approved";
      inspectionRequest.approved_at = respondedAt;
      inspectionRequest.session_expires_at = new Date(
        Date.now() + inspectionRequest.session_duration_minutes * 60 * 1000,
      ).toISOString();
    } else {
      inspectionRequest.status = "rejected";
      inspectionRequest.rejected_at = respondedAt;
    }
''',
    '''    inspectionRequest.responded_at = respondedAt;
    delete inspectionRequest.ended_at;
    delete inspectionRequest.end_reason;
    if (decision === "approve") {
      inspectionRequest.status = "approved";
      inspectionRequest.consent_decision = "approved";
      inspectionRequest.approved_at = respondedAt;
      delete inspectionRequest.rejected_at;
      inspectionRequest.session_expires_at = new Date(
        Date.now() + inspectionRequest.session_duration_minutes * 60 * 1000,
      ).toISOString();
    } else {
      inspectionRequest.status = "rejected";
      inspectionRequest.consent_decision = "rejected";
      inspectionRequest.rejected_at = respondedAt;
      delete inspectionRequest.approved_at;
      delete inspectionRequest.session_expires_at;
    }
''',
    'API persist consent decision',
)

API.write_text(api, encoding='utf-8')


# ---------------------------------------------------------------------------
# Admin and owner UI: clear audit semantics and readable history.
# ---------------------------------------------------------------------------
admin = ADMIN.read_text(encoding='utf-8')

admin = replace_once(
    admin,
    '''type InspectionSessionMode = 'live_observation' | 'independent_read_only';
type InspectionSessionRequestStatus = 'pending' | 'approved' | 'rejected' | 'expired';

type InspectionSessionRequest = {
''',
    '''type InspectionSessionMode = 'live_observation' | 'independent_read_only';
type InspectionSessionRequestStatus = 'pending' | 'approved' | 'rejected' | 'expired';
type InspectionConsentDecision = 'approved' | 'rejected';
type InspectionSessionEndReason =
  | 'request_timeout'
  | 'approval_window_expired'
  | 'ticket_resolved'
  | 'ticket_closed'
  | 'merchant_terminated';

type InspectionSessionRequest = {
''',
    'admin inspection audit types',
)
admin = replace_once(
    admin,
    '''  status: InspectionSessionRequestStatus;
  read_only: true;
''',
    '''  status: InspectionSessionRequestStatus;
  consent_decision?: InspectionConsentDecision;
  end_reason?: InspectionSessionEndReason;
  ended_at?: string;
  read_only: true;
''',
    'admin inspection audit fields',
)

string_replacements = [
    (
        "    inspectionRequestedAt: 'وقت الطلب',\n",
        """    inspectionRequestedAt: 'وقت الطلب',
    inspectionLatestRequest: 'آخر طلب',
    inspectionDecision: 'قرار التاجر',
    inspectionSessionState: 'حالة الجلسة',
    inspectionDecisionPending: 'لم يصدر قرار',
    inspectionStateWaiting: 'بانتظار القرار',
    inspectionStateApprovalActive: 'الموافقة فعالة',
    inspectionStateNotStarted: 'لم تبدأ الجلسة',
    inspectionEndRequestTimeout: 'انتهى الطلب دون رد',
    inspectionEndApprovalExpired: 'انتهت مدة الموافقة',
    inspectionEndTicketResolved: 'انتهت بسبب حل التذكرة',
    inspectionEndTicketClosed: 'انتهت بسبب إغلاق التذكرة',
    inspectionEndMerchantTerminated: 'أنهى التاجر الجلسة',
    inspectionRespondedAt: 'وقت قرار التاجر',
    inspectionEndedAt: 'وقت الانتهاء',
    inspectionApprovedUntil: 'الموافقة فعالة حتى',
""",
    ),
    (
        "    inspectionRequestedAt: 'کاتی داواکاری',\n",
        """    inspectionRequestedAt: 'کاتی داواکاری',
    inspectionLatestRequest: 'دوایین داواکاری',
    inspectionDecision: 'بڕیاری بازرگان',
    inspectionSessionState: 'دۆخی دانیشتن',
    inspectionDecisionPending: 'هێشتا بڕیار نەدراوە',
    inspectionStateWaiting: 'چاوەڕوانی بڕیار',
    inspectionStateApprovalActive: 'ڕەزامەندی چالاکە',
    inspectionStateNotStarted: 'دانیشتن دەستی پێنەکردووە',
    inspectionEndRequestTimeout: 'داواکاری بێ وەڵام کۆتایی هات',
    inspectionEndApprovalExpired: 'ماوەی ڕەزامەندی کۆتایی هات',
    inspectionEndTicketResolved: 'بە چارەسەرکردنی تیکێت کۆتایی هات',
    inspectionEndTicketClosed: 'بە داخستنی تیکێت کۆتایی هات',
    inspectionEndMerchantTerminated: 'بازرگان دانیشتنەکەی کۆتایی پێهێنا',
    inspectionRespondedAt: 'کاتی بڕیاری بازرگان',
    inspectionEndedAt: 'کاتی کۆتایی',
    inspectionApprovedUntil: 'ڕەزامەندی چالاکە تا',
""",
    ),
    (
        "    inspectionRequestedAt: 'Requested at',\n",
        """    inspectionRequestedAt: 'Requested at',
    inspectionLatestRequest: 'Latest request',
    inspectionDecision: 'Merchant decision',
    inspectionSessionState: 'Session state',
    inspectionDecisionPending: 'No decision yet',
    inspectionStateWaiting: 'Waiting for decision',
    inspectionStateApprovalActive: 'Approval is active',
    inspectionStateNotStarted: 'Session did not start',
    inspectionEndRequestTimeout: 'Request expired without a response',
    inspectionEndApprovalExpired: 'Approval period ended',
    inspectionEndTicketResolved: 'Ended because the ticket was resolved',
    inspectionEndTicketClosed: 'Ended because the ticket was closed',
    inspectionEndMerchantTerminated: 'Merchant ended the session',
    inspectionRespondedAt: 'Merchant decision time',
    inspectionEndedAt: 'Ended at',
    inspectionApprovedUntil: 'Approval active until',
""",
    ),
]
for old, new in string_replacements:
    admin = replace_once(admin, old, new, 'admin inspection audit translations')

old_helpers = '''  const inspectionStatusLabel = (status: InspectionSessionRequestStatus) =>
    ({
      pending: text.inspectionStatusPending,
      approved: text.inspectionStatusApproved,
      rejected: text.inspectionStatusRejected,
      expired: text.inspectionStatusExpired,
    })[status];

  const inspectionModeLabel = (mode: InspectionSessionMode) =>
    mode === 'live_observation' ? text.inspectionLive : text.inspectionReadOnly;

  const inspectionStatusClass = (status: InspectionSessionRequestStatus) =>
    ({
      pending: 'border-yellow-300 bg-yellow-50 text-yellow-950 dark:border-yellow-800 dark:bg-yellow-950/30 dark:text-yellow-100',
      approved: 'border-green-300 bg-green-50 text-green-950 dark:border-green-800 dark:bg-green-950/30 dark:text-green-100',
      rejected: 'border-red-300 bg-red-50 text-red-950 dark:border-red-800 dark:bg-red-950/30 dark:text-red-100',
      expired: 'border-border bg-muted/40 text-muted-foreground',
    })[status];
'''

new_helpers = '''  const inspectionConsentDecision = (
    request: InspectionSessionRequest,
  ): InspectionConsentDecision | null =>
    request.consent_decision ||
    (request.status === 'approved'
      ? 'approved'
      : request.status === 'rejected'
        ? 'rejected'
        : null);

  const inspectionDecisionLabel = (request: InspectionSessionRequest) => {
    const decision = inspectionConsentDecision(request);
    return decision === 'approved'
      ? text.inspectionStatusApproved
      : decision === 'rejected'
        ? text.inspectionStatusRejected
        : text.inspectionDecisionPending;
  };

  const inspectionModeLabel = (mode: InspectionSessionMode) =>
    mode === 'live_observation' ? text.inspectionLive : text.inspectionReadOnly;

  const inspectionEndLabel = (request: InspectionSessionRequest) => {
    if (request.end_reason === 'request_timeout') return text.inspectionEndRequestTimeout;
    if (request.end_reason === 'approval_window_expired') return text.inspectionEndApprovalExpired;
    if (request.end_reason === 'ticket_resolved') return text.inspectionEndTicketResolved;
    if (request.end_reason === 'ticket_closed') return text.inspectionEndTicketClosed;
    if (request.end_reason === 'merchant_terminated') return text.inspectionEndMerchantTerminated;
    if (request.status === 'pending') return text.inspectionStateWaiting;
    if (inspectionConsentDecision(request) === 'approved') return text.inspectionStateApprovalActive;
    if (inspectionConsentDecision(request) === 'rejected') return text.inspectionStateNotStarted;
    return text.inspectionStatusExpired;
  };

  const inspectionDecisionClass = (request: InspectionSessionRequest) => {
    const decision = inspectionConsentDecision(request);
    return decision === 'approved'
      ? 'border-green-300 bg-green-50 text-green-950 dark:border-green-800 dark:bg-green-950/30 dark:text-green-100'
      : decision === 'rejected'
        ? 'border-red-300 bg-red-50 text-red-950 dark:border-red-800 dark:bg-red-950/30 dark:text-red-100'
        : 'border-yellow-300 bg-yellow-50 text-yellow-950 dark:border-yellow-800 dark:bg-yellow-950/30 dark:text-yellow-100';
  };
'''
admin = replace_once(admin, old_helpers, new_helpers, 'admin inspection decision helpers')

admin = replace_once(
    admin,
    '''  const inspectionRequestIsActive =
    latestInspectionRequest?.status === 'pending' || latestInspectionRequest?.status === 'approved';
''',
    '''  const inspectionRequestIsActive = Boolean(
    latestInspectionRequest &&
      !latestInspectionRequest.ended_at &&
      (latestInspectionRequest.status === 'pending' || latestInspectionRequest.status === 'approved'),
  );
''',
    'admin ended inspection is inactive',
)

old_bar = '''                {latestInspectionRequest && (
                  <div className="shrink-0 border-b bg-background px-3 py-2">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex min-w-0 flex-wrap items-center gap-2 text-xs">
                        <strong>{text.inspectionHistory} ({inspectionRequests.length})</strong>
                        <span className={`rounded-full border px-2.5 py-1 text-[10px] font-black ${inspectionStatusClass(latestInspectionRequest.status)}`}>
                          {inspectionStatusLabel(latestInspectionRequest.status)}
                        </span>
                        <span className="truncate text-muted-foreground">
                          {inspectionModeLabel(latestInspectionRequest.mode)}
                        </span>
                      </div>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-8 shrink-0"
                        onClick={() => setShowInspectionHistory(true)}
                      >
                        <Eye className="me-2 h-3.5 w-3.5" />
                        {text.inspectionViewHistory}
                      </Button>
                    </div>
                  </div>
                )}
'''
new_bar = '''                {latestInspectionRequest && (
                  <div className="shrink-0 border-b bg-background px-3 py-2">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex min-w-0 flex-wrap items-center gap-2 text-xs">
                        <strong>{text.inspectionHistory} ({inspectionRequests.length})</strong>
                        <span className="text-muted-foreground">{text.inspectionLatestRequest}:</span>
                        <span className={`rounded-full border px-2.5 py-1 text-[11px] font-black ${inspectionDecisionClass(latestInspectionRequest)}`}>
                          {inspectionDecisionLabel(latestInspectionRequest)}
                        </span>
                        <span className="rounded-full border bg-muted/40 px-2.5 py-1 text-[11px] font-bold text-muted-foreground">
                          {inspectionEndLabel(latestInspectionRequest)}
                        </span>
                      </div>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-8 shrink-0"
                        onClick={() => setShowInspectionHistory(true)}
                      >
                        <Eye className="me-2 h-3.5 w-3.5" />
                        {text.inspectionViewHistory}
                      </Button>
                    </div>
                  </div>
                )}
'''
admin = replace_once(admin, old_bar, new_bar, 'admin latest inspection summary')

old_history = '''      <Dialog open={showInspectionHistory} onOpenChange={setShowInspectionHistory}>
        <DialogContent
          className="max-w-2xl"
          closeButtonClassName={dir === 'rtl' ? 'left-4 right-auto' : 'left-auto right-4'}
          dir={dir}
        >
          <DialogHeader>
            <DialogTitle className="text-start">
              {text.inspectionHistory} ({inspectionRequests.length})
            </DialogTitle>
          </DialogHeader>

          <div className="max-h-[60vh] space-y-3 overflow-y-auto pe-1">
            {inspectionRequests.map((request) => (
              <article
                key={request.id}
                className={`rounded-xl border p-3 ${inspectionStatusClass(request.status)}`}
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-sm font-black">{inspectionModeLabel(request.mode)}</p>
                    <p className="mt-1 whitespace-pre-wrap text-xs leading-5">{request.reason}</p>
                  </div>
                  <span className="rounded-full bg-background/75 px-2.5 py-1 text-[10px] font-black">
                    {inspectionStatusLabel(request.status)}
                  </span>
                </div>
                <div className="mt-2 grid gap-1 text-[10px] opacity-80 sm:grid-cols-2">
                  <span>{text.inspectionRequestedBy}: {request.admin_name}</span>
                  <span>{text.inspectionRequestedAt}: {new Date(request.requested_at).toLocaleString(locale)}</span>
                  <span>{text.inspectionDuration}</span>
                  {request.status === 'pending' && (
                    <span>{text.inspectionExpires}: {new Date(request.request_expires_at).toLocaleString(locale)}</span>
                  )}
                </div>
              </article>
            ))}
          </div>
        </DialogContent>
      </Dialog>
'''

new_history = '''      <Dialog open={showInspectionHistory} onOpenChange={setShowInspectionHistory}>
        <DialogContent
          className="max-w-2xl"
          closeButtonClassName={dir === 'rtl' ? 'left-4 right-auto' : 'left-auto right-4'}
          dir={dir}
          onOpenAutoFocus={(event) => event.preventDefault()}
        >
          <DialogHeader>
            <DialogTitle className="text-start">
              {text.inspectionHistory} ({inspectionRequests.length})
            </DialogTitle>
          </DialogHeader>

          <div className="max-h-[60vh] space-y-3 overflow-y-auto pe-1">
            {inspectionRequests.map((request) => {
              const decision = inspectionConsentDecision(request);
              return (
                <article key={request.id} className="rounded-xl border bg-card p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-black">{inspectionModeLabel(request.mode)}</p>
                      <p className="mt-2 whitespace-pre-wrap rounded-lg bg-muted/35 px-3 py-2 text-sm leading-6">
                        {request.reason}
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <span className={`rounded-full border px-2.5 py-1 text-xs font-black ${inspectionDecisionClass(request)}`}>
                        {text.inspectionDecision}: {inspectionDecisionLabel(request)}
                      </span>
                      <span className="rounded-full border bg-muted/40 px-2.5 py-1 text-xs font-bold text-muted-foreground">
                        {text.inspectionSessionState}: {inspectionEndLabel(request)}
                      </span>
                    </div>
                  </div>

                  <div className="mt-3 grid gap-x-5 gap-y-2 border-t pt-3 text-xs leading-5 text-muted-foreground sm:grid-cols-2">
                    <span><strong className="text-foreground">{text.inspectionRequestedBy}:</strong> {request.admin_name}</span>
                    <span><strong className="text-foreground">{text.inspectionRequestedAt}:</strong> {new Date(request.requested_at).toLocaleString(locale)}</span>
                    {request.responded_at && decision && (
                      <span><strong className="text-foreground">{text.inspectionRespondedAt}:</strong> {new Date(request.responded_at).toLocaleString(locale)}</span>
                    )}
                    {request.status === 'pending' && !request.ended_at && (
                      <span><strong className="text-foreground">{text.inspectionExpires}:</strong> {new Date(request.request_expires_at).toLocaleString(locale)}</span>
                    )}
                    {decision === 'approved' && (
                      <span><strong className="text-foreground">{text.inspectionDuration}:</strong> 30</span>
                    )}
                    {decision === 'approved' && request.session_expires_at && !request.ended_at && (
                      <span><strong className="text-foreground">{text.inspectionApprovedUntil}:</strong> {new Date(request.session_expires_at).toLocaleString(locale)}</span>
                    )}
                    {request.ended_at && (
                      <span><strong className="text-foreground">{text.inspectionEndedAt}:</strong> {new Date(request.ended_at).toLocaleString(locale)}</span>
                    )}
                  </div>
                </article>
              );
            })}
          </div>
        </DialogContent>
      </Dialog>
'''
admin = replace_once(admin, old_history, new_history, 'admin readable inspection audit dialog')

ADMIN.write_text(admin, encoding='utf-8')


# ---------------------------------------------------------------------------
# Merchant UI: preserve the decision and show a separate end reason.
# ---------------------------------------------------------------------------
merchant = MERCHANT.read_text(encoding='utf-8')

merchant = replace_once(
    merchant,
    '''type InspectionSessionMode = 'live_observation' | 'independent_read_only';
type InspectionSessionRequestStatus = 'pending' | 'approved' | 'rejected' | 'expired';

type InspectionSessionRequest = {
''',
    '''type InspectionSessionMode = 'live_observation' | 'independent_read_only';
type InspectionSessionRequestStatus = 'pending' | 'approved' | 'rejected' | 'expired';
type InspectionConsentDecision = 'approved' | 'rejected';
type InspectionSessionEndReason =
  | 'request_timeout'
  | 'approval_window_expired'
  | 'ticket_resolved'
  | 'ticket_closed'
  | 'merchant_terminated';

type InspectionSessionRequest = {
''',
    'merchant inspection audit types',
)
merchant = replace_once(
    merchant,
    '''  status: InspectionSessionRequestStatus;
  read_only: true;
''',
    '''  status: InspectionSessionRequestStatus;
  consent_decision?: InspectionConsentDecision;
  end_reason?: InspectionSessionEndReason;
  ended_at?: string;
  read_only: true;
''',
    'merchant inspection audit fields',
)

merchant_strings = [
    (
        "    approvedUntil: 'تنتهي الموافقة',\n",
        """    approvedUntil: 'تنتهي الموافقة',
    decisionAt: 'وقت القرار',
    endedAt: 'وقت الانتهاء',
    requestTimeout: 'انتهى الطلب دون رد',
    approvalExpired: 'انتهت مدة الموافقة',
    ticketResolved: 'انتهت بسبب حل التذكرة',
    ticketClosed: 'انتهت بسبب إغلاق التذكرة',
    merchantTerminated: 'تم إنهاء الجلسة من قبلك',
""",
    ),
    (
        "    approvedUntil: 'ڕەزامەندی کۆتایی دێت',\n",
        """    approvedUntil: 'ڕەزامەندی کۆتایی دێت',
    decisionAt: 'کاتی بڕیار',
    endedAt: 'کاتی کۆتایی',
    requestTimeout: 'داواکاری بێ وەڵام کۆتایی هات',
    approvalExpired: 'ماوەی ڕەزامەندی کۆتایی هات',
    ticketResolved: 'بە چارەسەرکردنی تیکێت کۆتایی هات',
    ticketClosed: 'بە داخستنی تیکێت کۆتایی هات',
    merchantTerminated: 'دانیشتنەکەت کۆتایی پێهێنا',
""",
    ),
    (
        "    approvedUntil: 'Approval expires',\n",
        """    approvedUntil: 'Approval expires',
    decisionAt: 'Decision time',
    endedAt: 'Ended at',
    requestTimeout: 'Request expired without a response',
    approvalExpired: 'Approval period ended',
    ticketResolved: 'Ended because the ticket was resolved',
    ticketClosed: 'Ended because the ticket was closed',
    merchantTerminated: 'You ended the session',
""",
    ),
]
for old, new in merchant_strings:
    merchant = replace_once(merchant, old, new, 'merchant inspection audit translations')

merchant = replace_once(
    merchant,
    '''  const latestInspectionRequest = selectedTicket?.inspection_requests?.[0] ?? null;

  useLayoutEffect(() => {
''',
    '''  const latestInspectionRequest = selectedTicket?.inspection_requests?.[0] ?? null;
  const latestInspectionDecision: InspectionConsentDecision | null = latestInspectionRequest
    ? latestInspectionRequest.consent_decision ||
      (latestInspectionRequest.status === 'approved'
        ? 'approved'
        : latestInspectionRequest.status === 'rejected'
          ? 'rejected'
          : null)
    : null;
  const latestInspectionEndLabel = latestInspectionRequest
    ? latestInspectionRequest.end_reason === 'request_timeout'
      ? inspectionText.requestTimeout
      : latestInspectionRequest.end_reason === 'approval_window_expired'
        ? inspectionText.approvalExpired
        : latestInspectionRequest.end_reason === 'ticket_resolved'
          ? inspectionText.ticketResolved
          : latestInspectionRequest.end_reason === 'ticket_closed'
            ? inspectionText.ticketClosed
            : latestInspectionRequest.end_reason === 'merchant_terminated'
              ? inspectionText.merchantTerminated
              : null
    : null;

  useLayoutEffect(() => {
''',
    'merchant derived inspection audit state',
)

merchant = replace_once(
    merchant,
    '''                  latestInspectionRequest.status === 'pending'
                    ? 'border-yellow-300 bg-yellow-50 dark:border-yellow-800 dark:bg-yellow-950/30'
                    : latestInspectionRequest.status === 'approved'
                      ? 'border-green-300 bg-green-50 dark:border-green-800 dark:bg-green-950/30'
                      : latestInspectionRequest.status === 'rejected'
                        ? 'border-red-300 bg-red-50 dark:border-red-800 dark:bg-red-950/30'
                        : 'bg-muted/40'
''',
    '''                  latestInspectionDecision === 'approved'
                    ? 'border-green-300 bg-green-50 dark:border-green-800 dark:bg-green-950/30'
                    : latestInspectionDecision === 'rejected'
                      ? 'border-red-300 bg-red-50 dark:border-red-800 dark:bg-red-950/30'
                      : latestInspectionRequest.status === 'pending'
                        ? 'border-yellow-300 bg-yellow-50 dark:border-yellow-800 dark:bg-yellow-950/30'
                        : 'bg-muted/40'
''',
    'merchant inspection decision color',
)

merchant = replace_once(
    merchant,
    '''                      {latestInspectionRequest.status === 'pending'
                        ? inspectionText.pending
                        : latestInspectionRequest.status === 'approved'
                          ? inspectionText.approved
                          : latestInspectionRequest.status === 'rejected'
                            ? inspectionText.rejected
                            : inspectionText.expired}
''',
    '''                      {latestInspectionDecision === 'approved'
                        ? inspectionText.approved
                        : latestInspectionDecision === 'rejected'
                          ? inspectionText.rejected
                          : latestInspectionRequest.status === 'pending'
                            ? inspectionText.pending
                            : inspectionText.expired}
''',
    'merchant preserve consent label',
)

merchant = replace_once(
    merchant,
    '''                  <p className="mt-2 text-[10px] leading-4 text-muted-foreground">{inspectionText.rules}</p>
                  {latestInspectionRequest.status === 'pending' && (
''',
    '''                  <p className="mt-2 text-[10px] leading-4 text-muted-foreground">{inspectionText.rules}</p>
                  {latestInspectionEndLabel && (
                    <p className="mt-2 rounded-lg border bg-background/70 px-3 py-2 text-xs font-bold text-muted-foreground">
                      {latestInspectionEndLabel}
                      {latestInspectionRequest.ended_at && (
                        <> — {inspectionText.endedAt}: {new Date(latestInspectionRequest.ended_at).toLocaleString(locale)}</>
                      )}
                    </p>
                  )}
                  {latestInspectionRequest.responded_at && latestInspectionDecision && (
                    <p className="mt-1 text-[10px] text-muted-foreground">
                      {inspectionText.decisionAt}: {new Date(latestInspectionRequest.responded_at).toLocaleString(locale)}
                    </p>
                  )}
                  {latestInspectionRequest.status === 'pending' && !latestInspectionRequest.ended_at && (
''',
    'merchant display decision and end reason',
)

merchant = replace_once(
    merchant,
    '''                  {latestInspectionRequest.status === 'approved' && latestInspectionRequest.session_expires_at && (
''',
    '''                  {latestInspectionDecision === 'approved' && latestInspectionRequest.session_expires_at && !latestInspectionRequest.ended_at && (
''',
    'merchant hide inactive approval time',
)

MERCHANT.write_text(merchant, encoding='utf-8')

print('Refined inspection consent, end-state audit history, readability, and dialog focus.')
