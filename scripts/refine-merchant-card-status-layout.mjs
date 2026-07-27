import fs from "node:fs";
import { execSync } from "node:child_process";

const pagePath = "artifacts/fawri/src/pages/AdminPage.tsx";
const translationsPath = "artifacts/fawri/src/lib/admin-translations.ts";
const selfPath = "scripts/refine-merchant-card-status-layout.mjs";
const branch = "feature/admin-permissions-v2";

function run(command) {
  console.log(`\n> ${command}`);
  execSync(command, { stdio: "inherit", shell: "/bin/bash" });
}

function replaceOnce(source, label, before, after) {
  const count = source.split(before).length - 1;
  if (count !== 1) {
    throw new Error(`${label}: expected one match, found ${count}`);
  }
  return source.replace(before, after);
}

function replaceRegexOnce(source, label, pattern, replacement) {
  const flags = pattern.flags.includes("g") ? pattern.flags : `${pattern.flags}g`;
  const matches = source.match(new RegExp(pattern.source, flags));
  const count = matches?.length ?? 0;
  if (count !== 1) {
    throw new Error(`${label}: expected one regex match, found ${count}`);
  }
  return source.replace(pattern, replacement);
}

let page = fs.readFileSync(pagePath, "utf8");
let translations = fs.readFileSync(translationsPath, "utf8");

const statusComponents = String.raw`
function AutoReplyBadge({
  enabled,
  enabledLabel,
  disabledLabel,
}: {
  enabled: boolean;
  enabledLabel: string;
  disabledLabel: string;
}) {
  const Icon = enabled ? Power : PowerOff;

  return (
    <span
      className={
        "inline-flex items-center gap-1 rounded-full px-2 py-1 text-[10px] font-medium whitespace-nowrap " +
        (enabled
          ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/50 dark:text-emerald-200"
          : "bg-orange-100 text-orange-800 dark:bg-orange-900/50 dark:text-orange-200")
      }
    >
      <Icon className="h-3 w-3" aria-hidden="true" />
      {enabled ? enabledLabel : disabledLabel}
    </span>
  );
}

function MerchantStatusSummary({
  merchant,
  subscription,
  accountStatusLabel,
  subscriptionStatusLabel,
  autoRepliesLabel,
  merchantStatusText,
  subscriptionStatusText,
  enabledLabel,
  disabledLabel,
  compact = false,
}: {
  merchant: Merchant;
  subscription?: Subscription;
  accountStatusLabel: string;
  subscriptionStatusLabel: string;
  autoRepliesLabel: string;
  merchantStatusText: string;
  subscriptionStatusText?: string;
  enabledLabel: string;
  disabledLabel: string;
  compact?: boolean;
}) {
  const statusItems = [
    {
      label: accountStatusLabel,
      content: <StatusBadge status={merchant.status} label={merchantStatusText} />,
    },
    ...(subscription
      ? [
          {
            label: subscriptionStatusLabel,
            content: (
              <SubBadge
                status={subscription.status}
                label={subscriptionStatusText ?? subscription.status}
              />
            ),
          },
          {
            label: autoRepliesLabel,
            content: (
              <AutoReplyBadge
                enabled={subscription.auto_reply_enabled}
                enabledLabel={enabledLabel}
                disabledLabel={disabledLabel}
              />
            ),
          },
        ]
      : []),
  ];

  return (
    <div className={compact ? "space-y-2" : "grid gap-2 sm:grid-cols-3"}>
      {statusItems.map((item) => (
        <div
          key={item.label}
          className={
            "rounded-lg border border-border/70 bg-background/80 " +
            (compact ? "px-2.5 py-2" : "px-3 py-2.5")
          }
        >
          <p className="mb-1.5 text-[10px] font-medium text-muted-foreground">
            {item.label}
          </p>
          {item.content}
        </div>
      ))}
    </div>
  );
}

function SubscriptionUsageSummary({
  subscription,
  planName,
  locale,
  usedLabel,
  remainingLabel,
  limitLabel,
  compact = false,
}: {
  subscription: Subscription;
  planName: string;
  locale: string;
  usedLabel: string;
  remainingLabel: string;
  limitLabel: string;
  compact?: boolean;
}) {
  const exactPercentage =
    subscription.reply_limit > 0
      ? (subscription.replies_used / subscription.reply_limit) * 100
      : 0;
  const percentageText = formatUsagePercentage(
    subscription.replies_used,
    subscription.reply_limit,
    locale,
  );
  const progressWidth =
    subscription.replies_used > 0
      ? Math.max(0.5, Math.min(100, exactPercentage))
      : 0;
  const roundedPercentage = Math.round(exactPercentage);

  return (
    <div
      className={
        "space-y-3 rounded-xl border border-border/80 bg-gradient-to-b from-muted/35 to-background shadow-sm " +
        (compact ? "min-w-[220px] p-3" : "p-3.5")
      }
    >
      <div className="flex items-center justify-between gap-3">
        <span className="text-sm font-bold capitalize text-foreground">
          {planName}
        </span>
        <span
          className="rounded-full bg-background px-2 py-1 text-[11px] font-semibold tabular-nums text-muted-foreground shadow-sm"
          dir="ltr"
        >
          {percentageText}
        </span>
      </div>

      <div className="grid grid-cols-3 gap-1.5">
        {[
          [usedLabel, subscription.replies_used],
          [remainingLabel, subscription.replies_remaining],
          [limitLabel, subscription.reply_limit],
        ].map(([label, value]) => (
          <div
            key={String(label)}
            className="rounded-lg border border-border/60 bg-background px-1.5 py-2 text-center"
          >
            <p className="text-[9px] font-medium leading-3.5 text-muted-foreground">
              {label}
            </p>
            <p
              className="mt-1 text-xs font-bold tabular-nums text-foreground"
              dir="ltr"
            >
              {Number(value).toLocaleString(locale)}
            </p>
          </div>
        ))}
      </div>

      <div
        className="h-1.5 overflow-hidden rounded-full bg-muted"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.min(100, roundedPercentage)}
      >
        <div
          className={
            "h-full rounded-full transition-all " +
            (roundedPercentage >= 90
              ? "bg-red-500"
              : roundedPercentage >= 80
                ? "bg-yellow-500"
                : "bg-primary")
          }
          style={{ width: String(progressWidth) + "%" }}
        />
      </div>
    </div>
  );
}
`;

