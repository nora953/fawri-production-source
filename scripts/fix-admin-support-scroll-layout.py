from pathlib import Path

admin_path = Path('artifacts/fawri/src/pages/AdminPage.tsx')
support_path = Path('artifacts/fawri/src/components/admin/AdminSupportTab.tsx')


def replace_once(text: str, old: str, new: str, label: str) -> str:
    count = text.count(old)
    if count != 1:
        raise RuntimeError(f'{label}: expected one match, found {count}')
    return text.replace(old, new, 1)


admin = admin_path.read_text(encoding='utf-8')
admin = replace_once(
    admin,
    '''      <main className="max-w-7xl mx-auto px-4 md:px-6 py-5 space-y-4">
''',
    '''      <main
        className={`mx-auto max-w-7xl px-4 py-5 md:px-6 ${
          tab === "support"
            ? "space-y-3 md:flex md:h-[calc(100dvh-4rem)] md:flex-col md:gap-3 md:space-y-0 md:overflow-hidden"
            : "space-y-4"
        }`}
      >
''',
    'admin support main viewport layout',
)
admin_path.write_text(admin, encoding='utf-8')

support = support_path.read_text(encoding='utf-8')

replacements = [
    (
        '''    <section className="space-y-3" dir={dir}>
''',
        '''    <section
      className="flex min-h-0 flex-col gap-2 md:flex-1 md:overflow-hidden"
      dir={dir}
    >
''',
        'support section flex layout',
    ),
    (
        '''      <div className="flex flex-col gap-3 rounded-2xl border bg-card p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between">
''',
        '''      <div className="flex shrink-0 flex-col gap-2 rounded-2xl border bg-card p-3 shadow-sm sm:flex-row sm:items-center sm:justify-between">
''',
        'support compact heading card',
    ),
    (
        '''            <h2 className="text-lg font-black">{text.title}</h2>
''',
        '''            <h2 className="text-base font-black sm:text-lg">{text.title}</h2>
''',
        'support compact title',
    ),
    (
        '''          <p className="mt-1 text-sm text-muted-foreground">{text.subtitle}</p>
''',
        '''          <p className="mt-0.5 text-xs leading-5 text-muted-foreground sm:text-sm">{text.subtitle}</p>
''',
        'support compact subtitle',
    ),
    (
        '''        <div className="rounded-xl border bg-muted/30 px-3 py-2 text-center">
''',
        '''        <div className="rounded-xl border bg-muted/30 px-3 py-1.5 text-center">
''',
        'support compact count card',
    ),
    (
        '''        <div className="rounded-xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm font-semibold leading-6 text-sky-900 dark:border-sky-900/70 dark:bg-sky-950/30 dark:text-sky-100">
''',
        '''        <div className="shrink-0 rounded-xl border border-sky-200 bg-sky-50 px-4 py-2 text-sm font-semibold leading-5 text-sky-900 dark:border-sky-900/70 dark:bg-sky-950/30 dark:text-sky-100">
''',
        'support compact owner notice',
    ),
    (
        '''        <div className="flex min-h-80 items-center justify-center rounded-2xl border bg-card text-muted-foreground">
''',
        '''        <div className="flex min-h-80 flex-1 items-center justify-center rounded-2xl border bg-card text-muted-foreground md:min-h-0">
''',
        'support loading viewport',
    ),
    (
        '''        <div className="flex min-h-80 flex-col items-center justify-center gap-4 rounded-2xl border bg-card p-6 text-center">
''',
        '''        <div className="flex min-h-80 flex-1 flex-col items-center justify-center gap-4 rounded-2xl border bg-card p-6 text-center md:min-h-0">
''',
        'support error viewport',
    ),
    (
        '''        <div className="flex min-h-80 flex-col items-center justify-center rounded-2xl border border-dashed bg-card p-6 text-center">
''',
        '''        <div className="flex min-h-80 flex-1 flex-col items-center justify-center rounded-2xl border border-dashed bg-card p-6 text-center md:min-h-0">
''',
        'support empty viewport',
    ),
    (
        '''        <div className="grid min-h-[540px] overflow-hidden rounded-2xl border bg-card shadow-sm lg:grid-cols-[330px_1fr]">
''',
        '''        <div className="grid min-h-[480px] flex-1 overflow-hidden rounded-2xl border bg-card shadow-sm md:min-h-0 lg:grid-cols-[300px_1fr]">
''',
        'support conversation viewport',
    ),
    (
        '''          <div className="border-b lg:border-b-0 lg:border-e">
            <div className="max-h-72 space-y-2 overflow-y-auto p-3 lg:max-h-[640px]">
''',
        '''          <div className="min-h-0 overflow-hidden border-b lg:border-b-0 lg:border-e">
            <div className="h-full max-h-72 space-y-2 overflow-y-auto p-3 lg:max-h-none">
''',
        'support ticket list containment',
    ),
    (
        '''              <div className="border-b p-4">
''',
        '''              <div className="shrink-0 border-b p-3">
''',
        'support conversation header containment',
    ),
    (
        '''                    <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
''',
        '''                    <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
''',
        'support compact merchant metadata',
    ),
    (
        '''                    <p className="mt-2 text-xs text-muted-foreground">
''',
        '''                    <p className="mt-1.5 text-xs text-muted-foreground">
''',
        'support compact assignee metadata',
    ),
    (
        '''              <div className="min-h-0 flex-1 space-y-3 overflow-y-auto bg-muted/20 p-4 lg:max-h-[430px]">
''',
        '''              <div className="min-h-0 flex-1 space-y-3 overflow-y-auto overscroll-contain bg-muted/20 p-3">
''',
        'support conversation-only scrolling',
    ),
]

for old, new, label in replacements:
    support = replace_once(support, old, new, label)

support_path.write_text(support, encoding='utf-8')
print('Fixed admin support viewport so page stays fixed and conversation owns scrolling.')
