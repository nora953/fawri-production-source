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
"""                      <button
                        type=\"button\"
                        onClick={() => setShowInspectionDetails(true)}
                        className=\"inline-flex h-8 shrink-0 items-center gap-2 rounded-xl border bg-background px-3 text-xs font-bold shadow-sm\"
                      >
                        <Eye className=\"h-3.5 w-3.5\" />
                        {inspectionText.viewDetails}
                      </button>
""",
"""                      <div className=\"flex flex-wrap items-center gap-2\">
                        <button
                          type=\"button\"
                          onClick={() => setShowInspectionDetails(true)}
                          className=\"inline-flex h-8 shrink-0 items-center gap-2 rounded-xl border bg-background px-3 text-xs font-bold shadow-sm\"
                        >
                          <Eye className=\"h-3.5 w-3.5\" />
                          {inspectionText.viewDetails}
                        </button>

                        {latestInspectionRequest.status === 'pending' && !latestInspectionRequest.ended_at && (
                          <>
                            <button
                              type=\"button\"
                              disabled={inspectionDecision !== null}
                              onClick={() => void respondToInspectionRequest('approve')}
                              className=\"inline-flex h-8 shrink-0 items-center justify-center rounded-xl bg-green-600 px-3 text-xs font-bold text-white transition hover:bg-green-700 disabled:opacity-60\"
                            >
                              {inspectionDecision === 'approve' ? inspectionText.deciding : inspectionText.approve}
                            </button>
                            <button
                              type=\"button\"
                              disabled={inspectionDecision !== null}
                              onClick={() => void respondToInspectionRequest('reject')}
                              className=\"inline-flex h-8 shrink-0 items-center justify-center rounded-xl bg-red-600 px-3 text-xs font-bold text-white transition hover:bg-red-700 disabled:opacity-60\"
                            >
                              {inspectionDecision === 'reject' ? inspectionText.deciding : inspectionText.reject}
                            </button>
                          </>
                        )}

                        {latestInspectionDecision === 'approved' &&
                          latestInspectionRequest.session_expires_at &&
                          !latestInspectionRequest.ended_at && (
                            <button
                              type=\"button\"
                              disabled={terminatingInspection}
                              onClick={() => {
                                setInspectionTerminationError('');
                                setConfirmInspectionTermination(true);
                                setShowInspectionDetails(true);
                              }}
                              className=\"inline-flex h-8 shrink-0 items-center justify-center rounded-xl bg-red-600 px-3 text-xs font-bold text-white transition hover:bg-red-700 disabled:opacity-60\"
                            >
                              {inspectionText.terminate}
                            </button>
                          )}
                      </div>
""",
'move inspection actions into summary bar',
)

replace_once(
"""                        {latestInspectionRequest.status === 'pending' && !latestInspectionRequest.ended_at && (
                          <>
                            <p className=\"mt-2 text-xs text-muted-foreground\">
                              {inspectionText.requestExpires}: <bdi dir=\"ltr\">{formatInspectionDateTime(latestInspectionRequest.request_expires_at)}</bdi>
                            </p>
                            <div className=\"mt-3 flex flex-wrap gap-2\">
                              <button
                                type=\"button\"
                                disabled={inspectionDecision !== null}
                                onClick={() => void respondToInspectionRequest('approve')}
                                className=\"rounded-xl bg-green-600 px-4 py-2 text-xs font-bold text-white disabled:opacity-60\"
                              >
                                {inspectionDecision === 'approve' ? inspectionText.deciding : inspectionText.approve}
                              </button>
                              <button
                                type=\"button\"
                                disabled={inspectionDecision !== null}
                                onClick={() => void respondToInspectionRequest('reject')}
                                className=\"rounded-xl bg-red-600 px-4 py-2 text-xs font-bold text-white disabled:opacity-60\"
                              >
                                {inspectionDecision === 'reject' ? inspectionText.deciding : inspectionText.reject}
                              </button>
                            </div>
                          </>
                        )}
""",
"""                        {latestInspectionRequest.status === 'pending' && !latestInspectionRequest.ended_at && (
                          <p className=\"mt-2 text-xs text-muted-foreground\">
                            {inspectionText.requestExpires}: <bdi dir=\"ltr\">{formatInspectionDateTime(latestInspectionRequest.request_expires_at)}</bdi>
                          </p>
                        )}
""",
'remove approve and reject actions from details dialog',
)

