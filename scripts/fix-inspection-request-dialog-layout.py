from pathlib import Path

path = Path('artifacts/fawri/src/components/admin/AdminSupportTab.tsx')
text = path.read_text(encoding='utf-8')


def replace_once(old: str, new: str, label: str) -> None:
    global text
    count = text.count(old)
    if count != 1:
        raise RuntimeError(f'{label}: expected one match, found {count}')
    text = text.replace(old, new, 1)


replace_once(
    "import { Textarea } from '@/components/ui/textarea';\n",
    "import { Textarea } from '@/components/ui/textarea';\nimport { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';\n",
    'dialog import',
)

inline_form = '''
                {showInspectionForm && canRequestInspection && (
                  <form onSubmit={requestInspectionSession} className="shrink-0 space-y-2 border-b bg-muted/20 p-3">
                    <div className="grid gap-2 sm:grid-cols-2">
                      <label className="text-xs font-bold">
                        <span className="mb-1 block">{text.inspectionMode}</span>
                        <div className="relative">
                          <select
                            value={inspectionMode}
                            disabled={working !== null}
                            onChange={(event) => setInspectionMode(event.target.value as InspectionSessionMode)}
                            className="h-10 w-full appearance-none rounded-xl border bg-background pe-3 ps-10 text-sm"
                          >
                            <option value="live_observation">{text.inspectionLive}</option>
                            <option value="independent_read_only">{text.inspectionReadOnly}</option>
                          </select>
                          <ChevronDown
                            aria-hidden="true"
                            className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
                          />
                        </div>
                      </label>
                      <label className="text-xs font-bold">
                        <span className="mb-1 block">{text.inspectionReason}</span>
                        <Textarea
                          value={inspectionReason}
                          maxLength={500}
                          rows={2}
                          disabled={working !== null}
                          placeholder={text.inspectionReasonPlaceholder}
                          onChange={(event) => setInspectionReason(event.target.value)}
                          className="min-h-10 resize-none"
                        />
                      </label>
                    </div>
                    <p className="text-[10px] leading-4 text-muted-foreground">{text.inspectionRules}</p>
                    <div className="flex flex-wrap gap-2">
                      <Button type="submit" size="sm" disabled={working !== null || inspectionReason.trim().length < 5}>
                        {working === 'inspection' && <Loader2 className="me-2 h-4 w-4 animate-spin" />}
                        {working === 'inspection' ? text.inspectionSending : text.inspectionSend}
                      </Button>
                      <Button type="button" variant="outline" size="sm" disabled={working !== null} onClick={() => setShowInspectionForm(false)}>
                        {text.inspectionCancel}
                      </Button>
                    </div>
                  </form>
                )}

'''
replace_once(inline_form, '', 'remove inline inspection form')

section_end = '''        </div>
      )}
    </section>
  );
}
'''

dialog_block = '''        </div>
      )}

      <Dialog
        open={showInspectionForm}
        onOpenChange={(open) => {
          if (working === null) setShowInspectionForm(open);
        }}
      >
        <DialogContent className="max-w-xl" dir={dir}>
          <DialogHeader>
            <DialogTitle className="text-start">{text.inspectionTitle}</DialogTitle>
          </DialogHeader>

          <form onSubmit={requestInspectionSession} className="space-y-4">
            <label className="block text-xs font-bold">
              <span className="mb-1.5 block">{text.inspectionMode}</span>
              <div className="relative">
                <select
                  value={inspectionMode}
                  disabled={working !== null}
                  onChange={(event) => setInspectionMode(event.target.value as InspectionSessionMode)}
                  className="h-11 w-full appearance-none rounded-xl border bg-background ps-3 pe-10 text-sm outline-none focus:ring-2 focus:ring-primary/20"
                >
                  <option value="live_observation">{text.inspectionLive}</option>
                  <option value="independent_read_only">{text.inspectionReadOnly}</option>
                </select>
                <ChevronDown
                  aria-hidden="true"
                  className={`pointer-events-none absolute top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground ${
                    dir === 'rtl' ? 'left-4' : 'right-4'
                  }`}
                />
              </div>
            </label>

            <label className="block text-xs font-bold">
              <span className="mb-1.5 block">{text.inspectionReason}</span>
              <Textarea
                value={inspectionReason}
                maxLength={500}
                rows={4}
                disabled={working !== null}
                placeholder={text.inspectionReasonPlaceholder}
                onChange={(event) => setInspectionReason(event.target.value)}
                className="min-h-24 resize-none"
              />
            </label>

            <p className="rounded-xl border bg-muted/30 px-3 py-2 text-[11px] leading-5 text-muted-foreground">
              {text.inspectionRules}
            </p>

            <div className="flex flex-wrap justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                disabled={working !== null}
                onClick={() => setShowInspectionForm(false)}
              >
                {text.inspectionCancel}
              </Button>
              <Button
                type="submit"
                disabled={working !== null || inspectionReason.trim().length < 5}
              >
                {working === 'inspection' && <Loader2 className="me-2 h-4 w-4 animate-spin" />}
                {working === 'inspection' ? text.inspectionSending : text.inspectionSend}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </section>
  );
}
'''
replace_once(section_end, dialog_block, 'add inspection request dialog')

path.write_text(text, encoding='utf-8')
print('Moved inspection request form into a dialog and restored the RTL arrow position.')
