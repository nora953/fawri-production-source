from pathlib import Path

path = Path('artifacts/fawri/src/components/admin/AdminSupportTab.tsx')
text = path.read_text(encoding='utf-8')


def replace_once(old: str, new: str, label: str) -> None:
    global text
    count = text.count(old)
    if count != 1:
        raise RuntimeError(f'{label}: expected one match, found {count}')
    text = text.replace(old, new, 1)


old_header = '''              <div className="shrink-0 border-b p-3">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h3 className="font-black">{selectedTicket.subject}</h3>
                    <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                      <span>{text.merchant}: <strong className="text-foreground">{selectedTicket.merchant_name}</strong></span>
                      <span>{text.phone}: <strong dir="ltr" className="text-foreground">{selectedTicket.merchant_phone}</strong></span>
                    </div>
                    <p className="mt-1.5 text-xs text-muted-foreground">
                      {text.assignedTo}: <strong className="text-foreground">{selectedTicket.assigned_admin_name || text.unassigned}</strong>
                    </p>
                  </div>
                  <span
                    className={`rounded-full px-3 py-1 text-xs font-bold ${statusBadgeClass(
                      selectedTicket.status,
                    )}`}
                  >
                    {statusLabel(selectedTicket.status)}
                  </span>
                </div>

                {!isOwner && ticketIsActive && !selectedTicket.assigned_admin_id && (
                  <Button
                    className="mt-3"
                    size="sm"
                    disabled={working !== null}
                    onClick={() => void claimTicket()}
                  >
                    {working === 'claim' ? (
                      <Loader2 className="me-2 h-4 w-4 animate-spin" />
                    ) : (
                      <UserCheck className="me-2 h-4 w-4" />
                    )}
                    {working === 'claim' ? text.claiming : text.claim}
                  </Button>
                )}

                {!isOwner && isAssignedToOther && (
                  <p className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-bold text-amber-900 dark:border-amber-900/70 dark:bg-amber-950/30 dark:text-amber-100">
                    {text.assignedOther}
                  </p>
                )}

                {canRequestInspection && !showInspectionForm && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="mt-3"
                    disabled={working !== null}
                    onClick={() => setShowInspectionForm(true)}
                  >
                    <Eye className="me-2 h-4 w-4" />
                    {text.requestInspection}
                  </Button>
                )}
              </div>

                {latestInspectionRequest && (
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

new_header = '''              <div className="shrink-0 border-b bg-background px-3 py-2.5">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="font-black leading-5">{selectedTicket.subject}</h3>
                      <span
                        className={`rounded-full px-2.5 py-1 text-[11px] font-bold ${statusBadgeClass(
                          selectedTicket.status,
                        )}`}
                      >
                        {statusLabel(selectedTicket.status)}
                      </span>
                    </div>
                    <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] leading-4 text-muted-foreground">
                      <span>{text.merchant}: <strong className="text-foreground">{selectedTicket.merchant_name}</strong></span>
                      <span>{text.phone}: <strong dir="ltr" className="text-foreground">{selectedTicket.merchant_phone}</strong></span>
                      <span>{text.assignedTo}: <strong className="text-foreground">{selectedTicket.assigned_admin_name || text.unassigned}</strong></span>
                    </div>
                  </div>

                  <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
                    {latestInspectionRequest && (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-8"
                        onClick={() => setShowInspectionHistory(true)}
                      >
                        <Eye className="me-2 h-3.5 w-3.5" />
                        {text.inspectionHistory} ({inspectionRequests.length})
                      </Button>
                    )}

                    {canRequestInspection && !showInspectionForm && (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-8"
                        disabled={working !== null}
                        onClick={() => setShowInspectionForm(true)}
                      >
                        <Eye className="me-2 h-3.5 w-3.5" />
                        {text.requestInspection}
                      </Button>
                    )}

                    {!isOwner && ticketIsActive && !selectedTicket.assigned_admin_id && (
                      <Button
                        className="h-8"
                        size="sm"
                        disabled={working !== null}
                        onClick={() => void claimTicket()}
                      >
                        {working === 'claim' ? (
                          <Loader2 className="me-2 h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <UserCheck className="me-2 h-3.5 w-3.5" />
                        )}
                        {working === 'claim' ? text.claiming : text.claim}
                      </Button>
                    )}
                  </div>
                </div>

                {latestInspectionRequest && (
                  <div className="mt-1.5 flex min-w-0 flex-wrap items-center gap-1.5 text-[10px] leading-4">
                    <span className="text-muted-foreground">{text.inspectionLatestRequest}:</span>
                    <span className={`rounded-full border px-2 py-0.5 font-black ${inspectionDecisionClass(latestInspectionRequest)}`}>
                      {inspectionDecisionLabel(latestInspectionRequest)}
                    </span>
                    <span className="rounded-full border bg-muted/40 px-2 py-0.5 font-bold text-muted-foreground">
                      {inspectionEndLabel(latestInspectionRequest)}
                    </span>
                  </div>
                )}

                {!isOwner && isAssignedToOther && (
                  <p className="mt-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-1.5 text-[11px] font-bold text-amber-900 dark:border-amber-900/70 dark:bg-amber-950/30 dark:text-amber-100">
                    {text.assignedOther}
                  </p>
                )}
              </div>
