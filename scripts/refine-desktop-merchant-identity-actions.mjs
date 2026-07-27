import fs from "node:fs";
import { execSync } from "node:child_process";

const pagePath = "artifacts/fawri/src/pages/AdminPage.tsx";
const selfPath = "scripts/refine-desktop-merchant-identity-actions.mjs";
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

page = replaceOnce(
  page,
  "admin title visual style",
  `              <span className="truncate text-base font-bold leading-tight text-foreground sm:text-lg">\n                {adminText.mainAdminTitle}\n              </span>`,
  `              <span className="fowri-header-brand-font truncate text-lg font-black leading-tight tracking-tight text-primary sm:text-xl">\n                {adminText.mainAdminTitle}\n              </span>`,
);

page = replaceOnce(
  page,
  "desktop table minimum width",
  `<table className="w-full min-w-[1180px] text-sm">`,
  `<table className="w-full min-w-[1140px] text-sm">`,
);

page = replaceOnce(
  page,
  "desktop store identity cell",
  `                            <td className="min-w-[175px] px-4 py-4 align-middle">\n                              <div className="space-y-1.5">\n                                <p className="text-sm font-bold text-foreground">\n                                  {m.store_name}\n                                </p>\n                                <p className="text-xs font-medium text-muted-foreground">\n                                  {m.owner_name}\n                                </p>\n                              </div>\n                            </td>`,
  `                            <td className="min-w-[165px] px-3 py-4 align-top">\n                              <div className="flex min-h-[154px] flex-col justify-center rounded-xl border border-border/80 bg-gradient-to-b from-muted/30 to-background p-3 shadow-sm">\n                                <p className="text-[10px] font-semibold text-muted-foreground">\n                                  {adminText.detailsStoreName}\n                                </p>\n                                <p className="mt-1.5 break-words text-base font-black leading-6 text-foreground">\n                                  {m.store_name}\n                                </p>\n                                <div className="my-3 h-px bg-border/70" aria-hidden="true" />\n                                <p className="text-[10px] font-semibold text-muted-foreground">\n                                  {adminText.detailsOwnerName}\n                                </p>\n                                <p className="mt-1.5 break-words rounded-lg bg-muted/60 px-2.5 py-2 text-xs font-semibold leading-5 text-foreground">\n                                  {m.owner_name}\n                                </p>\n                              </div>\n                            </td>`,
);

page = replaceOnce(
  page,
  "desktop phone activity cell",
  `                            <td className="min-w-[155px] px-4 py-4 align-middle">\n                              <div className="space-y-2">\n                                <p className="font-mono text-xs font-semibold" dir="ltr">\n                                  {m.phone}\n                                </p>\n                                <span className="inline-flex rounded-md bg-muted px-2 py-1 text-[10px] font-medium text-muted-foreground">\n                                  {getLocalizedActivity(m.activity_type, lang)}\n                                </span>\n                              </div>\n                            </td>`,
  `                            <td className="min-w-[155px] px-3 py-4 align-top">\n                              <div className="flex min-h-[154px] flex-col justify-center rounded-xl border border-border/80 bg-gradient-to-b from-muted/30 to-background p-3 shadow-sm">\n                                <p className="text-[10px] font-semibold text-muted-foreground">\n                                  {adminText.detailsPhone}\n                                </p>\n                                <p\n                                  className="mt-1.5 rounded-lg bg-background px-2.5 py-2 text-center font-mono text-sm font-bold tabular-nums text-foreground shadow-sm"\n                                  dir="ltr"\n                                >\n                                  {m.phone}\n                                </p>\n                                <div className="my-3 h-px bg-border/70" aria-hidden="true" />\n                                <p className="text-[10px] font-semibold text-muted-foreground">\n                                  {adminText.detailsActivityType}\n                                </p>\n                                <span className="mt-1.5 inline-flex min-h-9 items-center justify-center rounded-lg border border-border/70 bg-muted/60 px-2.5 py-2 text-center text-xs font-semibold leading-5 text-foreground">\n                                  {getLocalizedActivity(m.activity_type, lang)}\n                                </span>\n                              </div>\n                            </td>`,
);

