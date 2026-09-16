#!/usr/bin/env python3
from __future__ import annotations

from dataclasses import dataclass
import re

# Keep the type annotation bounded to the declaration itself. In particular, never
# cross an earlier '=' or ';' while looking for a typed object initializer; doing
# so can incorrectly associate `const foo: Type[] = [...]` with a later `const bar = {`.
DECLARATION_RE = re.compile(
    r"\b(?P<kind>const|let)\s+(?P<name>[A-Za-z_$][\w$]*)"
    r"(?P<type>\s*:[^=;]{0,800}?)?\s*=\s*\{"
)
RUNTIME_MEMBER_RE = re.compile(
    r"\b[A-Za-z_$][\w$]*\s*\.\s*[A-Za-z_$][\w$]*"
)
RUNTIME_VALUE_RE = re.compile(
    r":\s*([A-Za-z_$][\w$]*)\s*(?=[,}\]])"
)
RUNTIME_TOKENS = {"true", "false", "null", "undefined"}


@dataclass(frozen=True)
class LocalizedObjectDeclaration:
    kind: str
    name: str
    type_annotation: str
    declaration_start: int
    object_start: int
    object_end: int
    semicolon: int
    suffix: str
    languages: frozenset[str]


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
                index += 1
                continue
            if char == "/" and nxt == "/":
                mode = "line_comment"
                index += 2
                continue
            if char == "/" and nxt == "*":
                mode = "block_comment"
                index += 2
                continue
            if char == "{":
                depth += 1
            elif char == "}":
                depth -= 1
                if depth == 0:
                    return index
            index += 1
            continue

        if mode == "string":
            if char == "\\":
                index += 2
                continue
            if char == quote:
                mode = "code"
                quote = ""
            index += 1
            continue

        if mode == "line_comment":
            if char == "\n":
                mode = "code"
            index += 1
            continue

        if char == "*" and nxt == "/":
            mode = "code"
            index += 2
        else:
            index += 1

    raise ValueError("unbalanced object literal")


def _semicolon_after(text: str, start: int, *, max_scan: int = 1200) -> int:
    index = start
    limit = min(len(text), start + max_scan)
    mode = "code"
    quote = ""
    paren_depth = 0
    bracket_depth = 0
    brace_depth = 0

    while index < limit:
        char = text[index]
        nxt = text[index + 1] if index + 1 < len(text) else ""

        if mode == "code":
            if char in {"'", '"', "`"}:
                quote = char
                mode = "string"
                index += 1
                continue
            if char == "/" and nxt == "/":
                mode = "line_comment"
                index += 2
                continue
            if char == "/" and nxt == "*":
                mode = "block_comment"
                index += 2
                continue
            if char == "(":
                paren_depth += 1
            elif char == ")":
                paren_depth -= 1
            elif char == "[":
                bracket_depth += 1
            elif char == "]":
                bracket_depth -= 1
            elif char == "{":
                brace_depth += 1
            elif char == "}":
                brace_depth -= 1
            elif char == ";" and paren_depth == bracket_depth == brace_depth == 0:
                return index
            index += 1
            continue

        if mode == "string":
            if char == "\\":
                index += 2
                continue
            if char == quote:
                mode = "code"
                quote = ""
            index += 1
            continue

        if mode == "line_comment":
            if char == "\n":
                mode = "code"
            index += 1
            continue

        if char == "*" and nxt == "/":
            mode = "code"
            index += 2
        else:
            index += 1

    raise ValueError("localized object declaration has no nearby semicolon")


def _property_keys(object_source: str) -> frozenset[str]:
    keys: set[str] = set()
    index = 0
    mode = "code"
    quote = ""

    while index < len(object_source):
        char = object_source[index]
        nxt = object_source[index + 1] if index + 1 < len(object_source) else ""

        if mode == "code":
            if char in {"'", '"', "`"}:
                quote = char
                mode = "string"
                index += 1
                continue
            if char == "/" and nxt == "/":
                mode = "line_comment"
                index += 2
                continue
            if char == "/" and nxt == "*":
                mode = "block_comment"
                index += 2
                continue
            if char.isalpha() or char in {"_", "$"}:
                end = index + 1
                while end < len(object_source) and (
                    object_source[end].isalnum() or object_source[end] in {"_", "$"}
                ):
                    end += 1
                probe = end
                while probe < len(object_source) and object_source[probe].isspace():
                    probe += 1
                if probe < len(object_source) and object_source[probe] == ":":
                    keys.add(object_source[index:end])
                index = end
                continue
            index += 1
            continue

        if mode == "string":
            if char == "\\":
                index += 2
                continue
            if char == quote:
                mode = "code"
                quote = ""
            index += 1
            continue

        if mode == "line_comment":
            if char == "\n":
                mode = "code"
            index += 1
            continue

        if char == "*" and nxt == "/":
            mode = "code"
            index += 2
        else:
            index += 1

    return frozenset(keys)


def _code_without_strings_or_comments(text: str) -> str:
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
    """Return True for language-shaped runtime maps, not hardcoded copy authorities.

    Objects such as `{ ar: t.foo, ku: t.bar, en: t.baz }` or a larger runtime
    mapping that happens to contain language keys should stay with the component:
    their text already comes from the central dictionary. Moving them would sever
    their runtime dependency and create a second authority accidentally.
    """
    if "${" in object_source or "=>" in object_source or "..." in object_source:
        return True

    code = _code_without_strings_or_comments(object_source)
    if RUNTIME_MEMBER_RE.search(code):
        return True

    for match in RUNTIME_VALUE_RE.finditer(code):
        if match.group(1) not in RUNTIME_TOKENS:
            return True

    return False


def find_localized_object_declarations(text: str) -> list[LocalizedObjectDeclaration]:
    declarations: list[LocalizedObjectDeclaration] = []
    cursor = 0

    while True:
        match = DECLARATION_RE.search(text, cursor)
        if match is None:
            break

        object_start = match.end() - 1
        try:
            object_end = _matching_brace(text, object_start)
            semicolon = _semicolon_after(text, object_end + 1)
        except ValueError:
            cursor = match.end()
            continue

        object_source = text[object_start : object_end + 1]
        keys = _property_keys(object_source)
        languages = frozenset({"ar", "en", "ku"}.intersection(keys))
        if languages == frozenset({"ar", "en", "ku"}):
            declarations.append(
                LocalizedObjectDeclaration(
                    kind=match.group("kind"),
                    name=match.group("name"),
                    type_annotation=(match.group("type") or "").rstrip(),
                    declaration_start=match.start("kind"),
                    object_start=object_start,
                    object_end=object_end,
                    semicolon=semicolon,
                    suffix=text[object_end + 1 : semicolon].strip(),
                    languages=languages,
                )
            )
            cursor = semicolon + 1
        else:
            cursor = object_end + 1

    return declarations
