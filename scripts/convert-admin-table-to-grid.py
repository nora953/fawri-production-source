from pathlib import Path

PATH = Path('artifacts/fawri/src/pages/AdminPage.tsx')

text = PATH.read_text(encoding='utf-8')
start_marker = '                {/* Desktop table */}\n'
end_marker = '              </>\n            )}'

start = text.find(start_marker)
if start < 0:
    raise RuntimeError('desktop table start marker not found')
end = text.find(end_marker, start)
if end < 0:
    raise RuntimeError('desktop table end marker not found')
if text.find(start_marker, start + len(start_marker)) >= 0:
    raise RuntimeError('multiple desktop table markers found')

replacement = '''                {/* Desktop grid */}
                <div className="hidden xl:block">
                  <div
                    className={
                      "grid items-center gap-2 rounded-t-xl border border-border/80 bg-muted/40 px-3 py-3 " +
                      (canManageSubscriptions
                        ? "grid-cols-[1.05fr_1.05fr_.95fr_1.7fr_1.1fr]"
                        : "grid-cols-[1.15fr_1.15fr_1fr_1.1fr]")
                    }
                  >
                    {[
                      adminText.mainTableStoreOwner,
                      adminText.mainTablePhoneActivity,
                      adminText.mainTableStatus,
                      ...(canManageSubscriptions
                        ? [adminText.mainTablePlanReplies]
                        : []),
                      adminText.mainTableActions,
                    ].map((heading) => (
                      <div
                        key={heading}
                        className="text-center text-xs font-semibold text-muted-foreground"
                      >
                        {heading}
                      </div>
                    ))}
                  </div>

                  <div className="divide-y divide-border/70 rounded-b-xl border-x border-b border-border/80 bg-card shadow-sm">
                    {filteredMerchants.map((m) => {
                      const sub = getSub(m.id);
                      return (
                        <div
                          key={m.id}
                          className={
                            "grid items-stretch gap-2 bg-card p-2.5 transition-colors hover:bg-muted/20 " +
                            (canManageSubscriptions
                              ? "grid-cols-[1.05fr_1.05fr_.95fr_1.7fr_1.1fr]"
                              : "grid-cols-[1.15fr_1.15fr_1fr_1.1fr]")
                          }
                        >
                          <div className="h-full min-w-0">
                            <div className="flex h-full min-h-[190px] flex-col justify-center rounded-xl border border-border/80 bg-gradient-to-b from-muted/30 to-background p-3 shadow-sm">
                              <p className="text-[10px] font-semibold text-muted-foreground">
                                {adminText.detailsStoreName}
                              </p>
                              <p className="mt-1.5 break-words text-base font-black leading-6 text-foreground">
                                {m.store_name}
                              </p>
                              <div className="my-3 h-px bg-border/70" aria-hidden="true" />
                              <p className="text-[10px] font-semibold text-muted-foreground">
                                {adminText.detailsOwnerName}
                              </p>
                              <p className="mt-1.5 break-words rounded-lg bg-muted/60 px-2.5 py-2 text-xs font-semibold leading-5 text-foreground">
                                {m.owner_name}
                              </p>
                              <div className="mt-3 flex items-center justify-between gap-2 border-t border-border/60 pt-2 text-[9px] text-muted-foreground">
                                <span>{adminText.mainTableRegistered}</span>
                                <strong className="font-semibold tabular-nums text-foreground" dir="ltr">
                                  {new Date(m.created_at).toLocaleDateString(locale)}
                                </strong>
                              </div>
                            </div>
                          </div>

                          <div className="h-full min-w-0">
                            <div className="flex h-full min-h-[190px] flex-col justify-center rounded-xl border border-border/80 bg-gradient-to-b from-muted/30 to-background p-3 shadow-sm">
                              <p className="text-[10px] font-semibold text-muted-foreground">
                                {adminText.detailsPhone}
                              </p>
                              <p
                                className="mt-1.5 rounded-lg bg-background px-2.5 py-2 text-center font-mono text-sm font-bold tabular-nums text-foreground shadow-sm"
                                dir="ltr"
                              >
                                {m.phone}
                              </p>
                              <div className="my-3 h-px bg-border/70" aria-hidden="true" />
                              <p className="text-[10px] font-semibold text-muted-foreground">
                                {adminText.detailsActivityType}
                              </p>
                              <span className="mt-1.5 inline-flex min-h-9 items-center justify-center rounded-lg border border-border/70 bg-muted/60 px-2.5 py-2 text-center text-xs font-semibold leading-5 text-foreground">
                                {getLocalizedActivity(m.activity_type, lang)}
                              </span>
                            </div>
                          </div>

                          <div className="h-full min-w-0">
                            <MerchantStatusSummary
                              compact
                              merchant={m}
                              subscription={canManageSubscriptions ? sub : undefined}
                              accountStatusLabel={adminText.mainAccountStatusLabel}
                              subscriptionStatusLabel={adminText.detailsSubscriptionStatus}
                              autoRepliesLabel={adminText.detailsAutoReplies}
                              merchantStatusText={merchantStatusLabels[m.status] ?? m.status}
                              subscriptionStatusText={
                                sub
                                  ? subscriptionStatusLabels[sub.status] ?? sub.status
                                  : undefined
                              }
                              enabledLabel={adminText.detailsEnabled}
                              disabledLabel={adminText.detailsDisabled}
                            />
                          </div>

                          {canManageSubscriptions && (
                            <div className="h-full min-w-0">
                              {sub ? (
                                <SubscriptionUsageSummary
                                  compact
                                  subscription={sub}
                                  planName={planNames[sub.plan_name as PlanKey] ?? sub.plan_name}
                                  locale={locale}
                                  baseUsedLabel={adminText.detailsBaseUsed}
                                  baseRemainingLabel={adminText.detailsBaseRemaining}
                                  baseLimitLabel={adminText.detailsBaseReplyLimit}
                                  emergencyBalanceLabel={adminText.detailsEmergencyBalance}
                                  addonBalanceLabel={adminText.detailsAddonBalance}
                                  totalAvailableLabel={adminText.detailsTotalAvailable}
                                />
                              ) : (
                                <div className="flex h-full min-h-[190px] items-center justify-center rounded-xl border border-border/80 bg-muted/20 text-xs text-muted-foreground">
                                  —
                                </div>
                              )}
                            </div>
                          )}

                          <div className="h-full min-w-0">
                            <ActionsMenu
                              merchant={m}
                              sub={sub}
                              onView={() => void openMerchantDetails(m)}
                              onApprove={() => openConfirm("approve", m)}
                              onReject={() => openConfirm("reject", m)}
                              onSuspend={() => openConfirm("suspend", m)}
                              onUnsuspend={() => openConfirm("unsuspend", m)}
                              onRestore={() => openConfirm("restore_pending", m)}
                              onResetReplies={() => openConfirm("reset_replies", m)}
                              onAddReplies={() => openReplies("add", m)}
                              onDeductReplies={() => openReplies("deduct", m)}
                              onToggleAutoReply={() => doToggleAutoReply(m.id)}
                              onChangePlan={() => openPlan(sub ? "change" : "activate", m)}
                              onRenewPlan={() => openPlan("renew", m)}
                              onDelete={() => openDeleteMerchant(m)}
                              canManageMerchants={canManageMerchants}
                              canManageSubscriptions={canManageSubscriptions}
                              deletionAction={getDeletionAction(m)}
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
'''

text = text[:start] + replacement + text[end:]
PATH.write_text(text, encoding='utf-8')
print('Converted the desktop merchant table to an aligned five-column CSS grid.')