page = replaceOnce(
  page,
  "desktop action table cell width",
  `<td className="min-w-[350px] px-4 py-4 align-middle">`,
  `<td className="min-w-[360px] px-3 py-4 align-top">`,
);

const desktopActionsReplacement = String.raw`  const desktopActionButtonClass =
    "h-12 w-full min-w-0 justify-center gap-1.5 whitespace-normal px-2 py-1.5 text-center text-[11px] font-semibold leading-4";

  return (
    <div
      className="grid min-w-[336px] grid-cols-3 gap-2 rounded-xl border border-border/80 bg-muted/20 p-2.5 shadow-sm"
      dir={adminText.dir}
    >
      <Button
        variant="outline"
        size="sm"
        className={desktopActionButtonClass}
        onClick={onView}
        title={adminText.actionViewDetails}
      >
        <Eye className="h-3.5 w-3.5 shrink-0" />
        <span>{adminText.actionViewDetails}</span>
      </Button>

      {canManageMerchants && status === "pending_activation" && (
        <>
          <Button
            size="sm"
            className={`${desktopActionButtonClass} bg-green-600 text-white hover:bg-green-700`}
            onClick={onApprove}
            title={adminText.actionApprove}
          >
            <CheckCircle className="h-3.5 w-3.5 shrink-0" />
            <span>{adminText.actionApprove}</span>
          </Button>
          <Button
            variant="destructive"
            size="sm"
            className={desktopActionButtonClass}
            onClick={onReject}
            title={adminText.actionReject}
          >
            <XCircle className="h-3.5 w-3.5 shrink-0" />
            <span>{adminText.actionReject}</span>
          </Button>
        </>
      )}

      {status === "approved" && (
        <>
          {canManageSubscriptions &&
            (sub ? (
              <>
                <Button
                  variant="outline"
                  size="sm"
                  className={desktopActionButtonClass}
                  onClick={onChangePlan}
                  title={adminText.actionChangePlan}
                >
                  <FileText className="h-3.5 w-3.5 shrink-0" />
                  <span>{adminText.actionChangePlan}</span>
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className={desktopActionButtonClass}
                  onClick={onRenewPlan}
                  title={adminText.actionRenewPlan}
                >
                  <RefreshCcw className="h-3.5 w-3.5 shrink-0" />
                  <span>{adminText.actionRenewPlan}</span>
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className={desktopActionButtonClass}
                  onClick={onResetReplies}
                  title={adminText.actionResetReplies}
                >
                  <RefreshCcw className="h-3.5 w-3.5 shrink-0" />
                  <span>{adminText.actionResetReplies}</span>
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className={desktopActionButtonClass}
                  onClick={onAddReplies}
                  title={adminText.actionAddReplies}
                >
                  <Plus className="h-3.5 w-3.5 shrink-0" />
                  <span>{adminText.actionAddReplies}</span>
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className={`${desktopActionButtonClass} border-destructive/40 text-destructive hover:bg-destructive/10 hover:text-destructive`}
                  onClick={onDeductReplies}
                  title={adminText.actionDeductReplies}
                >
                  <Minus className="h-3.5 w-3.5 shrink-0" />
                  <span>{adminText.actionDeductReplies}</span>
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className={desktopActionButtonClass}
                  onClick={onToggleAutoReply}
                  title={
                    sub.auto_reply_enabled
                      ? adminText.actionDisableAutoReplies
                      : adminText.actionEnableAutoReplies
                  }
                >
                  {sub.auto_reply_enabled ? (
                    <PowerOff className="h-3.5 w-3.5 shrink-0" />
                  ) : (
                    <Power className="h-3.5 w-3.5 shrink-0" />
                  )}
                  <span>
                    {sub.auto_reply_enabled
                      ? adminText.actionDisableAutoReplies
                      : adminText.actionEnableAutoReplies}
                  </span>
                </Button>
              </>
            ) : (
              <Button
                variant="outline"
                size="sm"
                className={desktopActionButtonClass}
                onClick={onChangePlan}
                title={adminText.actionActivatePaidSubscription}
              >
                <FileText className="h-3.5 w-3.5 shrink-0" />
                <span>{adminText.actionActivatePaidSubscription}</span>
              </Button>
            ))}

          {canManageMerchants && (
            <Button
              variant="destructive"
              size="sm"
              className={desktopActionButtonClass}
              onClick={onSuspend}
              title={adminText.actionSuspendStore}
            >
              <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
              <span>{adminText.actionSuspendStore}</span>
            </Button>
          )}
        </>
      )}

      {canManageMerchants && status === "suspended" && (
        <>
          <Button
            size="sm"
            className={`${desktopActionButtonClass} bg-green-600 text-white hover:bg-green-700`}
            onClick={onUnsuspend}
            title={adminText.actionUnsuspend}
          >
            <CheckCircle className="h-3.5 w-3.5 shrink-0" />
            <span>{adminText.actionUnsuspend}</span>
          </Button>
          <Button
            variant="destructive"
            size="sm"
            className={desktopActionButtonClass}
            onClick={onReject}
            title={adminText.actionFinalReject}
          >
            <XCircle className="h-3.5 w-3.5 shrink-0" />
            <span>{adminText.actionFinalReject}</span>
          </Button>
        </>
      )}

      {canManageMerchants && status === "rejected" && (
        <Button
          variant="outline"
          size="sm"
          className={desktopActionButtonClass}
          onClick={onRestore}
          title={adminText.actionRestoreReview}
        >
          <RefreshCcw className="h-3.5 w-3.5 shrink-0" />
          <span>{adminText.actionRestoreReview}</span>
        </Button>
      )}

      {deletionAction && (
        <Button
          variant="destructive"
          size="sm"
          className={desktopActionButtonClass}
          onClick={onDelete}
          disabled={deletionAction === "pending"}
          title={deletionActionLabel}
        >
          <span>{deletionActionLabel}</span>
        </Button>
      )}
    </div>
  );
}

function hasAdminPermission`;

