import fs from "node:fs";

const targetPath = "artifacts/fawri/src/components/admin/AdministratorsTab.tsx";
let source = fs.readFileSync(targetPath, "utf8");

const dialogStartMarker =
  "      <Dialog open={isCreateDialogOpen} onOpenChange={handleCreateDialogChange}>";
const nextDialogMarker =
  "\n\n      <Dialog\n        open={permissionDialogOpen}";

const startIndex = source.indexOf(dialogStartMarker);
const endIndex = source.indexOf(nextDialogMarker, startIndex);

if (startIndex === -1 || endIndex === -1) {
  throw new Error("Could not locate the assistant administrator creation dialog");
}

let dialog = source.slice(startIndex, endIndex);

function replaceCounted(label, before, after, expectedCount) {
  const actualCount = dialog.split(before).length - 1;
  if (actualCount !== expectedCount) {
    throw new Error(`Expected ${expectedCount} matches for ${label}, found ${actualCount}`);
  }
  dialog = dialog.replaceAll(before, after);
}

replaceCounted(
  "English field spacing",
  'className={language === "ar" || language === "ku" ? "space-y-2" : "space-y-1.5"}',
  'className="space-y-2"',
  4,
);

replaceCounted(
  "English field label spacing",
  'className={language === "ar" || language === "ku" ? "block min-h-5 leading-5" : undefined}',
  'className="block min-h-5 leading-5"',
  4,
);

const englishEyeBefore = `                ) : (
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

const englishEyeAfter = `                ) : (
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
                )}`;

replaceCounted(
  "English password eye placement",
  englishEyeBefore,
  englishEyeAfter,
  1,
);

source = source.slice(0, startIndex) + dialog + source.slice(endIndex);
fs.writeFileSync(targetPath, source, "utf8");
console.log("English assistant administrator dialog now matches the approved field spacing and password-eye placement.");
