from pathlib import Path

PATH = Path('artifacts/fawri/src/pages/AdminPage.tsx')


def replace_once(text: str, old: str, new: str, label: str) -> str:
    count = text.count(old)
    if count != 1:
        raise RuntimeError(f'{label}: expected one match, found {count}')
    return text.replace(old, new, 1)


def replace_exact_count(
    text: str,
    old: str,
    new: str,
    expected_count: int,
    label: str,
) -> str:
    count = text.count(old)
    if count != expected_count:
        raise RuntimeError(
            f'{label}: expected {expected_count} matches, found {count}'
        )
    return text.replace(old, new, expected_count)


text = PATH.read_text(encoding='utf-8')

text = replace_once(
    text,
    '''                              "px-2.5 py-3.5 text-xs font-semibold text-muted-foreground " +
                              (adminText.dir === "rtl" ? "text-right" : "text-left")
''',
    '''                              "px-2.5 py-3.5 text-center text-xs font-semibold text-muted-foreground"
''',
    'center desktop table headings',
)

text = replace_exact_count(
    text,
    '<td className="w-[16%] px-2 py-3 align-top">',
    '<td className="w-[16%] px-2 py-3 align-middle">',
    2,
    'store and phone cell vertical alignment',
)

text = replace_exact_count(
    text,
    'className="flex min-h-[154px] flex-col justify-center rounded-xl border border-border/80 bg-gradient-to-b from-muted/30 to-background p-3 shadow-sm"',
    'className="flex min-h-[190px] h-full flex-col justify-center rounded-xl border border-border/80 bg-gradient-to-b from-muted/30 to-background p-3 shadow-sm"',
    2,
    'store and phone card heights',
)

text = replace_once(
    text,
    '''  return (
    <div className={compact ? "space-y-2" : "grid gap-2 sm:grid-cols-3"}>
''',
    '''  return (
    <div
      className={
        compact
          ? "flex min-h-[190px] h-full flex-col justify-center gap-2 rounded-xl border border-border/80 bg-muted/20 p-3 shadow-sm"
          : "grid gap-2 sm:grid-cols-3"
      }
    >
''',
    'status card vertical alignment',
)

text = replace_once(
    text,
    '''        "space-y-2.5 rounded-xl border border-border/80 bg-gradient-to-b from-muted/35 to-background shadow-sm " +
        (compact ? "min-w-[230px] p-3" : "p-3.5")
''',
    '''        "rounded-xl border border-border/80 bg-gradient-to-b from-muted/35 to-background shadow-sm " +
        (compact
          ? "flex min-h-[190px] h-full min-w-0 flex-col justify-center gap-2.5 p-3"
          : "space-y-2.5 p-3.5")
''',
    'subscription card vertical alignment',
)

text = replace_once(
    text,
    'className="flex min-w-0 flex-col gap-2 rounded-xl border border-border/80 bg-muted/20 p-2.5 shadow-sm"',
    'className="flex min-h-[190px] h-full min-w-0 flex-col justify-center gap-2 rounded-xl border border-border/80 bg-muted/20 p-2.5 shadow-sm"',
    'actions card vertical alignment',
)

text = replace_once(
    text,
    '<td className="w-[15%] px-2 py-3 align-middle">',
    '<td className="w-[15%] px-2 py-3 align-middle text-center">',
    'status cell horizontal alignment',
)

PATH.write_text(text, encoding='utf-8')
print('Centered desktop headings and aligned all merchant cards vertically.')
