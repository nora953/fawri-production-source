#!/usr/bin/env python3
from __future__ import annotations

import json
import re
import subprocess
import sys
from pathlib import Path

from lib.translation_structure_policy import (
    find_hardcoded_localized_object_declarations,
)

ROOT = Path(__file__).resolve().parents[1]
FRONTEND = ROOT / "artifacts" / "fawri" / "src"
API = ROOT / "artifacts" / "api-server" / "src"
TRANSLATIONS = FRONTEND / "lib" / "translations"
ADMIN_TRANSLATIONS = FRONTEND / "lib" / "admin-translations.ts"
VISIBLE_COPY_AUDIT = ROOT / "scripts" / "audit-visible-ui-copy.mjs"

KEY_RE = re.compile(r"^\s{2}([A-Za-z_][A-Za-z0-9_]*):", re.MULTILINE)
ADMIN_LANGUAGE_RE = re.compile(r"^  (ar|ku|en):\s*\{", re.MULTILINE)
ADMIN_DIRECT_KEY_RE = re.compile(r"^    ([A-Za-z_][A-Za-z0-9_]*):", re.MULTILINE)
ADMIN_KU_OBJECT_RE = re.compile(r"^const kuTranslations\s*=\s*\{", re.MULTILINE)
ADMIN_KU_DIRECT_KEY_RE = re.compile(r"^  ([A-Za-z_][A-Za-z0-9_]*):", re.MULTILINE)


def rel(path: Path) -> str:
    return str(path.relative_to(ROOT)).replace("\\", "/")


def read(path: Path) -> str:
    return path.read_text(encoding="utf-8")


def is_translation_authority(path: Path) -> bool:
    return path == ADMIN_TRANSLATIONS or TRANSLATIONS in path.parents


def extract_general_keys(path: Path) -> set[str]:
    return set(KEY_RE.findall(read(path)))


def _matching_brace(text: str, start: int) -> int:
    depth = 0
    index = start
    mode = "code"
    quote = ""
    while index < len(text):
        char = text[index]
        nxt = text[index + 1] if index + 1 < len(text) else ""
        if mode == "code":
            if char in {"'", '"', "`"}:
                quote = char
                mode = "string"
            elif char == "/" and nxt == "/":
                mode = "line_comment"
                index += 1
            elif char == "/" and nxt == "*":
                mode = "block_comment"
                index += 1
            elif char == "{":
                depth += 1
            elif char == "}":
                depth -= 1
                if depth == 0:
                    return index
        elif mode == "string":
            if char == "\\":
                index += 1
            elif char == quote:
                mode = "code"
                quote = ""
        elif mode == "line_comment":
            if char == "\n":
                mode = "code"
        elif char == "*" and nxt == "/":
            mode = "code"
            index += 1
        index += 1
    raise ValueError("unbalanced admin translation language block")


def extract_admin_language_keys(text: str) -> dict[str, set[str]]:
    result: dict[str, set[str]] = {}
    for match in ADMIN_LANGUAGE_RE.finditer(text):
        lang = match.group(1)
        open_brace = text.find("{", match.start())
        if open_brace < 0:
            continue
        close_brace = _matching_brace(text, open_brace)
        block = text[open_brace + 1 : close_brace]
        result[lang] = set(ADMIN_DIRECT_KEY_RE.findall(block))

    ku_match = ADMIN_KU_OBJECT_RE.search(text)
    if ku_match is not None:
        open_brace = text.find("{", ku_match.start())
        if open_brace >= 0:
            close_brace = _matching_brace(text, open_brace)
            block = text[open_brace + 1 : close_brace]
            result["ku"] = set(ADMIN_KU_DIRECT_KEY_RE.findall(block))

    return result


def line_count(path: Path) -> int:
    try:
        return len(read(path).splitlines())
    except UnicodeDecodeError:
        return 0


def visible_copy_candidates_ast() -> tuple[list[tuple[str, int, str, str]], str | None]:
    try:
        completed = subprocess.run(
            ["node", str(VISIBLE_COPY_AUDIT), "--json"],
            cwd=ROOT,
            check=True,
            capture_output=True,
            text=True,
        )
        payload = json.loads(completed.stdout)
    except (OSError, subprocess.CalledProcessError, json.JSONDecodeError) as error:
        detail = getattr(error, "stderr", "") or str(error)
        return [], detail.strip() or "visible-copy AST audit failed"

    findings: list[tuple[str, int, str, str]] = []
    for entry in payload.get("files", []):
        file_name = str(entry.get("file", "")).strip()
        for finding in entry.get("findings", []):
            findings.append(
                (
                    file_name,
                    int(finding.get("line", 0)),
                    str(finding.get("kind", "copy")),
                    str(finding.get("value", ""))[:180],
                )
            )
    return findings, None


