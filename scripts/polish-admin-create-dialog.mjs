import fs from "node:fs";

const targetPath = "artifacts/fawri/src/components/admin/AdministratorsTab.tsx";
let source = fs.readFileSync(targetPath, "utf8");

function replaceOnce(label, before, after) {
  const first = source.indexOf(before);
  if (first === -1) {
    throw new Error(`Could not find ${label}`);
  }

  if (source.indexOf(before, first + before.length) !== -1) {
    throw new Error(`Found multiple matches for ${label}`);
  }

  source = source.slice(0, first) + after + source.slice(first + before.length);
}

replaceOnce(
  "X icon import",
  "  Users,\n  XCircle,",
  "  Users,\n  X,\n  XCircle,",
);

replaceOnce(
  "DialogClose import",
  "  Dialog,\n  DialogContent,",
  "  Dialog,\n  DialogClose,\n  DialogContent,",
);

const dialogStartMarker =
  "      <Dialog open={isCreateDialogOpen} onOpenChange={handleCreateDialogChange}>";
const nextDialogMarker =
  "\n\n      <Dialog\n        open={permissionDialogOpen}";

const startIndex = source.indexOf(dialogStartMarker);
const endIndex = source.indexOf(nextDialogMarker, startIndex);

if (startIndex === -1 || endIndex === -1) {
  throw new Error("Could not locate the assistant administrator creation dialog");
}

const newDialog = `      <Dialog open={isCreateDialogOpen} onOpenChange={handleCreateDialogChange}>
        <DialogContent
          className="max-h-[calc(100vh-2rem)] w-[calc(100%-2rem)] overflow-hidden p-0 shadow-2xl sm:max-w-xl sm:rounded-2xl [&>button]:hidden"
          dir={adminText.dir}
          onEscapeKeyDown={(event) => {
            if (isCreating) event.preventDefault();
          }}
          onPointerDownOutside={(event) => {
            if (isCreating) event.preventDefault();
          }}
        >
          <DialogHeader className="border-b px-6 py-5">
            <div className="flex items-start justify-between gap-4">
              <div
                className={
                  adminText.dir === "rtl"
                    ? "min-w-0 flex-1 text-right"
                    : "min-w-0 flex-1 text-left"
                }
              >
                <DialogTitle className="text-xl leading-7">
                  {t.dialogTitle}
                </DialogTitle>
                <DialogDescription className="mt-1 leading-6">
                  {t.dialogDescription}
                </DialogDescription>
              </div>

              <DialogClose asChild>
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  disabled={isCreating}
                  className="h-9 w-9 shrink-0 rounded-xl text-muted-foreground shadow-none"
                  aria-label={t.cancel}
                >
                  <X className="h-4 w-4" aria-hidden="true" />
                  <span className="sr-only">{t.cancel}</span>
                </Button>
              </DialogClose>
            </div>
          </DialogHeader>

          <form
            className="flex min-h-0 flex-col"
            onSubmit={(event) => {
              event.preventDefault();
              void handleCreateAdministrator();
            }}
          >
            <div className="space-y-4 overflow-y-auto px-6 py-5">
              <div className="space-y-1.5">
                <Label
                  htmlFor="administrator-owner-name"
                  className="text-sm font-medium"
                >
                  {t.nameLabel}
                </Label>

                <Input
                  id="administrator-owner-name"
                  value={form.ownerName}
                  disabled={isCreating}
                  autoComplete="name"
                  maxLength={100}
                  className="h-11"
                  onChange={(event) => {
                    setForm((current) => ({
                      ...current,
                      ownerName: event.target.value,
                    }));
                    setFormError("");
                  }}
                />
              </div>

              <div className="space-y-1.5">
                <Label
                  htmlFor="administrator-phone"
                  className="text-sm font-medium"
                >
                  {t.phoneInputLabel}
                </Label>

                <Input
                  id="administrator-phone"
                  value={form.phone}
                  disabled={isCreating}
                  type="tel"
                  inputMode="numeric"
                  autoComplete="tel"
                  maxLength={11}
                  dir="ltr"
                  className="h-11 text-left"
                  onChange={(event) => {
                    setForm((current) => ({
                      ...current,
                      phone: normalizePhoneInput(event.target.value),
                    }));
                    setFormError("");
                  }}
                />
              </div>

              <div className="space-y-1.5">
                <Label
                  htmlFor="administrator-password"
                  className="text-sm font-medium"
                >
                  {t.passwordLabel}
                </Label>

                <div className="relative">
                  <Input
                    id="administrator-password"
                    value={form.password}
                    disabled={isCreating}
                    type={showPassword ? "text" : "password"}
                    autoComplete="new-password"
                    dir="ltr"
                    className="h-11 pe-12"
                    onChange={(event) => {
                      setForm((current) => ({
                        ...current,
                        password: event.target.value,
                      }));
                      setFormError("");
                    }}
                  />

                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    disabled={isCreating}
                    className="absolute end-1.5 top-1/2 z-10 h-8 w-8 -translate-y-1/2 rounded-lg text-muted-foreground"
                    aria-label={t.passwordLabel}
                    onClick={() => setShowPassword((current) => !current)}
                  >
                    {showPassword ? (
                      <EyeOff className="h-4 w-4" aria-hidden="true" />
                    ) : (
                      <Eye className="h-4 w-4" aria-hidden="true" />
                    )}

                    <span className="sr-only">{t.passwordLabel}</span>
                  </Button>
                </div>
              </div>

              <div className="space-y-1.5">
                <Label
                  htmlFor="administrator-language"
                  className="text-sm font-medium"
                >
                  {t.languageInputLabel}
                </Label>

                <Select
                  value={form.language}
                  disabled={isCreating}
                  onValueChange={(value) => {
                    setForm((current) => ({
                      ...current,
                      language: value as SupportedLanguage,
                    }));
                    setFormError("");
                  }}
                >
                  <SelectTrigger id="administrator-language" className="h-11">
                    <SelectValue />
                  </SelectTrigger>

                  <SelectContent dir={adminText.dir}>
                    <SelectItem value="ar">{t.languages.ar}</SelectItem>
                    <SelectItem value="en">{t.languages.en}</SelectItem>
                    <SelectItem value="ku">{t.languages.ku}</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {formError && (
                <div
                  role="alert"
                  className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2.5 text-sm leading-6 text-destructive"
                >
                  {formError}
                </div>
              )}
            </div>

            <DialogFooter
              className={
                adminText.dir === "rtl"
                  ? "!flex-row-reverse !justify-end gap-3 border-t bg-muted/20 px-6 py-4 sm:space-x-0"
                  : "!flex-row !justify-end gap-3 border-t bg-muted/20 px-6 py-4 sm:space-x-0"
              }
            >
              <Button
                type="button"
                variant="outline"
                disabled={isCreating}
                className="min-w-24"
                onClick={() => handleCreateDialogChange(false)}
              >
                {t.cancel}
              </Button>

              <Button
                type="submit"
                disabled={isCreating}
                className="min-w-28"
              >
                {isCreating && (
                  <Loader2
                    className="me-2 h-4 w-4 animate-spin"
                    aria-hidden="true"
                  />
                )}

                {isCreating ? t.creating : t.create}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>`;

source = source.slice(0, startIndex) + newDialog + source.slice(endIndex);
fs.writeFileSync(targetPath, source, "utf8");
console.log("Assistant administrator creation dialog polished successfully.");