'''
replace_once(old_header, new_header, 'compact support ticket header')

old_footer = '''              {!isOwner && isAssignedToCurrentAdmin && ticketIsActive && (
                <div className="shrink-0 border-t p-3">
                  <form onSubmit={sendReply} className="flex gap-2">
                    <Textarea
                      value={reply}
                      rows={2}
                      maxLength={4000}
                      disabled={working !== null}
                      placeholder={text.replyPlaceholder}
                      onChange={(event) => setReply(event.target.value)}
                      className="min-h-12 resize-none"
                    />
                    <Button
                      type="submit"
                      className="h-12 w-12 shrink-0 p-0"
                      disabled={working !== null || !reply.trim()}
                      aria-label={text.sendReply}
                    >
                      {working === 'reply' ? (
                        <Loader2 className="h-5 w-5 animate-spin" />
                      ) : (
                        <Send className="h-5 w-5" />
                      )}
                    </Button>
                  </form>
                  <div className="mt-3 flex justify-end">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={working !== null}
                      onClick={() => void resolveTicket()}
                    >
                      {working === 'resolve' ? (
                        <Loader2 className="me-2 h-4 w-4 animate-spin" />
                      ) : (
                        <CheckCircle2 className="me-2 h-4 w-4" />
                      )}
                      {working === 'resolve' ? text.resolving : text.markResolved}
                    </Button>
                  </div>
                </div>
              )}
'''

new_footer = '''              {!isOwner && isAssignedToCurrentAdmin && ticketIsActive && (
                <div className="shrink-0 border-t bg-background p-2.5">
                  <form onSubmit={sendReply} className="flex items-end gap-2">
                    <Textarea
                      value={reply}
                      rows={1}
                      maxLength={4000}
                      disabled={working !== null}
                      placeholder={text.replyPlaceholder}
                      onChange={(event) => setReply(event.target.value)}
                      className="min-h-10 max-h-24 resize-none py-2"
                    />
                    <Button
                      type="submit"
                      className="h-10 w-10 shrink-0 p-0"
                      disabled={working !== null || !reply.trim()}
                      aria-label={text.sendReply}
                    >
                      {working === 'reply' ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Send className="h-4 w-4" />
                      )}
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-10 shrink-0"
                      disabled={working !== null}
                      onClick={() => void resolveTicket()}
                    >
                      {working === 'resolve' ? (
                        <Loader2 className="me-2 h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <CheckCircle2 className="me-2 h-3.5 w-3.5" />
                      )}
                      <span className="hidden sm:inline">{working === 'resolve' ? text.resolving : text.markResolved}</span>
                    </Button>
                  </form>
                </div>
              )}
'''
replace_once(old_footer, new_footer, 'compact support reply footer')

path.write_text(text, encoding='utf-8')
print('Expanded admin and owner support conversation space.')