replace_once(
"""                        {latestInspectionDecision === 'approved' && latestInspectionRequest.session_expires_at && !latestInspectionRequest.ended_at && (
                          <div className=\"mt-3 space-y-3\">
                            <p className=\"text-xs font-semibold text-green-800 dark:text-green-200\">
                              {inspectionText.approvedUntil}: <bdi dir=\"ltr\">{formatInspectionDateTime(latestInspectionRequest.session_expires_at)}</bdi>
                            </p>

                            {!confirmInspectionTermination ? (
                              <button
                                type=\"button\"
                                disabled={terminatingInspection}
                                onClick={() => {
                                  setInspectionTerminationError('');
                                  setConfirmInspectionTermination(true);
                                }}
                                className=\"inline-flex h-9 items-center justify-center rounded-xl bg-red-600 px-4 text-xs font-bold text-white transition hover:bg-red-700 disabled:opacity-60\"
                              >
                                {inspectionText.terminate}
                              </button>
                            ) : (
                              <div className=\"rounded-xl border border-red-300 bg-red-50 p-3 dark:border-red-800 dark:bg-red-950/30\">
                                <p className=\"text-xs font-semibold leading-5 text-red-900 dark:text-red-100\">
                                  {inspectionText.terminateConfirm}
                                </p>
                                <div className=\"mt-3 flex flex-wrap gap-2\">
                                  <button
                                    type=\"button\"
                                    disabled={terminatingInspection}
                                    onClick={() => void terminateInspectionRequest()}
                                    className=\"inline-flex h-9 items-center justify-center rounded-xl bg-red-600 px-4 text-xs font-bold text-white transition hover:bg-red-700 disabled:opacity-60\"
                                  >
                                    {terminatingInspection
                                      ? inspectionText.terminating
                                      : inspectionText.confirmTerminate}
                                  </button>
                                  <button
                                    type=\"button\"
                                    disabled={terminatingInspection}
                                    onClick={() => {
                                      setConfirmInspectionTermination(false);
                                      setInspectionTerminationError('');
                                    }}
                                    className=\"inline-flex h-9 items-center justify-center rounded-xl border bg-background px-4 text-xs font-bold disabled:opacity-60\"
                                  >
                                    {inspectionText.cancelTerminate}
                                  </button>
                                </div>
                              </div>
                            )}

                            {inspectionTerminationError && (
                              <p className=\"text-xs font-bold text-red-700 dark:text-red-300\">
                                {inspectionTerminationError}
                              </p>
                            )}
                          </div>
                        )}
""",
"""                        {latestInspectionDecision === 'approved' && latestInspectionRequest.session_expires_at && !latestInspectionRequest.ended_at && (
                          <div className=\"mt-3 space-y-3\">
                            <p className=\"text-xs font-semibold text-green-800 dark:text-green-200\">
                              {inspectionText.approvedUntil}: <bdi dir=\"ltr\">{formatInspectionDateTime(latestInspectionRequest.session_expires_at)}</bdi>
                            </p>

                            {confirmInspectionTermination && (
                              <div className=\"rounded-xl border border-red-300 bg-red-50 p-3 dark:border-red-800 dark:bg-red-950/30\">
                                <p className=\"text-xs font-semibold leading-5 text-red-900 dark:text-red-100\">
                                  {inspectionText.terminateConfirm}
                                </p>
                                <div className=\"mt-3 flex flex-wrap gap-2\">
                                  <button
                                    type=\"button\"
                                    disabled={terminatingInspection}
                                    onClick={() => void terminateInspectionRequest()}
                                    className=\"inline-flex h-9 items-center justify-center rounded-xl bg-red-600 px-4 text-xs font-bold text-white transition hover:bg-red-700 disabled:opacity-60\"
                                  >
                                    {terminatingInspection
                                      ? inspectionText.terminating
                                      : inspectionText.confirmTerminate}
                                  </button>
                                  <button
                                    type=\"button\"
                                    disabled={terminatingInspection}
                                    onClick={() => {
                                      setConfirmInspectionTermination(false);
                                      setInspectionTerminationError('');
                                    }}
                                    className=\"inline-flex h-9 items-center justify-center rounded-xl border bg-background px-4 text-xs font-bold disabled:opacity-60\"
                                  >
                                    {inspectionText.cancelTerminate}
                                  </button>
                                </div>
                              </div>
                            )}

                            {inspectionTerminationError && (
                              <p className=\"text-xs font-bold text-red-700 dark:text-red-300\">
                                {inspectionTerminationError}
                              </p>
                            )}
                          </div>
                        )}
""",
'keep only termination confirmation inside details dialog',
)

path.write_text(text, encoding='utf-8')
print('Moved merchant inspection actions into the summary bar above the conversation.')
