from pathlib import Path

api_path = Path('artifacts/api-server/src/routes/auth.ts')
ui_path = Path('artifacts/fawri/src/pages/dashboard/SupportPage.tsx')

api = api_path.read_text(encoding='utf-8')
ui = ui_path.read_text(encoding='utf-8')


def replace_once(text: str, old: str, new: str, label: str) -> str:
    count = text.count(old)
    if count != 1:
        raise RuntimeError(f'{label}: expected one match, found {count}')
    return text.replace(old, new, 1)


# API: merchant-owned endpoint for immediately ending an active approved inspection.
api_anchor = '''    return res.json({ ok: true, ticket, inspection_request: inspectionRequest });
  },
);

router.get("/subscription/current", requireMerchantSession, (_req: Request, res: Response) => {
'''
api_replacement = '''    return res.json({ ok: true, ticket, inspection_request: inspectionRequest });
  },
);

router.post(
  "/support/tickets/:id/inspection-requests/:requestId/terminate",
  requireMerchantSession,
  (req: Request, res: Response) => {
    const merchantId = getMerchantIdFromSession(res);
    const ticketId = String(req.params.id || "").trim();
    const requestId = String(req.params.requestId || "").trim();
    const db = ensureDb();
    if (refreshInspectionRequestExpirations(db)) writeDb(db);

    const ticket = db.support_tickets.find(
      (item) => item.id === ticketId && item.merchant_id === merchantId,
    );
    if (!ticket) return sendError(res, 404, "support ticket not found");

    const inspectionRequest = (ticket.inspection_requests || []).find(
      (item) => item.id === requestId,
    );
    if (!inspectionRequest) {
      return sendError(res, 404, "inspection session request not found");
    }

    const sessionExpiresAt = new Date(
      inspectionRequest.session_expires_at || 0,
    ).getTime();
    const activeApprovedSession =
      inspectionRequest.status === "approved" &&
      inspectionRequest.consent_decision === "approved" &&
      !inspectionRequest.ended_at &&
      Number.isFinite(sessionExpiresAt) &&
      sessionExpiresAt > Date.now();

    if (!activeApprovedSession) {
      return sendError(res, 409, "inspection session is not active", {
        code: "INSPECTION_SESSION_NOT_ACTIVE",
        status: inspectionRequest.status,
        end_reason: inspectionRequest.end_reason || "",
      });
    }

    const endedAt = now();
    inspectionRequest.end_reason = "merchant_terminated";
    inspectionRequest.ended_at = endedAt;
    ticket.updated_at = endedAt;

    writeDb(db);
    emitMerchantRealtimeState(db, merchantId, "support_updated");
    return res.json({
      ok: true,
      ticket,
      inspection_request: inspectionRequest,
    });
  },
);

router.get("/subscription/current", requireMerchantSession, (_req: Request, res: Response) => {
'''
api = replace_once(api, api_anchor, api_replacement, 'insert merchant termination route')

# UI translations.
ui = replace_once(
    ui,
    "    merchantTerminated: 'تم إنهاء الجلسة من قبلك',\n",
    "    merchantTerminated: 'تم إنهاء الجلسة من قبلك',\n"
    "    terminate: 'إنهاء الجلسة',\n"
    "    terminateConfirm: 'هل أنت متأكد من إنهاء جلسة الفحص؟ ستتوقف صلاحية الفحص فورًا.',\n"
    "    confirmTerminate: 'تأكيد الإنهاء',\n"
    "    cancelTerminate: 'تراجع',\n"
    "    terminating: 'جارٍ الإنهاء...',\n"
    "    terminateError: 'تعذر إنهاء الجلسة.',\n",
    'add Arabic termination text',
)
ui = replace_once(
    ui,
    "    merchantTerminated: 'دانیشتنەکەت کۆتایی پێهێنا',\n",
    "    merchantTerminated: 'دانیشتنەکەت کۆتایی پێهێنا',\n"
    "    terminate: 'کۆتاییهێنان بە دانیشتن',\n"
    "    terminateConfirm: 'دڵنیایت دەتەوێت دانیشتنی پشکنین کۆتایی پێبهێنیت؟ دەسەڵاتی پشکنین دەستبەجێ دەوەستێت.',\n"
    "    confirmTerminate: 'پشتڕاستکردنەوەی کۆتاییهێنان',\n"
    "    cancelTerminate: 'پاشگەزبوونەوە',\n"
    "    terminating: 'کۆتایی پێدەهێنرێت...',\n"
    "    terminateError: 'کۆتاییهێنان بە دانیشتن سەرکەوتوو نەبوو.',\n",
    'add Kurdish termination text',
)
ui = replace_once(
    ui,
    "    merchantTerminated: 'You ended the session',\n",
    "    merchantTerminated: 'You ended the session',\n"
    "    terminate: 'End session',\n"
    "    terminateConfirm: 'Are you sure you want to end the inspection session? Inspection access will stop immediately.',\n"
    "    confirmTerminate: 'Confirm end',\n"
    "    cancelTerminate: 'Cancel',\n"
    "    terminating: 'Ending...',\n"
    "    terminateError: 'Could not end the session.',\n",
    'add English termination text',
)

# UI state.
ui = replace_once(
    ui,
    "  const [inspectionDecision, setInspectionDecision] = useState<'approve' | 'reject' | null>(null);\n  const [showInspectionDetails, setShowInspectionDetails] = useState(false);\n",
    "  const [inspectionDecision, setInspectionDecision] = useState<'approve' | 'reject' | null>(null);\n"
    "  const [confirmInspectionTermination, setConfirmInspectionTermination] = useState(false);\n"
    "  const [terminatingInspection, setTerminatingInspection] = useState(false);\n"
    "  const [inspectionTerminationError, setInspectionTerminationError] = useState('');\n"
    "  const [showInspectionDetails, setShowInspectionDetails] = useState(false);\n",
    'add termination state',
)