page = replaceOnce(
  page,
  "status components insertion",
  `function formatUsagePercentage(used: number, limit: number, locale: string): string {`,
  `${statusComponents}\nfunction formatUsagePercentage(used: number, limit: number, locale: string): string {`,
);

const mobileCards = String.raw`                {/* Mobile and tablet cards */}
                <div className="grid gap-4 md:grid-cols-2 lg:hidden">
                  {filteredMerchants.map((m) => {
                    const sub = getSub(m.id);
                    return (
                      <Card
                        key={m.id}
                        className="overflow-hidden border-border/80 bg-card shadow-sm transition-shadow hover:shadow-md"
                      >
                        <CardContent className="p-0">
                          <div className="border-b bg-muted/20 p-4">
                            <div className="flex items-start justify-between gap-3">
                              <div className="min-w-0 flex-1">
                                <p className="truncate text-base font-bold text-foreground">
                                  {m.store_name}
                                </p>
                                <p className="mt-1 truncate text-sm font-medium text-muted-foreground">
                                  {m.owner_name}
                                </p>
                              </div>
                              <div className="shrink-0 rounded-lg border bg-background px-2.5 py-2 text-center shadow-sm">
                                <p className="text-[9px] font-medium text-muted-foreground">
                                  {adminText.mainTableRegistered}
                                </p>
                                <p className="mt-1 text-[11px] font-semibold tabular-nums" dir="ltr">
                                  {new Date(m.created_at).toLocaleDateString(locale)}
                                </p>
                              </div>
                            </div>

                            <div className="mt-3 grid grid-cols-2 gap-2">
                              <div className="rounded-lg border bg-background px-3 py-2.5">
                                <p className="text-[10px] font-medium text-muted-foreground">
                                  {adminText.detailsPhone}
                                </p>
                                <p className="mt-1 font-mono text-xs font-semibold" dir="ltr">
                                  {m.phone}
                                </p>
                              </div>
                              <div className="rounded-lg border bg-background px-3 py-2.5">
                                <p className="text-[10px] font-medium text-muted-foreground">
                                  {adminText.detailsActivityType}
                                </p>
                                <p className="mt-1 truncate text-xs font-semibold">
                                  {getLocalizedActivity(m.activity_type, lang)}
                                </p>
                              </div>
                            </div>
                          </div>

                          <div className="space-y-3 p-4">
                            <MerchantStatusSummary
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

                            {canManageSubscriptions && sub && (
                              <SubscriptionUsageSummary
                                subscription={sub}
                                planName={planNames[sub.plan_name as PlanKey] ?? sub.plan_name}
                                locale={locale}
                                usedLabel={adminText.detailsUsed}
                                remainingLabel={adminText.detailsRemaining}
                                limitLabel={adminText.detailsReplyLimit}
                              />
                            )}
                          </div>

                          <div className="flex flex-wrap items-center gap-2 border-t bg-muted/10 p-3">
                            {canManageMerchants && m.status === "pending_activation" && (
                              <Button
                                size="sm"
                                className="h-8 flex-1 bg-green-600 text-xs text-white hover:bg-green-700"
                                onClick={() => openConfirm("approve", m)}
                              >
                                {adminText.actionApprove}
                              </Button>
                            )}
                            {canManageMerchants && m.status === "approved" && (
                              <Button
                                variant="destructive"
                                size="sm"
                                className="h-8 flex-1 text-xs"
                                onClick={() => openConfirm("suspend", m)}
                              >
                                {adminText.actionSuspendShort}
                              </Button>
                            )}
                            {canManageMerchants && m.status === "suspended" && (
                              <Button
                                size="sm"
                                className="h-8 flex-1 bg-green-600 text-xs text-white hover:bg-green-700"
                                onClick={() => openConfirm("unsuspend", m)}
                              >
                                {adminText.actionUnsuspend}
                              </Button>
                            )}
                            {canManageMerchants && m.status === "rejected" && (
                              <Button
                                variant="outline"
                                size="sm"
                                className="h-8 flex-1 text-xs"
                                onClick={() => openConfirm("restore_pending", m)}
                              >
                                {adminText.actionRestoreReviewShort}
                              </Button>
                            )}
                            <Button
                              variant="outline"
                              size="sm"
                              className="h-8 min-w-9 px-2"
                              onClick={() => void openMerchantDetails(m)}
                              aria-label={adminText.actionViewDetails}
                            >
                              <Eye className="h-4 w-4" />
                            </Button>
                            <ActionsMenu
                              mobile
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
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>

                {/* Desktop table */}`;

