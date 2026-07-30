from pathlib import Path

path = Path('artifacts/fawri/src/pages/dashboard/SupportPage.tsx')
text = path.read_text(encoding='utf-8')


def replace_once(old: str, new: str, label: str) -> None:
    global text
    count = text.count(old)
    if count != 1:
        raise RuntimeError(f'{label}: expected one match, found {count}')
    text = text.replace(old, new, 1)


replace_once(
    '''  ChevronDown,
  Headphones,
''',
    '''  ChevronDown,
  Eye,
  Headphones,
''',
    'add Eye icon import',
)

replace_once(
    '''import { useI18n } from '@/lib/i18n';
import {
''',
    '''import { useI18n } from '@/lib/i18n';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import {
''',
    'add dialog import',
)

replace_once(
    "    title: 'طلب فحص حسابك',\n",
    "    title: 'طلب فحص حسابك',\n    viewDetails: 'عرض التفاصيل',\n",
    'Arabic inspection details text',
)
replace_once(
    "    title: 'داواکاری پشکنینی هەژمارەکەت',\n",
    "    title: 'داواکاری پشکنینی هەژمارەکەت',\n    viewDetails: 'بینینی وردەکارییەکان',\n",
    'Kurdish inspection details text',
)
replace_once(
    "    title: 'Account inspection request',\n",
    "    title: 'Account inspection request',\n    viewDetails: 'View details',\n",
    'English inspection details text',
)

replace_once(
    '''  const [inspectionDecision, setInspectionDecision] = useState<'approve' | 'reject' | null>(null);
  const [formError, setFormError] = useState('');
''',
    '''  const [inspectionDecision, setInspectionDecision] = useState<'approve' | 'reject' | null>(null);
  const [showInspectionDetails, setShowInspectionDetails] = useState(false);
  const [formError, setFormError] = useState('');
''',
    'merchant inspection details state',
)

replace_once(
    '''  const latestInspectionEndLabel = latestInspectionRequest
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

''',
    '''  const latestInspectionEndLabel = latestInspectionRequest
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
  const latestInspectionStatusLabel = latestInspectionRequest
    ? latestInspectionDecision === 'approved'
      ? inspectionText.approved
      : latestInspectionDecision === 'rejected'
        ? inspectionText.rejected
        : latestInspectionRequest.status === 'pending'
          ? inspectionText.pending
          : inspectionText.expired
    : '';
  const latestInspectionModeLabel = latestInspectionRequest
    ? latestInspectionRequest.mode === 'live_observation'
      ? inspectionText.live
      : inspectionText.readOnly
    : '';
  const latestInspectionToneClass = latestInspectionRequest
    ? latestInspectionDecision === 'approved'
      ? 'border-green-300 bg-green-50 dark:border-green-800 dark:bg-green-950/30'
      : latestInspectionDecision === 'rejected'
        ? 'border-red-300 bg-red-50 dark:border-red-800 dark:bg-red-950/30'
        : latestInspectionRequest.status === 'pending'
          ? 'border-yellow-300 bg-yellow-50 dark:border-yellow-800 dark:bg-yellow-950/30'
          : 'border-border bg-muted/40'
    : '';

''',
    'merchant inspection display helpers',
)

