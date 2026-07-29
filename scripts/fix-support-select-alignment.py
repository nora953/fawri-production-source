from pathlib import Path

path = Path('artifacts/fawri/src/pages/dashboard/SupportPage.tsx')
text = path.read_text(encoding='utf-8')

old_import = """import {
  Headphones,
  Loader2,
  MessageCircle,
"""
new_import = """import {
  ChevronDown,
  Headphones,
  Loader2,
  MessageCircle,
"""

old_select = """              <select
                value={category}
                disabled={creating}
                onChange={(event) =>
                  setCategory(event.target.value as SupportCategory)
                }
                className=\"h-10 w-full rounded-xl border bg-background px-3 text-start text-sm outline-none focus:ring-2 focus:ring-orange-500/20\"
              >
                {categoryValues.map((value) => (
                  <option key={value} value={value}>
                    {categoryLabel(value)}
                  </option>
                ))}
              </select>
"""

new_select = """              <div className=\"relative\">
                <select
                  value={category}
                  disabled={creating}
                  onChange={(event) =>
                    setCategory(event.target.value as SupportCategory)
                  }
                  className=\"h-10 w-full appearance-none rounded-xl border bg-background ps-3 pe-10 text-start text-sm outline-none focus:ring-2 focus:ring-orange-500/20\"
                >
                  {categoryValues.map((value) => (
                    <option key={value} value={value}>
                      {categoryLabel(value)}
                    </option>
                  ))}
                </select>
                <ChevronDown
                  aria-hidden=\"true\"
                  className=\"pointer-events-none absolute end-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground\"
                />
              </div>
"""

if text.count(old_import) != 1:
    raise RuntimeError(f'import target count: {text.count(old_import)}')
if text.count(old_select) != 1:
    raise RuntimeError(f'select target count: {text.count(old_select)}')

text = text.replace(old_import, new_import, 1)
text = text.replace(old_select, new_select, 1)
path.write_text(text, encoding='utf-8')
print('Fixed support category select text and chevron alignment.')
