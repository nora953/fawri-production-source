#!/usr/bin/env python3
from __future__ import annotations

import re

from lib.translation_structure_scan import (
    LocalizedObjectDeclaration,
    find_localized_object_declarations,
)

RUNTIME_MEMBER_RE = re.compile(
    r"\b[A-Za-z_$][\w$]*\s*\.\s*[A-Za-z_$][\w$]*"
)
RUNTIME_VALUE_RE = re.compile(
    r":\s*([A-Za-z_$][\w$]*)\s*(?=[,}\]])"
)
RUNTIME_TOKENS = {"true", "false", "null", "undefined"}


def _code_without_strings_or_comments(text: str) -> str:
    """Return source-shaped code with literals/comments blanked out.

    This is intentionally lexical rather than semantic. It prevents translated
    strings such as "Loading..." from being mistaken for object spread syntax.
    """
    output: list[str] = []
    index = 0
    mode = "code"
    quote = ""

    while index < len(text):
        char = text[index]
        nxt = text[index + 1] if index + 1 < len(text) else ""

        if mode == "code":
            if char in {"'", '"', "`"}:
                quote = char
                mode = "string"
                output.append(" ")
                index += 1
                continue
            if char == "/" and nxt == "/":
                mode = "line_comment"
                output.extend((" ", " "))
                index += 2
                continue
            if char == "/" and nxt == "*":
                mode = "block_comment"
                output.extend((" ", " "))
                index += 2
                continue
            output.append(char)
            index += 1
            continue

        if mode == "string":
            if char == "\\":
                output.extend((" ", " "))
                index += 2
                continue
            output.append("\n" if char == "\n" else " ")
            if char == quote:
                mode = "code"
                quote = ""
            index += 1
            continue

        if mode == "line_comment":
            output.append("\n" if char == "\n" else " ")
            if char == "\n":
                mode = "code"
            index += 1
            continue

        output.append(" ")
        if char == "*" and nxt == "/":
            output.append(" ")
            mode = "code"
            index += 2
        else:
            index += 1

    return "".join(output)


def localized_object_uses_runtime_authority(object_source: str) -> bool:
    """Distinguish runtime language maps from hardcoded localized copy.

    Runtime maps may stay beside their owner only when their values already come
    from central runtime authorities (for example `t.foo` or `adminText.foo`).
    Literal ar/ku/en dictionaries are always treated as copy authorities and
    must live under the translation tree.
    """
    # Template interpolation is runtime by definition. Check it on raw source;
    # normal translation placeholders in this project use braces without `$`.
    if "${" in object_source:
        return True

    code = _code_without_strings_or_comments(object_source)
    if "=>" in code or "..." in code:
        return True
    if RUNTIME_MEMBER_RE.search(code):
        return True

    for match in RUNTIME_VALUE_RE.finditer(code):
        if match.group(1) not in RUNTIME_TOKENS:
            return True

    return False


def find_hardcoded_localized_object_declarations(
    text: str,
) -> list[LocalizedObjectDeclaration]:
    """Return only independent hardcoded ar/ku/en object authorities."""
    declarations: list[LocalizedObjectDeclaration] = []
    for declaration in find_localized_object_declarations(text):
        object_source = text[declaration.object_start : declaration.object_end + 1]
        if not localized_object_uses_runtime_authority(object_source):
            declarations.append(declaration)
    return declarations
