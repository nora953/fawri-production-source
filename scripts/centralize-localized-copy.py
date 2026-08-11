#!/usr/bin/env python3
from __future__ import annotations

import re
import sys
from collections import defaultdict
from pathlib import Path

from lib.translation_structure_scan import (
    LocalizedObjectDeclaration,
    find_localized_object_declarations,
)

ROOT = Path(__file__).resolve().parents[1]
FRONTEND = ROOT / "artifacts" / "fawri" / "src"
TRANSLATIONS = FRONTEND / "lib" / "translations"
FEATURE_TRANSLATIONS = TRANSLATIONS / "features"
ADMIN_TRANSLATIONS = FRONTEND / "lib" / "admin-translations.ts"

INDEX_SUFFIX_RE = re.compile(r"^\[\s*([A-Za-z_$][\w$]*)\s*\]$")
CONST_INDEX_SUFFIX_RE = re.compile(
    r"^as\s+const\s*\[\s*([A-Za-z_$][\w$]*)\s*\]$"
)


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


def object_is_safe_to_move(object_source: str) -> bool:
    # Centralized copy must stay declarative. References to runtime expressions should
    # remain beside their owning code and be handled manually rather than guessed.
    forbidden = ("${", "=>", "function ", "...", "new ")
    return not any(token in object_source for token in forbidden)


def analyze() -> tuple[
    dict[Path, list[LocalizedObjectDeclaration]],
    list[str],
]:
    found: dict[Path, list[LocalizedObjectDeclaration]] = {}
    blockers: list[str] = []

    for path in sorted(FRONTEND.rglob("*.ts*")):
        if is_translation_authority(path):
            continue
        declarations = find_localized_object_declarations(read(path))
        if not declarations:
            continue

        for declaration in declarations:
            try:
                classify_suffix(declaration.suffix)
            except ValueError as error:
                blockers.append(f"{rel(path)}::{declaration.name}: {error}")
                continue

            object_source = read(path)[
                declaration.object_start : declaration.object_end + 1
            ]
            if not object_is_safe_to_move(object_source):
                blockers.append(
                    f"{rel(path)}::{declaration.name}: runtime expression inside localized copy"
                )

        found[path] = declarations

    return found, blockers


def centralize_file(
    source: Path,
    declarations: list[LocalizedObjectDeclaration],
) -> tuple[int, Path]:
    source_text = read(source)
    module_path = translation_module_path(source)
    if module_path.exists():
        raise RuntimeError(
            f"refusing to overwrite existing translation module: {rel(module_path)}"
        )

    module_exports: list[str] = []
    replacements: list[tuple[int, int, str]] = []
    imported_names: list[str] = []

    for declaration in declarations:
        assertion, index_access = classify_suffix(declaration.suffix)
        name = export_name(source, declaration)
        imported_names.append(name)
        object_source = source_text[
            declaration.object_start : declaration.object_end + 1
        ]
        module_exports.append(f"export const {name} = {object_source}{assertion};")

        replacement = (
            f"{declaration.kind} {declaration.name}{declaration.type_annotation} = "
            f"{name}{index_access};"
        )
        replacements.append(
            (declaration.declaration_start, declaration.semicolon + 1, replacement)
        )

    updated = source_text
    for start, end, replacement in reversed(replacements):
        updated = updated[:start] + replacement + updated[end:]

    import_line = (
        "import { "
        + ", ".join(imported_names)
        + f" }} from '{import_path_for(module_path)}';\n"
    )
    updated = import_line + updated

    remaining = find_localized_object_declarations(updated)
    if remaining:
        names = ", ".join(item.name for item in remaining)
        raise RuntimeError(
            f"localized copy remained after rewrite in {rel(source)}: {names}"
        )

    module_path.parent.mkdir(parents=True, exist_ok=True)
    module_path.write_text(
        "// Centralized localized copy extracted from "
        + str(source.relative_to(FRONTEND)).replace("\\", "/")
        + ".\n"
        + "// Keep runtime behavior in the source component; keep language copy here.\n\n"
        + "\n\n".join(module_exports)
        + "\n",
        encoding="utf-8",
    )
    source.write_text(updated, encoding="utf-8")
    return len(declarations), module_path


def main() -> int:
    found, blockers = analyze()
    total = sum(len(items) for items in found.values())
    print(f"LOCALIZED_COPY_CANDIDATES files={len(found)} objects={total}")

    if blockers:
        print("CENTRALIZATION_BLOCKERS")
        for blocker in blockers:
            print(f"BLOCKER {blocker}")
        return 2

    if not found:
        print("LOCALIZED_COPY_ALREADY_CENTRALIZED")
        return 0

    moved_objects = 0
    created_modules: list[Path] = []
    for source, declarations in found.items():
        moved, module_path = centralize_file(source, declarations)
        moved_objects += moved
        created_modules.append(module_path)
        print(
            f"CENTRALIZED {moved:02d} {rel(source)} -> {rel(module_path)}"
        )

    remaining_files: list[str] = []
    remaining_objects = 0
    for path in sorted(FRONTEND.rglob("*.ts*")):
        if is_translation_authority(path):
            continue
        declarations = find_localized_object_declarations(read(path))
        if declarations:
            remaining_files.append(rel(path))
            remaining_objects += len(declarations)

    if remaining_files:
        print("CENTRALIZATION_INCOMPLETE")
        for path in remaining_files:
            print(path)
        print(f"remaining_objects={remaining_objects}")
        return 3

    print(
        f"LOCALIZED_COPY_CENTRALIZED files={len(found)} objects={moved_objects} modules={len(created_modules)}"
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
