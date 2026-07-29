from pathlib import Path

page_path = Path('artifacts/fawri/src/pages/dashboard/SupportPage.tsx')
ar_path = Path('artifacts/fawri/src/lib/translations/ar.ts')
en_path = Path('artifacts/fawri/src/lib/translations/en.ts')
ku_path = Path('artifacts/fawri/src/lib/translations/ku.ts')

page = page_path.read_text(encoding='utf-8')

old_header = '''        <button
          type="button"
          onClick={() => {
            setFormError('');
            setShowCreate((current) => !current);
          }}
          className="inline-flex h-10 w-fit items-center gap-2 rounded-xl bg-primary px-4 text-sm font-bold text-primary-foreground"
        >
          {showCreate ? <X className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
          {showCreate ? t.support_cancel : t.support_new_ticket}
        </button>
'''

new_header = '''        <button
          type="button"
          onClick={() => {
            setFormError('');
            setShowCreate((current) => !current);
          }}
          className={
            showCreate
              ? 'flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border bg-card text-muted-foreground shadow-sm transition hover:bg-muted'
              : 'inline-flex h-10 w-fit items-center gap-2 rounded-xl bg-primary px-4 text-sm font-bold text-primary-foreground'
          }
          aria-label={showCreate ? t.support_cancel : t.support_new_ticket}
          title={showCreate ? t.support_cancel : t.support_new_ticket}
        >
          {showCreate ? (
            <X className="h-4 w-4" />
          ) : (
            <>
              <Plus className="h-4 w-4" />
              {t.support_new_ticket}
            </>
          )}
        </button>
'''

old_actions = '''          <div className="mt-3 flex min-h-10 items-center justify-between gap-3">
            {formError ? (
              <p className="text-sm font-bold text-destructive">{formError}</p>
            ) : (
              <span />
            )}
            <button
              type="submit"
              disabled={creating}
              className="inline-flex h-10 shrink-0 items-center gap-2 rounded-xl bg-primary px-4 text-sm font-bold text-primary-foreground disabled:opacity-60"
            >
              {creating && <Loader2 className="h-4 w-4 animate-spin" />}
              {creating ? t.support_sending : t.support_send}
            </button>
          </div>
'''

new_actions = '''          <div className="mt-3 flex min-h-10 flex-wrap items-center justify-start gap-3">
            <button
              type="submit"
              disabled={creating}
              className="inline-flex h-10 shrink-0 items-center gap-2 rounded-xl bg-primary px-4 text-sm font-bold text-primary-foreground disabled:opacity-60"
            >
              {creating && <Loader2 className="h-4 w-4 animate-spin" />}
              {creating ? t.support_sending : t.support_send}
            </button>
            {formError && (
              <p className="text-sm font-bold text-destructive">{formError}</p>
            )}
          </div>
'''

for label, old in [('header button', old_header), ('form actions', old_actions)]:
    count = page.count(old)
    if count != 1:
        raise RuntimeError(f'{label}: expected one match, found {count}')

page = page.replace(old_header, new_header, 1)
page = page.replace(old_actions, new_actions, 1)
page_path.write_text(page, encoding='utf-8')

translations = [
    (ar_path, 'support_title: "الدعم وتواصل معنا"', 'support_title: "الدعم - تواصل معنا"'),
    (en_path, 'support_title: "Support and Contact Us"', 'support_title: "Support - Contact Us"'),
    (ku_path, 'support_title: "پشتگیری و پەیوەندی بە ئێمەوە"', 'support_title: "پشتگیری - پەیوەندی بە ئێمەوە"'),
]

for path, old, new in translations:
    text = path.read_text(encoding='utf-8')
    count = text.count(old)
    if count != 1:
        raise RuntimeError(f'{path}: expected one title match, found {count}')
    path.write_text(text.replace(old, new, 1), encoding='utf-8')

print('Refined support title, standardized close button, and aligned submit action.')
