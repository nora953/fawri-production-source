from pathlib import Path


def replace_once(path: Path, old: str, new: str, label: str) -> None:
    text = path.read_text()
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"{label}: expected 1 match, found {count}")
    path.write_text(text.replace(old, new, 1))


settings_path = Path("artifacts/fawri/src/pages/dashboard/SettingsPage.tsx")

replace_once(
    settings_path,
    '''                <Button
                  type="button"
                  variant="outline"
                  className="h-12 rounded-xl bg-orange-500 px-5 text-base font-extrabold text-white shadow-md transition hover:bg-orange-600"
                  onClick={() => {
                    setIsChangePasswordOpen(true);
                  }}
                >{t.settings_changePassword}</Button>
''',
    '''                <Button
                  type="button"
                  variant="outline"
                  className="h-auto min-h-12 w-full min-w-0 whitespace-normal break-words rounded-xl bg-orange-500 px-4 py-3 text-center text-sm font-extrabold leading-5 text-white shadow-md transition hover:bg-orange-600 sm:px-5 sm:text-base"
                  onClick={() => {
                    setIsChangePasswordOpen(true);
                  }}
                >
                  {t.settings_changePassword}
                </Button>
''',
    "change-password mobile button",
)

replace_once(
    settings_path,
    '''                <Button
                  type="button"
                  variant="outline"
                  className="h-12 rounded-xl border border-blue-200 bg-blue-50 px-5 text-base font-extrabold text-blue-700 shadow-sm transition hover:bg-blue-100"
                  onClick={() => {
                    toast.success(t.settings_requestSent);
                  }}
                >{t.settings_requestPhoneChange}</Button>
''',
    '''                <Button
                  type="button"
                  variant="outline"
                  className="h-auto min-h-12 w-full min-w-0 whitespace-normal break-words rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-center text-sm font-extrabold leading-5 text-blue-700 shadow-sm transition hover:bg-blue-100 sm:px-5 sm:text-base"
                  onClick={() => {
                    toast.success(t.settings_requestSent);
                  }}
                >
                  {t.settings_requestPhoneChange}
                </Button>
''',
    "phone-change mobile button",
)

replace_once(
    settings_path,
    '''                <Button
                  type="submit"
                  className="h-11 rounded-xl bg-orange-500 px-6 font-bold text-white hover:bg-orange-600"
                >
                  <Save className="ml-2 h-4 w-4" />
                  {t.settings_saveOperations}
                </Button>
''',
    '''                <Button
                  type="submit"
                  className="h-auto min-h-11 w-full min-w-0 gap-2 whitespace-normal break-words rounded-xl bg-orange-500 px-4 py-3 text-center text-sm font-bold leading-5 text-white hover:bg-orange-600 sm:w-auto sm:px-6"
                >
                  <Save className="h-4 w-4 shrink-0" />
                  <span className="min-w-0 break-words">
                    {t.settings_saveOperations}
                  </span>
                </Button>
''',
    "operations-save mobile button",
)

print("Settings mobile button overflow fixes applied.")
