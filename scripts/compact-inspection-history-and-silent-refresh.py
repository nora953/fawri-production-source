from pathlib import Path

MERCHANT = Path('artifacts/fawri/src/pages/dashboard/SupportPage.tsx')
ADMIN = Path('artifacts/fawri/src/components/admin/AdminSupportTab.tsx')


def replace_once(text: str, old: str, new: str, label: str) -> str:
    count = text.count(old)
    if count != 1:
        raise RuntimeError(f'{label}: expected one match, found {count}')
    return text.replace(old, new, 1)


# Merchant support: keep polling/realtime updates silent after first load.
merchant = MERCHANT.read_text(encoding='utf-8')
merchant = replace_once(
    merchant,
    '''  const loadTickets = useCallback(async () => {
    setLoading(true);
    setLoadError(false);
    try {
''',
    '''  const loadTickets = useCallback(async (silent = false) => {
    if (!silent) {
      setLoading(true);
      setLoadError(false);
    }
    try {
''',
    'merchant silent load start',
)
merchant = replace_once(
    merchant,
    '''    } catch (error) {
      console.error('Could not load support tickets:', error);
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadTickets();
    const intervalId = window.setInterval(() => void loadTickets(), 10_000);
    const handleFocus = () => void loadTickets();
    const handleRealtime = (event: Event) => {
      const detail = (event as CustomEvent<MerchantRealtimeDetail>).detail;
      if (detail?.event === 'support_updated') void loadTickets();
    };
''',
    '''    } catch (error) {
      console.error('Could not load support tickets:', error);
      if (!silent) setLoadError(true);
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadTickets();
    const intervalId = window.setInterval(() => void loadTickets(true), 10_000);
    const handleFocus = () => void loadTickets(true);
    const handleRealtime = (event: Event) => {
      const detail = (event as CustomEvent<MerchantRealtimeDetail>).detail;
      if (detail?.event === 'support_updated') void loadTickets(true);
    };
''',
    'merchant silent refresh callers',
)
MERCHANT.write_text(merchant, encoding='utf-8')


# Admin/owner support: compact inspection history bar and detailed history dialog.
admin = ADMIN.read_text(encoding='utf-8')

for language, old, new in [
    (
        'Arabic',
        """    inspectionDuration: 'المدة عند الموافقة: 30 دقيقة',
""",
        """    inspectionDuration: 'المدة عند الموافقة: 30 دقيقة',
    inspectionHistory: 'سجل طلبات الفحص',
    inspectionViewHistory: 'عرض السجل',
    inspectionRequestedAt: 'وقت الطلب',
""",
    ),
    (
        'Kurdish',
        """    inspectionDuration: 'ماوە لە دوای ڕەزامەندی: 30 خولەک',
""",
        """    inspectionDuration: 'ماوە لە دوای ڕەزامەندی: 30 خولەک',
    inspectionHistory: 'تۆماری داواکارییەکانی پشکنین',
    inspectionViewHistory: 'بینینی تۆمار',
    inspectionRequestedAt: 'کاتی داواکاری',
""",
    ),
    (
        'English',
        """    inspectionDuration: 'Duration after approval: 30 minutes',
""",
        """    inspectionDuration: 'Duration after approval: 30 minutes',
    inspectionHistory: 'Inspection request history',
    inspectionViewHistory: 'View history',
    inspectionRequestedAt: 'Requested at',
""",
    ),
]:
    admin = replace_once(admin, old, new, f'{language} inspection history strings')

admin = replace_once(
    admin,
    '''  const [showInspectionForm, setShowInspectionForm] = useState(false);
  const [inspectionMode, setInspectionMode] = useState<InspectionSessionMode>('live_observation');
''',
    '''  const [showInspectionForm, setShowInspectionForm] = useState(false);
  const [showInspectionHistory, setShowInspectionHistory] = useState(false);
  const [inspectionMode, setInspectionMode] = useState<InspectionSessionMode>('live_observation');
''',
    'admin inspection history state',
)

admin = replace_once(
    admin,
    '''  const latestInspectionRequest = selectedTicket?.inspection_requests?.[0] ?? null;

  useEffect(() => {
    setShowInspectionForm(false);
''',
    '''  const inspectionRequests = selectedTicket?.inspection_requests ?? [];
  const latestInspectionRequest = inspectionRequests[0] ?? null;

  useEffect(() => {
    setShowInspectionForm(false);
    setShowInspectionHistory(false);
''',
    'admin inspection history selection state',
)

old_panel = '''                {latestInspectionRequest && (
                  <div className={`shrink-0 border-b px-3 py-2 ${inspectionStatusClass(latestInspectionRequest.status)}`}>
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-xs font-black">{text.inspectionTitle}</p>
                        <p className="mt-1 text-xs font-semibold">{inspectionModeLabel(latestInspectionRequest.mode)}</p>
                        <p className="mt-1 text-xs leading-5">{latestInspectionRequest.reason}</p>
                      </div>
                      <span className="rounded-full bg-background/70 px-2.5 py-1 text-[10px] font-black">
                        {inspectionStatusLabel(latestInspectionRequest.status)}
                      </span>
                    </div>
                    <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[10px] opacity-80">
                      <span>{text.inspectionRequestedBy}: {latestInspectionRequest.admin_name}</span>
                      <span>{text.inspectionDuration}</span>
                      {latestInspectionRequest.status === 'pending' && (
                        <span>{text.inspectionExpires}: {new Date(latestInspectionRequest.request_expires_at).toLocaleString(locale)}</span>
                      )}
                    </div>
                  </div>
                )}
'''
new_panel = '''                {latestInspectionRequest && (
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
admin = replace_once(admin, old_panel, new_panel, 'compact admin inspection history bar')

request_dialog_end = '''      </Dialog>
    </section>
  );
}
'''

history_dialog = '''      </Dialog>

      <Dialog open={showInspectionHistory} onOpenChange={setShowInspectionHistory}>
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
    </section>
  );
}
'''
admin = replace_once(admin, request_dialog_end, history_dialog, 'admin inspection history dialog')

ADMIN.write_text(admin, encoding='utf-8')

print('Added silent merchant support refresh and compact admin inspection history.')