page = replaceRegexOnce(
  page,
  "mobile cards layout",
  /\s*\{\/\* Mobile cards \*\/\}[\s\S]*?\s*\{\/\* Desktop table \*\/\}/,
  `\n${mobileCards}`,
);

const desktopTable = String.raw`                {/* Desktop table */}
                <div className="hidden overflow-x-auto rounded-xl border border-border/80 bg-card shadow-sm lg:block">
                  <table className="w-full min-w-[1180px] text-sm">
                    <thead className="border-b bg-muted/40">
                      <tr>
                        {[
                          adminText.mainTableStoreOwner,
                          adminText.mainTablePhoneActivity,
                          adminText.mainTableStatus,
                          ...(canManageSubscriptions
                            ? [adminText.mainTablePlanReplies]
                            : []),
                          adminText.mainTableRegistered,
                          adminText.mainTableActions,
                        ].map((heading) => (
                          <th
                            key={heading}
                            className={
                              "px-4 py-3.5 text-xs font-semibold text-muted-foreground " +
                              (adminText.dir === "rtl" ? "text-right" : "text-left")
                            }
                          >
                            {heading}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border/70">
                      {filteredMerchants.map((m) => {
                        const sub = getSub(m.id);
                        return (
                          <tr
                            key={m.id}
                            className="bg-card transition-colors hover:bg-muted/20"
                          >
                            <td className="min-w-[175px] px-4 py-4 align-middle">
                              <div className="space-y-1.5">
                                <p className="text-sm font-bold text-foreground">
                                  {m.store_name}
                                </p>
                                <p className="text-xs font-medium text-muted-foreground">
                                  {m.owner_name}
                                </p>
                              </div>
                            </td>

                            <td className="min-w-[155px] px-4 py-4 align-middle">
                              <div className="space-y-2">
                                <p className="font-mono text-xs font-semibold" dir="ltr">
                                  {m.phone}
                                </p>
                                <span className="inline-flex rounded-md bg-muted px-2 py-1 text-[10px] font-medium text-muted-foreground">
                                  {getLocalizedActivity(m.activity_type, lang)}
                                </span>
                              </div>
                            </td>

                            <td className="min-w-[175px] px-4 py-4 align-middle">
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
                            </td>

                            {canManageSubscriptions && (
                              <td className="min-w-[240px] px-4 py-4 align-middle">
                                {sub ? (
                                  <SubscriptionUsageSummary
                                    compact
                                    subscription={sub}
                                    planName={planNames[sub.plan_name as PlanKey] ?? sub.plan_name}
                                    locale={locale}
                                    usedLabel={adminText.detailsUsed}
                                    remainingLabel={adminText.detailsRemaining}
                                    limitLabel={adminText.detailsReplyLimit}
                                  />
                                ) : (
                                  <span className="text-xs text-muted-foreground">—</span>
                                )}
                              </td>
                            )}

                            <td className="min-w-[125px] px-4 py-4 align-middle">
                              <div className="inline-flex rounded-lg border bg-muted/20 px-3 py-2 text-xs font-semibold tabular-nums text-muted-foreground" dir="ltr">
                                {new Date(m.created_at).toLocaleDateString(locale)}
                              </div>
                            </td>

                            <td className="min-w-[350px] px-4 py-4 align-middle">
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
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>`;

