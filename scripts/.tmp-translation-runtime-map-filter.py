#!/usr/bin/env python3
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def patch(path: str, old: str, new: str) -> None:
    target = ROOT / path
    text = target.read_text(encoding='utf-8')
    if new in text:
        return
    if old not in text:
        raise SystemExit(f'patch marker not found: {path}')
    target.write_text(text.replace(old, new), encoding='utf-8')


patch(
    'scripts/centralize-localized-copy.py',
    "from lib.translation_structure_scan import (\n    LocalizedObjectDeclaration,\n    find_localized_object_declarations,\n)\n",
    "from lib.translation_structure_scan import (\n    LocalizedObjectDeclaration,\n    find_localized_object_declarations,\n    localized_object_uses_runtime_authority,\n)\n",
)

patch(
    'scripts/centralize-localized-copy.py',
    "        declarations = find_localized_object_declarations(read(path))\n        if not declarations:\n            continue\n",
    "        source_text = read(path)\n        declarations = [\n            declaration\n            for declaration in find_localized_object_declarations(source_text)\n            if not localized_object_uses_runtime_authority(\n                source_text[declaration.object_start : declaration.object_end + 1]\n            )\n        ]\n        if not declarations:\n            continue\n",
)

patch(
    'scripts/centralize-localized-copy.py',
    "    remaining = find_localized_object_declarations(updated)\n    if remaining:\n        names = \", \".join(item.name for item in remaining)\n        raise RuntimeError(\n            f\"localized copy remained after rewrite in {rel(source)}: {names}\"\n        )\n",
    "    remaining = [\n        declaration\n        for declaration in find_localized_object_declarations(updated)\n        if not localized_object_uses_runtime_authority(\n            updated[declaration.object_start : declaration.object_end + 1]\n        )\n    ]\n    if remaining:\n        names = \", \".join(item.name for item in remaining)\n        raise RuntimeError(\n            f\"localized copy remained after rewrite in {rel(source)}: {names}\"\n        )\n",
)

patch(
    'scripts/centralize-localized-copy.py',
    "        declarations = find_localized_object_declarations(read(path))\n        if declarations:\n            remaining_files.append(rel(path))\n            remaining_objects += len(declarations)\n",
    "        source_text = read(path)\n        declarations = [\n            declaration\n            for declaration in find_localized_object_declarations(source_text)\n            if not localized_object_uses_runtime_authority(\n                source_text[declaration.object_start : declaration.object_end + 1]\n            )\n        ]\n        if declarations:\n            remaining_files.append(rel(path))\n            remaining_objects += len(declarations)\n",
)

for audit in ('scripts/audit-translation-inventory.py', 'scripts/audit-translation-structure.py'):
    patch(
        audit,
        'from lib.translation_structure_scan import find_localized_object_declarations\n',
        'from lib.translation_structure_scan import (\n    find_localized_object_declarations,\n    localized_object_uses_runtime_authority,\n)\n',
    )

patch(
    'scripts/audit-translation-inventory.py',
    "        declarations = find_localized_object_declarations(read(path))\n        if declarations:\n            localized.append((len(declarations), rel(path)))\n            total_localized_objects += len(declarations)\n",
    "        source_text = read(path)\n        declarations = [\n            declaration\n            for declaration in find_localized_object_declarations(source_text)\n            if not localized_object_uses_runtime_authority(\n                source_text[declaration.object_start : declaration.object_end + 1]\n            )\n        ]\n        if declarations:\n            localized.append((len(declarations), rel(path)))\n            total_localized_objects += len(declarations)\n",
)

patch(
    'scripts/audit-translation-structure.py',
    "        declarations = find_localized_object_declarations(read(path))\n        if declarations:\n            localized_files.append((rel(path), len(declarations)))\n            localized_object_count += len(declarations)\n",
    "        source_text = read(path)\n        declarations = [\n            declaration\n            for declaration in find_localized_object_declarations(source_text)\n            if not localized_object_uses_runtime_authority(\n                source_text[declaration.object_start : declaration.object_end + 1]\n            )\n        ]\n        if declarations:\n            localized_files.append((rel(path), len(declarations)))\n            localized_object_count += len(declarations)\n",
)

print('TRANSLATION_RUNTIME_MAP_FILTER_APPLIED')