old_panel = '''              {latestInspectionRequest && (
                <div className={`shrink-0 border-b p-3 ${
                  latestInspectionDecision === 'approved'
                    ? 'border-green-300 bg-green-50 dark:border-green-800 dark:bg-green-950/30'
                    : latestInspectionDecision === 'rejected'
                      ? 'border-red-300 bg-red-50 dark:border-red-800 dark:bg-red-950/30'
                      : latestInspectionRequest.status === 'pending'
                        ? 'border-yellow-300 bg-yellow-50 dark:border-yellow-800 dark:bg-yellow-950/30'
                        : 'bg-muted/40'
                }`}>
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-sm font-black">{inspectionText.title}</p>
                      <p className="mt-1 text-xs"><strong>{inspectionText.requestedBy}:</strong> {latestInspectionRequest.admin_name}</p>
                      <p className="mt-1 text-xs"><strong>{inspectionText.mode}:</strong> {latestInspectionRequest.mode === 'live_observation' ? inspectionText.live : inspectionText.readOnly}</p>
                      <p className="mt-1 text-xs leading-5"><strong>{inspectionText.reason}:</strong> {latestInspectionRequest.reason}</p>
                    </div>
                    <span className="rounded-full bg-background/80 px-2.5 py-1 text-[10px] font-black">
                      {latestInspectionDecision === 'approved'
                        ? inspectionText.approved
                        : latestInspectionDecision === 'rejected'
                          ? inspectionText.rejected
                          : latestInspectionRequest.status === 'pending'
                            ? inspectionText.pending
                            : inspectionText.expired}
                    </span>
                  </div>
                  <p className="mt-2 text-[10px] leading-4 text-muted-foreground">{inspectionText.rules}</p>
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
                    <>
                      <p className="mt-1 text-[10px] text-muted-foreground">
                        {inspectionText.requestExpires}: {new Date(latestInspectionRequest.request_expires_at).toLocaleString(locale)}
                      </p>
                      <div className="mt-2 flex flex-wrap gap-2">
                        <button
                          type="button"
                          disabled={inspectionDecision !== null}
                          onClick={() => void respondToInspectionRequest('approve')}
                          className="rounded-xl bg-green-600 px-4 py-2 text-xs font-bold text-white disabled:opacity-60"
                        >
                          {inspectionDecision === 'approve' ? inspectionText.deciding : inspectionText.approve}
                        </button>
                        <button
                          type="button"
                          disabled={inspectionDecision !== null}
                          onClick={() => void respondToInspectionRequest('reject')}
                          className="rounded-xl bg-red-600 px-4 py-2 text-xs font-bold text-white disabled:opacity-60"
                        >
                          {inspectionDecision === 'reject' ? inspectionText.deciding : inspectionText.reject}
                        </button>
                      </div>
                    </>
                  )}
                  {latestInspectionDecision === 'approved' && latestInspectionRequest.session_expires_at && !latestInspectionRequest.ended_at && (
                    <p className="mt-2 text-[10px] font-semibold text-green-800 dark:text-green-200">
                      {inspectionText.approvedUntil}: {new Date(latestInspectionRequest.session_expires_at).toLocaleString(locale)}
                    </p>
                  )}
                </div>
              )}


'''

