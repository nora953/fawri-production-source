from pathlib import Path

path = Path('artifacts/fawri/src/components/admin/AdminSupportTab.tsx')
text = path.read_text(encoding='utf-8')


def replace_once(old: str, new: str, label: str) -> None:
    global text
    count = text.count(old)
    if count != 1:
        raise RuntimeError(f'{label}: expected one match, found {count}')
    text = text.replace(old, new, 1)


replace_once(
    "    subtitle: 'متابعة شكاوى التجار ومحادثاتهم مع فريق الدعم.',\n",
    "    subtitle: 'متابعة شكاوى ومحادثات التجار.',\n",
    'Arabic support subtitle',
)
replace_once(
    "    subtitle: 'بەدواداچوونی کێشە و گفتوگۆکانی بازرگانان لەگەڵ تیمی پشتگیری.',\n",
    "    subtitle: 'بەدواداچوونی کێشە و گفتوگۆکانی بازرگانان.',\n",
    'Kurdish support subtitle',
)
replace_once(
    "    subtitle: 'Monitor merchant issues and conversations with the support team.',\n",
    "    subtitle: 'Monitor merchant issues and conversations.',\n",
    'English support subtitle',
)
replace_once(
    '''                  <p className="mt-1 line-clamp-2 text-[11px] leading-4 text-muted-foreground">
                    {text.subtitle}
                  </p>
''',
    '''                  <p className="mt-1 truncate text-[11px] leading-4 text-muted-foreground" title={text.subtitle}>
                    {text.subtitle}
                  </p>
''',
    'single-line support subtitle',
)

path.write_text(text, encoding='utf-8')
print('Shortened the support sidebar subtitle to one line in all three languages.')
