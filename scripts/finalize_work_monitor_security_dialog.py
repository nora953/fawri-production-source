from pathlib import Path

path = Path("artifacts/fawri/src/pages/AdminWorkMonitorPage.tsx")
text = path.read_text(encoding="utf-8")

old = '''      <Dialog open={action !== null} onOpenChange={(open) => { if (!open) closeAction(); }}>
        <DialogContent
          dir={isRTL ? "rtl" : "ltr"}
          className="w-[calc(100%-2rem)] max-w-lg gap-0 rounded-2xl p-0 sm:w-full"
        >
          <div className="space-y-5 px-5 pb-5 pt-6 sm:px-6 sm:pb-6 sm:pt-7">
            <DialogHeader className={isRTL ? "space-y-2 pe-8 text-right sm:!text-right" : "space-y-2 pe-8 text-left"}>
              <DialogTitle className="text-xl leading-8">{text.confirmTitle}</DialogTitle>
              <DialogDescription className="text-sm leading-6">{text.confirmDescription}</DialogDescription>
            </DialogHeader>

            <div className="space-y-2">
              <Label htmlFor="work-monitor-owner-password" className="block text-sm font-semibold leading-6">
                {text.ownerPassword}
              </Label>
              <PasswordInput
                id="work-monitor-owner-password"
                value={ownerPassword}
                disabled={processing}
                dir="ltr"
                autoComplete="current-password"
                className="h-11"
                onChange={(event) => { setOwnerPassword(event.target.value); setActionError(""); }}
              />
            </div>

            {actionError && (
              <div className="rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm leading-6 text-destructive">
                {actionError}
              </div>
            )}

            <DialogFooter className={isRTL ? "flex-col-reverse gap-2 sm:flex-row-reverse sm:justify-start" : "flex-col-reverse gap-2 sm:flex-row sm:justify-end"}>
              <Button
                type="button"
                variant="outline"
                className="w-full sm:w-auto sm:min-w-28"
                disabled={processing}
                onClick={closeAction}
              >
                {text.cancel}
              </Button>
              <Button
                type="button"
                className="w-full sm:w-auto sm:min-w-36"
                disabled={processing || !ownerPassword}
                onClick={() => void executeAction()}
              >
                {processing && <Loader2 className="me-2 h-4 w-4 animate-spin" />}
                {processing ? text.processing : text.confirm}
              </Button>
            </DialogFooter>
          </div>
        </DialogContent>
      </Dialog>
'''

new = '''      <Dialog open={action !== null} onOpenChange={(open) => { if (!open) closeAction(); }}>
        <DialogContent
          dir={isRTL ? "rtl" : "ltr"}
          closeButtonClassName={isRTL ? "left-5 right-auto top-5" : "left-auto right-5 top-5"}
          className="w-[calc(100%-1.5rem)] max-w-xl gap-0 overflow-hidden rounded-2xl border bg-background p-0 shadow-2xl sm:w-full"
        >
          <div className="space-y-6 px-5 pb-6 pt-6 sm:px-8 sm:pb-8 sm:pt-8">
            <DialogHeader className="space-y-0 pe-14 text-start sm:!text-start">
              <div className="flex items-start gap-3">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                  <ShieldCheck className="h-5 w-5" aria-hidden="true" />
                </div>
                <div className="min-w-0 space-y-1.5 pt-0.5">
                  <DialogTitle className="text-xl leading-8">{text.confirmTitle}</DialogTitle>
                  <DialogDescription className="max-w-md text-sm leading-6">
                    {text.confirmDescription}
                  </DialogDescription>
                </div>
              </div>
            </DialogHeader>

            <div className="rounded-xl border bg-muted/20 p-4 sm:p-5">
              <div className="space-y-2.5">
                <Label htmlFor="work-monitor-owner-password" className="block text-sm font-semibold leading-6">
                  {text.ownerPassword}
                </Label>
                <PasswordInput
                  id="work-monitor-owner-password"
                  value={ownerPassword}
                  disabled={processing}
                  dir="ltr"
                  autoComplete="current-password"
                  className="h-12 bg-background text-base"
                  onChange={(event) => { setOwnerPassword(event.target.value); setActionError(""); }}
                />
              </div>
            </div>

            {actionError && (
              <div className="rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm leading-6 text-destructive">
                {actionError}
              </div>
            )}
          </div>

          <div className="border-t bg-muted/20 px-5 py-4 sm:px-8 sm:py-5">
            <div dir="ltr" className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Button
                type="button"
                variant="outline"
                className="order-2 h-11 w-full sm:order-1"
                disabled={processing}
                onClick={closeAction}
              >
                {text.cancel}
              </Button>
              <Button
                type="button"
                className="order-1 h-11 w-full disabled:bg-primary/45 disabled:text-primary-foreground/90 disabled:opacity-100 sm:order-2"
                disabled={processing || !ownerPassword}
                onClick={() => void executeAction()}
              >
                {processing && <Loader2 className="me-2 h-4 w-4 animate-spin" />}
                {processing ? text.processing : text.confirm}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
'''

count = text.count(old)
if count != 1:
    raise SystemExit(f"security dialog: expected exactly one match, found {count}")

path.write_text(text.replace(old, new, 1), encoding="utf-8")
print("Final Work Monitor security dialog layout applied.")