def report_parity(
    label: str,
    keys_by_lang: dict[str, set[str]],
    errors: list[str],
) -> None:
    print(label)
    expected_languages = ("en", "ar", "ku")
    if any(lang not in keys_by_lang for lang in expected_languages):
        missing_languages = [lang for lang in expected_languages if lang not in keys_by_lang]
        print(f"missing language blocks: {', '.join(missing_languages)}")
        errors.append(f"{label.lower()} missing language blocks")
        return

    union = set().union(*(keys_by_lang[lang] for lang in expected_languages))
    for lang in expected_languages:
        keys = keys_by_lang[lang]
        missing = sorted(union - keys)
        extra_vs_en = sorted(keys - keys_by_lang["en"])
        print(
            f"{lang}={len(keys)} missing={len(missing)} extra_vs_en={len(extra_vs_en)}"
        )
        if missing:
            print(f"  missing sample: {', '.join(missing[:30])}")
            errors.append(f"{label.lower()} {lang} missing {len(missing)} keys")
        if lang != "en" and extra_vs_en:
            print(f"  extra sample: {', '.join(extra_vs_en[:30])}")
            errors.append(f"{label.lower()} {lang} extra {len(extra_vs_en)} keys")


def main() -> int:
    errors: list[str] = []

    general_keys = {
        lang: extract_general_keys(TRANSLATIONS / f"{lang}.ts")
        for lang in ("en", "ar", "ku")
    }
    report_parity("=== GENERAL I18N PARITY ===", general_keys, errors)

    print()
    admin_keys = extract_admin_language_keys(read(ADMIN_TRANSLATIONS))
    report_parity("=== ADMIN I18N PARITY ===", admin_keys, errors)

    print("\n=== LOCALIZED COPY OUTSIDE TRANSLATION AUTHORITY ===")
    localized_files: list[tuple[str, int]] = []
    localized_object_count = 0
    for path in sorted(FRONTEND.rglob("*.ts*")):
        if is_translation_authority(path):
            continue
        source_text = read(path)
        declarations = find_hardcoded_localized_object_declarations(source_text)
        if declarations:
            localized_files.append((rel(path), len(declarations)))
            localized_object_count += len(declarations)
    if localized_files:
        for file_name, count in localized_files:
            print(f"{count:02d} {file_name}")
        print(f"localized_objects={localized_object_count}")
        errors.append(f"localized copy files={len(localized_files)}")
    else:
        print("none")
        print("localized_objects=0")

    print("\n=== VISIBLE HARDCODED COPY CANDIDATES ===")
    visible, visible_error = visible_copy_candidates_ast()
    if visible_error:
        print(f"AST_AUDIT_ERROR {visible_error}")
        errors.append("visible hardcoded copy AST audit failed")
    else:
        print(f"count={len(visible)}")
        for file_name, line, kind, value in visible[:160]:
            print(f"{file_name}:{line}: {kind}: {value}")
        if visible:
            errors.append(f"visible hardcoded copy candidates={len(visible)}")

    print("\n=== LONG EXECUTABLE SOURCE FILES ===")
    long_files: list[tuple[int, str]] = []
    for base in (FRONTEND, API):
        for path in base.rglob("*.ts*"):
            if base == FRONTEND and is_translation_authority(path):
                continue
            count = line_count(path)
            if count >= 800:
                long_files.append((count, rel(path)))
    long_files.sort(reverse=True)
    for count, file_name in long_files:
        marker = "CRITICAL" if count >= 1800 else "LONG"
        print(f"{marker} {count:5d} {file_name}")
    critical = [(count, file_name) for count, file_name in long_files if count >= 1800]
    if critical:
        errors.append(f"critical executable files={len(critical)}")

    print("\n=== KNOWN STRUCTURE TARGETS ===")
    for target in (
        FRONTEND / "pages" / "AdminPage.tsx",
        API / "routes" / "auth.ts",
        API / "routes" / "index.ts",
        FRONTEND / "pages" / "dashboard" / "BotTrainingPage.tsx",
        FRONTEND / "pages" / "dashboard" / "ProductsPage.tsx",
        FRONTEND / "pages" / "dashboard" / "SupportPage.tsx",
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
