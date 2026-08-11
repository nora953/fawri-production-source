#!/usr/bin/env python3
from __future__ import annotations

import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
FRONTEND = ROOT / "artifacts" / "fawri" / "src"
TRANSLATIONS = FRONTEND / "lib" / "translations"
ADMIN_TRANSLATIONS = FRONTEND / "lib" / "admin-translations.ts"

LOCAL_TRILINGUAL_RE = re.compile(
    r"(?:const|let)\s+[A-Za-z_$][\w$]*\s*=\s*\{[\s\S]{0,12000}?\bar\s*:\s*\{[\s\S]{0,12000}?\b(?:en|ku)\s*:\s*\{[\s\S]{0,12000}?\b(?:en|ku)\s*:\s*\{",
    re.MULTILINE,
)
JSX_TEXT_RE = re.compile(r">\s*([^<>{}\n][^<>{}\n]*?[A-Za-z\u0600-\u06ff][^<>{}\n]*?)\s*<")
STRING_PROP_RE = re.compile(
    r"\b(?:title|placeholder|aria-label|description|label)\s*=\s*([\"'])([^\"']*[A-Za-z\u0600-\u06ff][^\"']*)\1"
)
TOAST_RE = re.compile(
    r"\btoast\.(?:success|error|warning|info)\(\s*([\"'])([^\"']*[A-Za-z\u0600-\u06ff][^\"']*)\1"
)


def rel(path: Path) -> str:
    return str(path.relative_to(ROOT)).replace("\\", "/")


def read(path: Path) -> str:
    return path.read_text(encoding="utf-8")


def is_translation_authority(path: Path) -> bool:
    return path.parent == TRANSLATIONS or path == ADMIN_TRANSLATIONS


def visible_count(path: Path) -> int:
    if is_translation_authority(path) or "/components/ui/" in rel(path):
        return 0
    text = read(path)
    seen: set[tuple[int, str]] = set()
    for regex in (JSX_TEXT_RE, STRING_PROP_RE, TOAST_RE):
        for match in regex.finditer(text):
            value = match.group(match.lastindex or 1).strip()
            if len(value) < 3:
                continue
            if value.startswith(("http://", "https://", "/api/", "data:", "mailto:")):
                continue
            if value in {"svg", "div", "span", "button", "input"}:
                continue
            line = text.count("\n", 0, match.start()) + 1
            seen.add((line, value))
    return len(seen)


def main() -> None:
    local: list[str] = []
    for path in sorted(FRONTEND.rglob("*.ts*")):
        if is_translation_authority(path):
            continue
        if LOCAL_TRILINGUAL_RE.search(read(path)):
            local.append(rel(path))

    visible: list[tuple[int, str]] = []
    for path in sorted(FRONTEND.rglob("*.tsx")):
        count = visible_count(path)
        if count:
            visible.append((count, rel(path)))
    visible.sort(key=lambda item: (-item[0], item[1]))

    print("=== LOCAL DICTIONARY FILES ===")
    for item in local:
        print(item)
    print(f"TOTAL_LOCAL_DICTIONARY_FILES={len(local)}")

    print("\n=== HARDCODED COPY CANDIDATES BY FILE ===")
    for count, item in visible:
        print(f"{count:02d} {item}")
    print(f"TOTAL_HARDCODED_COPY_CANDIDATES={sum(count for count, _ in visible)}")
    print(f"TOTAL_HARDCODED_COPY_FILES={len(visible)}")
    print("TRANSLATION_STRUCTURE_INVENTORY_READY")


if __name__ == "__main__":
    main()
