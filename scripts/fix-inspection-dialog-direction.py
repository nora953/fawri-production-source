from pathlib import Path

DIALOG = Path('artifacts/fawri/src/components/ui/dialog.tsx')
SUPPORT = Path('artifacts/fawri/src/components/admin/AdminSupportTab.tsx')


def replace_once(text: str, old: str, new: str, label: str) -> str:
    count = text.count(old)
    if count != 1:
        raise RuntimeError(f'{label}: expected one match, found {count}')
    return text.replace(old, new, 1)


dialog = DIALOG.read_text(encoding='utf-8')
dialog = replace_once(
    dialog,
    '''const DialogContent = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content>
>(({ className, children, ...props }, ref) => (
''',
    '''type DialogContentProps = React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content> & {
  closeButtonClassName?: string
}

const DialogContent = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Content>,
  DialogContentProps
>(({ className, children, closeButtonClassName, ...props }, ref) => (
''',
    'dialog content props',
)
dialog = replace_once(
    dialog,
    '''      <DialogPrimitive.Close className="absolute right-4 top-4 flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border bg-card text-muted-foreground shadow-sm transition hover:bg-muted focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:pointer-events-none disabled:opacity-60">
''',
    '''      <DialogPrimitive.Close
        className={cn(
          "absolute right-4 top-4 flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border bg-card text-muted-foreground shadow-sm transition hover:bg-muted focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:pointer-events-none disabled:opacity-60",
          closeButtonClassName,
        )}
      >
''',
    'dialog close button class',
)
DIALOG.write_text(dialog, encoding='utf-8')

support = SUPPORT.read_text(encoding='utf-8')
support = replace_once(
    support,
    '''        <DialogContent className="max-w-xl" dir={dir}>
''',
    '''        <DialogContent
          className="max-w-xl"
          closeButtonClassName={dir === 'rtl' ? 'left-4 right-auto' : 'left-auto right-4'}
          dir={dir}
        >
''',
    'inspection dialog close direction',
)
support = replace_once(
    support,
    '''            <div className="flex flex-wrap justify-end gap-2">
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
''',
    '''            <div className="flex flex-wrap justify-start gap-2">
              <Button
                type="submit"
                disabled={working !== null || inspectionReason.trim().length < 5}
              >
                {working === 'inspection' && <Loader2 className="me-2 h-4 w-4 animate-spin" />}
                {working === 'inspection' ? text.inspectionSending : text.inspectionSend}
              </Button>
              <Button
                type="button"
                variant="outline"
                disabled={working !== null}
                onClick={() => setShowInspectionForm(false)}
              >
                {text.inspectionCancel}
              </Button>
            </div>
''',
    'inspection dialog action direction',
)
SUPPORT.write_text(support, encoding='utf-8')

print('Fixed inspection dialog close and submit positions for RTL and LTR.')
