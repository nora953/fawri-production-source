from pathlib import Path

path = Path('artifacts/fawri/src/components/admin/AdminSupportTab.tsx')
text = path.read_text(encoding='utf-8')

old_import = '''  CheckCircle2,\n  Eye,\n  Headphones,\n'''
new_import = '''  CheckCircle2,\n  ChevronDown,\n  Eye,\n  Headphones,\n'''
if old_import not in text:
    raise SystemExit('Icon import target not found')
text = text.replace(old_import, new_import, 1)

old_select = '''                        <select\n                          value={inspectionMode}\n                          disabled={working !== null}\n                          onChange={(event) => setInspectionMode(event.target.value as InspectionSessionMode)}\n                          className="h-10 w-full rounded-xl border bg-background px-3 text-sm"\n                        >\n                          <option value="live_observation">{text.inspectionLive}</option>\n                          <option value="independent_read_only">{text.inspectionReadOnly}</option>\n                        </select>\n'''
new_select = '''                        <div className="relative">\n                          <select\n                            value={inspectionMode}\n                            disabled={working !== null}\n                            onChange={(event) => setInspectionMode(event.target.value as InspectionSessionMode)}\n                            className="h-10 w-full appearance-none rounded-xl border bg-background pe-3 ps-10 text-sm"\n                          >\n                            <option value="live_observation">{text.inspectionLive}</option>\n                            <option value="independent_read_only">{text.inspectionReadOnly}</option>\n                          </select>\n                          <ChevronDown\n                            aria-hidden="true"\n                            className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"\n                          />\n                        </div>\n'''
if old_select not in text:
    raise SystemExit('Inspection mode select target not found')
text = text.replace(old_select, new_select, 1)

path.write_text(text, encoding='utf-8')
print('Moved inspection session dropdown arrow to the right edge.')