page = replaceRegexOnce(
  page,
  "desktop action button grid",
  /  return \(\n    <div\n      className="flex flex-wrap gap-1\.5"[\s\S]*?\n  \);\n}\n\nfunction hasAdminPermission/,
  desktopActionsReplacement,
);

fs.writeFileSync(pagePath, page, "utf8");

const updated = fs.readFileSync(pagePath, "utf8");
for (const marker of [
  "fowri-header-brand-font truncate text-lg",
  "min-h-[154px] flex-col justify-center rounded-xl",
  "grid min-w-[336px] grid-cols-3 gap-2",
  "adminText.actionDeductReplies",
  "adminText.actionDisableAutoReplies",
  "adminText.actionEnableAutoReplies",
]) {
  if (!updated.includes(marker)) {
    throw new Error(`Missing expected desktop layout marker: ${marker}`);
  }
}

if (updated.includes('className="flex flex-wrap gap-1.5"')) {
  throw new Error("Legacy desktop wrapping action layout is still present");
}

run("pnpm run typecheck");
run("PORT=3000 BASE_PATH=/ pnpm --filter @workspace/fawri run build");
run("pnpm --filter @workspace/api-server run test:admin-permissions");
run("pnpm --filter @workspace/api-server run test:merchant-session");

fs.rmSync(selfPath);
run("git diff --check");
run(`git add ${pagePath} ${selfPath}`);
run('git commit -m "Refine desktop merchant identity and action layout"');
run(`git push origin ${branch}`);

console.log("\nCompleted: the admin title uses the orange brand style, desktop merchant identity panels are aligned with the rest of the row, and desktop actions are displayed as equal three-column buttons while mobile and tablet retain the overflow menu.");