# UI action.
respond_tail = '''  const createTicket = async (event: React.FormEvent) => {
'''
terminate_function = '''  const terminateInspectionRequest = async () => {
    if (
      !selectedTicket ||
      !latestInspectionRequest ||
      latestInspectionDecision !== 'approved' ||
      latestInspectionRequest.ended_at
    ) {
      return;
    }

    setTerminatingInspection(true);
    setInspectionTerminationError('');
    try {
      const response = await fetch(
        `/api/auth/support/tickets/${encodeURIComponent(selectedTicket.id)}/inspection-requests/${encodeURIComponent(latestInspectionRequest.id)}/terminate`,
        { method: 'POST' },
      );
      const data = await response.json().catch(() => null);
      if (!response.ok || !data?.ok || !data.ticket) {
        throw new Error(data?.error || 'could not terminate inspection session');
      }

      const ticket = data.ticket as SupportTicket;
      setTickets((current) =>
        [ticket, ...current.filter((item) => item.id !== ticket.id)].sort(
          (left, right) =>
            new Date(right.updated_at).getTime() - new Date(left.updated_at).getTime(),
        ),
      );
      setSelectedId(ticket.id);
      setConfirmInspectionTermination(false);
    } catch (error) {
      console.error('Could not terminate inspection session:', error);
      setInspectionTerminationError(inspectionText.terminateError);
    } finally {
      setTerminatingInspection(false);
    }
  };

  const createTicket = async (event: React.FormEvent) => {
'''
ui = replace_once(ui, respond_tail, terminate_function, 'add termination action')

# Reset confirmation when the details dialog closes.
ui = replace_once(
    ui,
    "                  <Dialog open={showInspectionDetails} onOpenChange={setShowInspectionDetails}>\n",
    "                  <Dialog\n"
    "                    open={showInspectionDetails}\n"
    "                    onOpenChange={(open) => {\n"
    "                      setShowInspectionDetails(open);\n"
    "                      if (!open) {\n"
    "                        setConfirmInspectionTermination(false);\n"
    "                        setInspectionTerminationError('');\n"
    "                      }\n"
    "                    }}\n"
    "                  >\n",
    'reset termination confirmation on close',
)

# Replace the approved-session footer with expiry plus a professional inline confirmation flow.
approved_block = '''                        {latestInspectionDecision === 'approved' && latestInspectionRequest.session_expires_at && !latestInspectionRequest.ended_at && (
                          <p className="mt-3 text-xs font-semibold text-green-800 dark:text-green-200">
                            {inspectionText.approvedUntil}: <bdi dir="ltr">{formatInspectionDateTime(latestInspectionRequest.session_expires_at)}</bdi>
                          </p>
                        )}
'''
approved_replacement = '''                        {latestInspectionDecision === 'approved' && latestInspectionRequest.session_expires_at && !latestInspectionRequest.ended_at && (
                          <div className="mt-3 space-y-3">
                            <p className="text-xs font-semibold text-green-800 dark:text-green-200">
                              {inspectionText.approvedUntil}: <bdi dir="ltr">{formatInspectionDateTime(latestInspectionRequest.session_expires_at)}</bdi>
                            </p>

                            {!confirmInspectionTermination ? (
                              <button
                                type="button"
                                disabled={terminatingInspection}
                                onClick={() => {
                                  setInspectionTerminationError('');
                                  setConfirmInspectionTermination(true);
                                }}
                                className="inline-flex h-9 items-center justify-center rounded-xl bg-red-600 px-4 text-xs font-bold text-white transition hover:bg-red-700 disabled:opacity-60"
                              >
                                {inspectionText.terminate}
                              </button>
                            ) : (
                              <div className="rounded-xl border border-red-300 bg-red-50 p-3 dark:border-red-800 dark:bg-red-950/30">
                                <p className="text-xs font-semibold leading-5 text-red-900 dark:text-red-100">
                                  {inspectionText.terminateConfirm}
                                </p>
                                <div className="mt-3 flex flex-wrap gap-2">
                                  <button
                                    type="button"
                                    disabled={terminatingInspection}
                                    onClick={() => void terminateInspectionRequest()}
                                    className="inline-flex h-9 items-center justify-center rounded-xl bg-red-600 px-4 text-xs font-bold text-white transition hover:bg-red-700 disabled:opacity-60"
                                  >
                                    {terminatingInspection
                                      ? inspectionText.terminating
                                      : inspectionText.confirmTerminate}
                                  </button>
                                  <button
                                    type="button"
                                    disabled={terminatingInspection}
                                    onClick={() => {
                                      setConfirmInspectionTermination(false);
                                      setInspectionTerminationError('');
                                    }}
                                    className="inline-flex h-9 items-center justify-center rounded-xl border bg-background px-4 text-xs font-bold disabled:opacity-60"
                                  >
                                    {inspectionText.cancelTerminate}
                                  </button>
                                </div>
                              </div>
                            )}

                            {inspectionTerminationError && (
                              <p className="text-xs font-bold text-red-700 dark:text-red-300">
                                {inspectionTerminationError}
                              </p>
                            )}
                          </div>
                        )}
'''
ui = replace_once(ui, approved_block, approved_replacement, 'add merchant termination controls')

api_path.write_text(api, encoding='utf-8')
ui_path.write_text(ui, encoding='utf-8')
print('Added merchant-controlled inspection termination with server authorization and audit state.')
