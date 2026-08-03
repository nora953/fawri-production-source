from pathlib import Path

p = Path("artifacts/fawri/src/pages/AdminWorkMonitorPage.tsx")
s = p.read_text(encoding="utf-8")

old = '''      <Dialog open={action !== null} onOpenChange={(open) => { if (!open) closeAction(); }}>
        <DialogContent dir={isRTL ? "rtl" : "ltr"} className="sm:max-w-md">
          <DialogHeader className={isRTL ? "text-right sm:!text-right" : "text-left"}>
            <DialogTitle>{text.confirmTitle}</DialogTitle>
            <DialogDescription>{text.confirmDescription}</DialogDescription>
          </DialogHeader>
          <div className={lang === "ar" ? "space-y-1" : "space-y-2"}>
            <Label htmlFor="work-monitor-owner-password" className={lang === "ar" ? "block leading-6" : undefined}>{text.ownerPassword}</Label>
            <PasswordInput
              id="work-monitor-owner-password"
              value={ownerPassword}
              disabled={processing}
              dir="ltr"
              autoComplete="current-password"
              onChange={(event) => { setOwnerPassword(event.target.value); setActionError(""); }}
            />
          </div>
          {actionError && <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">{actionError}</div>}
          <DialogFooter>
            <Button type="button" variant="outline" disabled={processing} onClick={closeAction}>{text.cancel}</Button>
            <Button type="button" disabled={processing || !ownerPassword} onClick={() => void executeAction()}>
              {processing && <Loader2 className="me-2 h-4 w-4 animate-spin" />}
              {processing ? text.processing : text.confirm}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
'''

new = '''      <Dialog open={action !== null} onOpenChange={(open) => { if (!open) closeAction(); }}>
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

if s.count(old) != 1:
    raise SystemExit(f"dialog block match count: {s.count(old)}")

p.write_text(s.replace(old, new, 1), encoding="utf-8")
print("Work Monitor security dialog layout refined.")
