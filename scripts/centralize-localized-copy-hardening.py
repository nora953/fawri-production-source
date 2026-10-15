#!/usr/bin/env python3
from __future__ import annotations

import re
import sys
from pathlib import Path

from lib.translation_structure_policy import find_hardcoded_localized_object_declarations
from lib.translation_structure_scan import LocalizedObjectDeclaration

ROOT = Path(__file__).resolve().parents[1]
FRONTEND = ROOT / "artifacts" / "fawri" / "src"
TRANSLATIONS = FRONTEND / "lib" / "translations"
FEATURE_TRANSLATIONS = TRANSLATIONS / "features"
ADMIN_TRANSLATIONS = FRONTEND / "lib" / "admin-translations.ts"

INDEX_SUFFIX_RE = re.compile(r"^\[\s*([A-Za-z_$][\w$]*)\s*\]$")
CONST_INDEX_SUFFIX_RE = re.compile(r"^as\s+const\s*\[\s*([A-Za-z_$][\w$]*)\s*\]$")


def rel(path: Path) -> str:
    return str(path.relative_to(ROOT)).replace("\\", "/")


def read(path: Path) -> str:
    return path.read_text(encoding="utf-8")


def is_translation_authority(path: Path) -> bool:
    return path == ADMIN_TRANSLATIONS or TRANSLATIONS in path.parents


def snake_identifier(value: str) -> str:
    value = re.sub(r"([a-z0-9])([A-Z])", r"\1_\2", value)
    value = re.sub(r"[^A-Za-z0-9]+", "_", value).strip("_")
    return value.upper()


def export_name(path: Path, declaration: LocalizedObjectDeclaration) -> str:
    return f"{snake_identifier(path.stem)}_{snake_identifier(declaration.name)}"


def translation_module_path(source: Path) -> Path:
    source_relative = source.relative_to(FRONTEND)
    return (FEATURE_TRANSLATIONS / source_relative).with_suffix(".ts")


def import_path_for(module_path: Path) -> str:
    relative = module_path.relative_to(FRONTEND).with_suffix("")
    return "@/" + str(relative).replace("\\", "/")


def classify_suffix(suffix: str) -> tuple[str, str]:
    if not suffix:
        return "", ""
    if suffix == "as const":
        return " as const", ""
    match = INDEX_SUFFIX_RE.fullmatch(suffix)
    if match:
        return "", f"[{match.group(1)}]"
    match = CONST_INDEX_SUFFIX_RE.fullmatch(suffix)
    if match:
        return " as const", f"[{match.group(1)}]"
    raise ValueError(f"unsupported localized object suffix: {suffix!r}")


def merge_import(source_text: str, module_import: str, names: list[str]) -> str:
    pattern = re.compile(
        r"import\s*\{(?P<body>.*?)\}\s*from\s*(['\"])"
        + re.escape(module_import)
        + r"\2\s*;?",
        re.DOTALL,
    )
    match = pattern.search(source_text)
    if match is None:
        return f"import {{ {', '.join(names)} }} from '{module_import}';\n" + source_text

    existing = [part.strip() for part in match.group("body").replace("\n", " ").split(",") if part.strip()]
    combined = existing[:]
    for name in names:
        if name not in combined:
            combined.append(name)
    replacement = f"import {{ {', '.join(combined)} }} from '{module_import}';"
    return source_text[: match.start()] + replacement + source_text[match.end() :]


def append_exports(module_path: Path, source: Path, exports: list[str], names: list[str]) -> None:
    if module_path.exists():
        current = read(module_path).rstrip() + "\n"
        for name in names:
            if re.search(rf"\bexport\s+const\s+{re.escape(name)}\b", current):
                raise RuntimeError(f"translation export already exists unexpectedly: {rel(module_path)}::{name}")
        module_path.write_text(current + "\n" + "\n\n".join(exports) + "\n", encoding="utf-8")
        return

    module_path.parent.mkdir(parents=True, exist_ok=True)
    module_path.write_text(
        "// Centralized localized copy extracted from "
        + str(source.relative_to(FRONTEND)).replace("\\", "/")
        + ".\n"
        + "// Keep runtime behavior in the source component; keep language copy here.\n\n"
        + "\n\n".join(exports)
        + "\n",
        encoding="utf-8",
    )


def centralize_file(source: Path, declarations: list[LocalizedObjectDeclaration]) -> tuple[int, Path]:
    source_text = read(source)
    module_path = translation_module_path(source)
    module_import = import_path_for(module_path)

    module_exports: list[str] = []
    replacements: list[tuple[int, int, str]] = []
    imported_names: list[str] = []

    for declaration in declarations:
        assertion, index_access = classify_suffix(declaration.suffix)
        name = export_name(source, declaration)
        imported_names.append(name)
        object_source = source_text[declaration.object_start : declaration.object_end + 1]
        module_exports.append(f"export const {name} = {object_source}{assertion};")
        replacement = (
            f"{declaration.kind} {declaration.name}{declaration.type_annotation} = "
            f"{name}{index_access};"
        )
        replacements.append((declaration.declaration_start, declaration.semicolon + 1, replacement))

    updated = source_text
    for start, end, replacement in reversed(replacements):
        updated = updated[:start] + replacement + updated[end:]
    updated = merge_import(updated, module_import, imported_names)

    remaining = find_hardcoded_localized_object_declarations(updated)
    if remaining:
        names = ", ".join(item.name for item in remaining)
        raise RuntimeError(f"hardcoded localized copy remained after rewrite in {rel(source)}: {names}")

    append_exports(module_path, source, module_exports, imported_names)
    source.write_text(updated, encoding="utf-8")
    return len(declarations), module_path


def main() -> int:
    found: dict[Path, list[LocalizedObjectDeclaration]] = {}
    blockers: list[str] = []

    for path in sorted(FRONTEND.rglob("*.ts*")):
        if is_translation_authority(path):
            continue
        declarations = find_hardcoded_localized_object_declarations(read(path))
        if not declarations:
            continue
        for declaration in declarations:
            try:
                classify_suffix(declaration.suffix)
            except ValueError as error:
                blockers.append(f"{rel(path)}::{declaration.name}: {error}")
        found[path] = declarations

    total = sum(len(items) for items in found.values())
    print(f"HARDENING_LOCALIZED_COPY_CANDIDATES files={len(found)} objects={total}")
    if blockers:
        for blocker in blockers:
            print(f"BLOCKER {blocker}")
        return 2

    if not found:
        print("HARDENING_LOCALIZED_COPY_ALREADY_CENTRALIZED")
        return 0

    moved = 0
    for source, declarations in found.items():
        count, module_path = centralize_file(source, declarations)
        moved += count
        print(f"CENTRALIZED {count:02d} {rel(source)} -> {rel(module_path)}")

    remaining: list[str] = []
    for path in sorted(FRONTEND.rglob("*.ts*")):
        if is_translation_authority(path):
            continue
        declarations = find_hardcoded_localized_object_declarations(read(path))
        if declarations:
            remaining.append(f"{rel(path)}::{','.join(item.name for item in declarations)}")

    if remaining:
        print("HARDENING_LOCALIZED_COPY_INCOMPLETE")
        for item in remaining:
            print(item)
        return 3

    print(f"HARDENING_LOCALIZED_COPY_CENTRALIZED files={len(found)} objects={moved}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
