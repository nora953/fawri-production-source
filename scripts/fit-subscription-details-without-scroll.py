from pathlib import Path

path = Path('artifacts/fawri/src/pages/AdminPage.tsx')
text = path.read_text(encoding='utf-8')


def replace_once(source: str, old: str, new: str, label: str) -> str:
    count = source.count(old)
    if count != 1:
        raise RuntimeError(f'{label}: expected one match, found {count}')
    return source.replace(old, new, 1)


text = replace_once(
    text,
    'className={`flex max-h-[90vh] w-full max-w-2xl flex-col p-0 ${',
    'className={`flex max-h-[92vh] w-full max-w-3xl flex-col p-0 ${',
    'details dialog width',
)
text = replace_once(
    text,
    '<DialogHeader className={`px-6 pb-0 pt-5 ${textAlignmentClass}`}>',
    '<DialogHeader className={`px-5 pb-0 pt-4 ${textAlignmentClass}`}>',
    'details header spacing',
)
text = replace_once(
    text,
    '<div className="mt-3 grid grid-cols-4 border-b px-3 sm:px-6">',
    '<div className="mt-2 grid grid-cols-4 border-b px-3 sm:px-5">',
    'details tabs spacing',
)
text = replace_once(
    text,
    '''        <div
          className={`px-6 py-4 ${
            activeTab === "channels"
              ? "flex-none"
              : "min-h-0 flex-1 overflow-y-auto"
          }`}
        >
''',
    '''        <div
          className={`px-4 py-3 sm:px-5 ${
            activeTab === "channels"
              ? "flex-none"
              : activeTab === "subscription"
                ? "min-h-0 flex-1 overflow-y-auto sm:flex-none sm:overflow-visible"
                : "min-h-0 flex-1 overflow-y-auto"
          }`}
        >
''',
    'subscription desktop overflow',
)

start_marker = '          {activeTab === "subscription" &&\n'
end_marker = '          {activeTab === "channels" && (\n'
start = text.find(start_marker)
end = text.find(end_marker, start)
if start < 0 or end < 0:
    raise RuntimeError('subscription render block markers were not found')

block = text[start:end]
replacements = [
    ('<div className="grid gap-3 sm:grid-cols-2">', '<div className="grid items-stretch gap-2 sm:grid-cols-2">'),
    ('rounded-xl border border-border/80 bg-muted/15 p-3', 'rounded-xl border border-border/80 bg-muted/15 p-2'),
    ('rounded-xl border border-orange-200 bg-orange-50/50 p-3', 'rounded-xl border border-orange-200 bg-orange-50/50 p-2'),
    ('grid grid-cols-2 gap-2', 'grid grid-cols-2 gap-1.5'),
    ('grid grid-cols-3 gap-2', 'grid grid-cols-3 gap-1.5'),
    ('rounded-lg bg-background p-2.5', 'rounded-lg bg-background px-2 py-1.5'),
    ('className="mt-1 text-sm font-bold text-foreground"', 'className="mt-0.5 text-sm font-bold leading-5 text-foreground"'),
    ('className="mt-1 text-xs font-bold text-foreground"', 'className="mt-0.5 text-xs font-bold leading-5 text-foreground"'),
    ('className="mt-1 text-base font-black text-foreground"', 'className="mt-0.5 text-base font-black leading-5 text-foreground"'),
]

for old, new in replacements:
    if old not in block:
        raise RuntimeError(f'subscription compacting pattern not found: {old}')
    block = block.replace(old, new)

text = text[:start] + block + text[end:]
text = replace_once(
    text,
    '<div className="flex justify-start border-t px-6 pb-4 pt-4">',
    '<div className="flex justify-start border-t px-5 pb-3 pt-3">',
    'details footer spacing',
)
text = replace_once(
    text,
    '<Button variant="outline" onClick={onClose}>\n            {adminText.close}\n          </Button>',
    '<Button variant="outline" size="sm" onClick={onClose}>\n            {adminText.close}\n          </Button>',
    'details close button size',
)

path.write_text(text, encoding='utf-8')
print('Compacted subscription details to fit desktop without internal scrolling.')
