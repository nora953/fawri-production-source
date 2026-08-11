#!/usr/bin/env python3
from __future__ import annotations

import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
FRONTEND = ROOT / "artifacts" / "fawri" / "src"
API = ROOT / "artifacts" / "api-server" / "src"
TRANSLATIONS = FRONTEND / "lib" / "translations"
ADMIN_TRANSLATIONS = FRONTEND / "lib" / "admin-translations.ts"

KEY_RE = re.compile(r"^\s{2}([A-Za-z_][A-Za-z0-9_]*):", re.MULTILINE)
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

EXCLUDED_VISIBLE_COPY = {
    FRONTEND / "lib" / "translations" / "en.ts",
    FRONTEND / "lib" / "translations" / "ar.ts",
    FRONTEND / "lib" / "translations" / "ku.ts",
    ADMIN_TRANSLATIONS,
}


def rel(path: Path) -> str:
    return str(path.relative_to(ROOT)).replace("\\", "/")


def read(path: Path) -> str:
    return path.read_text(encoding="utf-8")


def extract_general_keys(path: Path) -> set[str]:
    return set(KEY_RE.findall(read(path)))


def line_count(path: Path) -> int:
    try:
        return len(read(path).splitlines())
    except UnicodeDecodeError:
        return 0


def visible_copy_candidates(path: Path) -> list[tuple[int, str]]:
    if path in EXCLUDED_VISIBLE_COPY:
        return []
    text = read(path)
    findings: list[tuple[int, str]] = []
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
            findings.append((line, value[:140]))
    # de-dupe while preserving order
    seen = set()
    result = []
    for item in findings:
        if item in seen:
            continue
        seen.add(item)
        result.append(item)
    return result


def main() -> int:
    errors: list[str] = []

    en_keys = extract_general_keys(TRANSLATIONS / "en.ts")
    ar_keys = extract_general_keys(TRANSLATIONS / "ar.ts")
    ku_keys = extract_general_keys(TRANSLATIONS / "ku.ts")

    print("=== GENERAL I18N PARITY ===")
    print(f"en={len(en_keys)} ar={len(ar_keys)} ku={len(ku_keys)}")
    for lang, keys in (("ar", ar_keys), ("ku", ku_keys)):
        missing = sorted(en_keys - keys)
        extra = sorted(keys - en_keys)
        print(f"{lang}: missing={len(missing)} extra={len(extra)}")
        if missing:
            print(f"  missing sample: {', '.join(missing[:20])}")
            errors.append(f"general i18n {lang} missing {len(missing)} keys")
        if extra:
            print(f"  extra sample: {', '.join(extra[:20])}")

    print("\n=== LOCAL TRILINGUAL DICTIONARIES ===")
    local_dicts: list[str] = []
    for path in sorted(FRONTEND.rglob("*.ts*")):
        if path in EXCLUDED_VISIBLE_COPY:
            continue
        text = read(path)
        if LOCAL_TRILINGUAL_RE.search(text):
            local_dicts.append(rel(path))
    if local_dicts:
        for item in local_dicts:
            print(item)
        errors.append(f"local trilingual dictionaries={len(local_dicts)}")
    else:
        print("none")

    print("\n=== VISIBLE HARDCODED COPY CANDIDATES ===")
    visible: list[tuple[str, int, str]] = []
    for path in sorted(FRONTEND.rglob("*.tsx")):
        if "/components/ui/" in rel(path):
            continue
        for line, value in visible_copy_candidates(path):
            visible.append((rel(path), line, value))
    print(f"count={len(visible)}")
    for file_name, line, value in visible[:80]:
        print(f"{file_name}:{line}: {value}")
    if visible:
        errors.append(f"visible hardcoded copy candidates={len(visible)}")

    print("\n=== LONG SOURCE FILES ===")
    long_files: list[tuple[int, str]] = []
    for base in (FRONTEND, API):
        for path in base.rglob("*.ts*"):
            count = line_count(path)
            if count >= 800:
                long_files.append((count, rel(path)))
    long_files.sort(reverse=True)
    for count, file_name in long_files:
        marker = "CRITICAL" if count >= 1800 else "LONG"
        print(f"{marker} {count:5d} {file_name}")
    critical = [(count, file_name) for count, file_name in long_files if count >= 1800]
    if critical:
        errors.append(f"critical long files={len(critical)}")

    print("\n=== KNOWN STRUCTURE TARGETS ===")
    for target in (
        FRONTEND / "pages" / "AdminPage.tsx",
        API / "routes" / "auth.ts",
        API / "routes" / "index.ts",
        FRONTEND / "components" / "SaasBillingPanel.tsx",
    ):
        if target.exists():
            print(f"{line_count(target):5d} {rel(target)}")

    print("\n=== AUDIT SUMMARY ===")
    if errors:
        for error in errors:
            print(f"BLOCKER {error}")
        print("TRANSLATION_STRUCTURE_AUDIT_NEEDS_WORK")
        return 2

    print("TRANSLATION_STRUCTURE_AUDIT_CLEAN")
    return 0


if __name__ == "__main__":
    sys.exit(main())
