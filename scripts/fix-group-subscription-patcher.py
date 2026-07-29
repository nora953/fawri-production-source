from pathlib import Path

path = Path('scripts/group-subscription-details-cards.py')
text = path.read_text(encoding='utf-8')

old = '''page = replace_once(
    page,
    '  const locale = lang === "en" ? "en-US" : "ar-IQ";\\n',
    '  const locale = lang === "en" ? "en-US" : lang === "ku" ? "ckb-IQ" : "ar-IQ";\\n',
    'details locale',
)
'''

new = '''page = replace_once(
    page,
    \'''  const [noteText, setNoteText] = useState(notes);\n\n  useEffect(() => {\n    setNoteText(notes);\n  }, [merchant.id, notes]);\n\n  const locale = lang === "en" ? "en-US" : "ar-IQ";\n\''',
    \'''  const [noteText, setNoteText] = useState(notes);\n\n  useEffect(() => {\n    setNoteText(notes);\n  }, [merchant.id, notes]);\n\n  const locale = lang === "en" ? "en-US" : lang === "ku" ? "ckb-IQ" : "ar-IQ";\n\''',
    'details locale',
)
'''

count = text.count(old)
if count != 1:
    raise RuntimeError(f'patcher locale block: expected one match, found {count}')

path.write_text(text.replace(old, new, 1), encoding='utf-8')
print('Fixed grouped subscription patcher targeting.')