new_panel = '''              {latestInspectionRequest && (
                <>
                  <div className={`shrink-0 border-b px-3 py-2 ${latestInspectionToneClass}`}>
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex min-w-0 flex-wrap items-center gap-2 text-xs">
                        <strong>{inspectionText.title}</strong>
                        <span className="rounded-full bg-background/80 px-2.5 py-1 text-[10px] font-black">
                          {latestInspectionStatusLabel}
                        </span>
                        <span className="max-w-full truncate text-muted-foreground sm:max-w-[320px]">
                          {latestInspectionModeLabel}
                        </span>
                        {latestInspectionEndLabel && (
                          <span className="rounded-full border bg-background/70 px-2 py-0.5 text-[10px] font-bold text-muted-foreground">
                            {latestInspectionEndLabel}
                          </span>
                        )}
                      </div>
                      <button
                        type="button"
                        onClick={() => setShowInspectionDetails(true)}
                        className="inline-flex h-8 shrink-0 items-center gap-2 rounded-xl border bg-background px-3 text-xs font-bold shadow-sm"
                      >
                        <Eye className="h-3.5 w-3.5" />
                        {inspectionText.viewDetails}
                      </button>
                    </div>
                  </div>

                  <Dialog open={showInspectionDetails} onOpenChange={setShowInspectionDetails}>
                    <DialogContent
                      className="max-w-xl"
                      closeButtonClassName={dir === 'rtl' ? 'left-4 right-auto' : 'left-auto right-4'}
                      dir={dir}
                      onOpenAutoFocus={(event) => event.preventDefault()}
                    >
                      <DialogHeader>
                        <DialogTitle className="text-start">{inspectionText.title}</DialogTitle>
                      </DialogHeader>

                      <div className={`rounded-xl border p-4 ${latestInspectionToneClass}`}>
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <span className="rounded-full bg-background/80 px-2.5 py-1 text-xs font-black">
                            {latestInspectionStatusLabel}
                          </span>
                          {latestInspectionEndLabel && (
                            <span className="rounded-full border bg-background/70 px-2.5 py-1 text-xs font-bold text-muted-foreground">
                              {latestInspectionEndLabel}
                            </span>
                          )}
                        </div>

                        <div className="mt-3 space-y-2 text-sm leading-6">
                          <p><strong>{inspectionText.requestedBy}:</strong> {latestInspectionRequest.admin_name}</p>
                          <p><strong>{inspectionText.mode}:</strong> {latestInspectionModeLabel}</p>
                          <p className="whitespace-pre-wrap"><strong>{inspectionText.reason}:</strong> {latestInspectionRequest.reason}</p>
                        </div>

                        <p className="mt-3 rounded-lg border bg-background/70 px-3 py-2 text-xs leading-5 text-muted-foreground">
                          {inspectionText.rules}
                        </p>

                        {latestInspectionRequest.responded_at && latestInspectionDecision && (
                          <p className="mt-2 text-xs text-muted-foreground">
                            {inspectionText.decisionAt}: {new Date(latestInspectionRequest.responded_at).toLocaleString(locale)}
                          </p>
                        )}

                        {latestInspectionRequest.ended_at && latestInspectionEndLabel && (
                          <p className="mt-1 text-xs text-muted-foreground">
                            {inspectionText.endedAt}: {new Date(latestInspectionRequest.ended_at).toLocaleString(locale)}
                          </p>
                        )}

                        {latestInspectionRequest.status === 'pending' && !latestInspectionRequest.ended_at && (
                          <>
                            <p className="mt-2 text-xs text-muted-foreground">
                              {inspectionText.requestExpires}: {new Date(latestInspectionRequest.request_expires_at).toLocaleString(locale)}
                            </p>
                            <div className="mt-3 flex flex-wrap gap-2">
                              <button
                                type="button"
                                disabled={inspectionDecision !== null}
                                onClick={() => void respondToInspectionRequest('approve')}
                                className="rounded-xl bg-green-600 px-4 py-2 text-xs font-bold text-white disabled:opacity-60"
                              >
                                {inspectionDecision === 'approve' ? inspectionText.deciding : inspectionText.approve}
                              </button>
                              <button
                                type="button"
                                disabled={inspectionDecision !== null}
                                onClick={() => void respondToInspectionRequest('reject')}
                                className="rounded-xl bg-red-600 px-4 py-2 text-xs font-bold text-white disabled:opacity-60"
                              >
                                {inspectionDecision === 'reject' ? inspectionText.deciding : inspectionText.reject}
                              </button>
                            </div>
                          </>
                        )}

                        {latestInspectionDecision === 'approved' && latestInspectionRequest.session_expires_at && !latestInspectionRequest.ended_at && (
                          <p className="mt-3 text-xs font-semibold text-green-800 dark:text-green-200">
                            {inspectionText.approvedUntil}: {new Date(latestInspectionRequest.session_expires_at).toLocaleString(locale)}
                          </p>
                        )}
                      </div>
                    </DialogContent>
                  </Dialog>
                </>
              )}


'''

replace_once(old_panel, new_panel, 'compact merchant inspection panel')

path.write_text(text, encoding='utf-8')
print('Compacted the merchant inspection request into a summary bar with a details dialog.')
