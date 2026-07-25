import fs from "node:fs";

const targetPath = "artifacts/fawri/src/components/admin/AdministratorsTab.tsx";
let source = fs.readFileSync(targetPath, "utf8");

const before = `                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  disabled={isCreating}
                  className={
                    language === "ar"
                      ? "absolute right-3 top-1/2 h-8 w-8 -translate-y-1/2"
                      : "absolute right-1 top-1/2 h-8 w-8 -translate-y-1/2"
                  }
                  onClick={() => setShowPassword((current) => !current)}
                >
                  {showPassword ? (
                    <EyeOff className="h-4 w-4" aria-hidden="true" />
                  ) : (
                    <Eye className="h-4 w-4" aria-hidden="true" />
                  )}

                  <span className="sr-only">{t.passwordLabel}</span>
                </Button>`;

const after = `                {language === "ar" ? (
                  <button
                    type="button"
                    aria-label={t.passwordLabel}
                    disabled={isCreating}
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => setShowPassword((current) => !current)}
                    className="absolute right-3 top-1/2 z-10 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground transition hover:text-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:pointer-events-none disabled:opacity-50"
                  >
                    {showPassword ? (
                      <EyeOff className="h-4 w-4" aria-hidden="true" />
                    ) : (
                      <Eye className="h-4 w-4" aria-hidden="true" />
                    )}

                    <span className="sr-only">{t.passwordLabel}</span>
                  </button>
                ) : (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    disabled={isCreating}
                    className="absolute right-1 top-1/2 h-8 w-8 -translate-y-1/2"
                    onClick={() => setShowPassword((current) => !current)}
                  >
                    {showPassword ? (
                      <EyeOff className="h-4 w-4" aria-hidden="true" />
                    ) : (
                      <Eye className="h-4 w-4" aria-hidden="true" />
                    )}

                    <span className="sr-only">{t.passwordLabel}</span>
                  </Button>
                )}`;

const first = source.indexOf(before);
if (first === -1) {
  throw new Error("Could not locate the administrator password visibility control");
}
if (source.indexOf(before, first + before.length) !== -1) {
  throw new Error("Found multiple administrator password visibility controls");
}

source = source.slice(0, first) + after + source.slice(first + before.length);
fs.writeFileSync(targetPath, source, "utf8");
console.log("Arabic administrator password eye now uses the established password-field positioning.");