page = replaceRegexOnce(
  page,
  "desktop table layout",
  /\s*\{\/\* Desktop table \*\/\}[\s\S]*?<\/table>\s*<\/div>/,
  `\n${desktopTable}`,
);

translations = replaceOnce(
  translations,
  "Arabic account status label",
  `    mainTableStatus: "الحالة",`,
  `    mainTableStatus: "الحالات",\n    mainAccountStatusLabel: "حالة الحساب",`,
);

translations = replaceOnce(
  translations,
  "English account status label",
  `    mainTableStatus: "Status",`,
  `    mainTableStatus: "Statuses",\n    mainAccountStatusLabel: "Account status",`,
);

translations = replaceOnce(
  translations,
  "Kurdish account status label",
  `  mainTableStatus: "دۆخ",`,
  `  mainTableStatus: "دۆخەکان",\n  mainAccountStatusLabel: "دۆخی هەژمار",`,
);

fs.writeFileSync(pagePath, page, "utf8");
fs.writeFileSync(translationsPath, translations, "utf8");

for (const [path, markers] of [
  [pagePath, [
    "function AutoReplyBadge",
    "function MerchantStatusSummary",
    "function SubscriptionUsageSummary",
    "adminText.mainAccountStatusLabel",
    "Mobile and tablet cards",
    "min-w-[1180px]",
  ]],
  [translationsPath, [
    'mainAccountStatusLabel: "حالة الحساب"',
    'mainAccountStatusLabel: "Account status"',
    'mainAccountStatusLabel: "دۆخی هەژمار"',
  ]],
]) {
  const source = fs.readFileSync(path, "utf8");
  for (const marker of markers) {
    if (!source.includes(marker)) {
      throw new Error(`${path}: missing expected marker ${marker}`);
    }
  }
}

run("pnpm run typecheck");
run("PORT=3000 BASE_PATH=/ pnpm --filter @workspace/fawri run build");
run("pnpm --filter @workspace/api-server run test:admin-permissions");
run("pnpm --filter @workspace/api-server run test:merchant-session");

fs.rmSync(selfPath);
run("git diff --check");
run(`git add ${pagePath} ${translationsPath} ${selfPath}`);
run('git commit -m "Refine merchant cards and automatic reply status"');
run(`git push origin ${branch}`);

console.log("\nCompleted: merchant cards and desktop rows are professionally organized, and account, subscription, and automatic-reply statuses are displayed independently across responsive layouts.");
