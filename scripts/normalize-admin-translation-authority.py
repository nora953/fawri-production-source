#!/usr/bin/env python3
from __future__ import annotations

from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
TARGET = ROOT / "artifacts" / "fawri" / "src" / "lib" / "admin-translations.ts"


def matching_brace(text: str, start: int) -> int:
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
    raise RuntimeError("unbalanced object literal")


def normalize_block_indent(body: str, source_indent: str, target_indent: str) -> str:
    lines = body.splitlines()
    normalized: list[str] = []
    for line in lines:
        if not line.strip():
            normalized.append("")
            continue
        if line.startswith(source_indent):
            normalized.append(target_indent + line[len(source_indent):])
        else:
            normalized.append(target_indent + line.lstrip())
    return "\n".join(normalized).strip("\n")


def main() -> int:
    text = TARGET.read_text(encoding="utf-8")

    # Repair two swapped singular-result translations discovered by the parity audit.
    text = text.replace('mainResultCountSingular: "1 ئەنجام",', 'mainResultCountSingular: "1 result",', 1)

    admin_marker = "const adminTranslations = {"
    ku_marker = "const kuTranslations = {"
    admin_start = text.find(admin_marker)
    ku_start = text.find(ku_marker)

    if admin_start < 0:
        raise SystemExit("admin translation authority not found")

    # Already normalized: keep the operation idempotent and only retain the typo repair.
    if ku_start < 0:
        if "  ku: {" not in text[admin_start:]:
            raise SystemExit("Kurdish admin translation authority not found")
        text = text.replace('mainResultCountSingular: "1 result",', 'mainResultCountSingular: "1 ئەنجام",', 1) if False else text
        TARGET.write_text(text, encoding="utf-8")
        print("ADMIN_TRANSLATION_AUTHORITY_ALREADY_NORMALIZED")
        return 0

    admin_open = text.find("{", admin_start)
    admin_close = matching_brace(text, admin_open)
    ku_open = text.find("{", ku_start)
    ku_close = matching_brace(text, ku_open)

    ku_body = text[ku_open + 1 : ku_close]
    ku_body = ku_body.replace('mainResultCountSingular: "1 result",', 'mainResultCountSingular: "1 ئەنجام",')
    ku_nested_body = normalize_block_indent(ku_body, "  ", "    ")

    # Normalize the 19 assistant-administrator keys that were accidentally indented
    # at the parent-object level inside the Arabic/English blocks.
    admin_head = text[:admin_close]
    assistant_keys = (
        "administratorsAddButton",
        "administratorsDialogTitle",
        "administratorsDialogDescription",
        "administratorsNameLabel",
        "administratorsPhoneLabelInput",
        "administratorsPasswordLabel",
        "administratorsLanguageInputLabel",
        "administratorsCreate",
        "administratorsCancel",
        "administratorsCreating",
        "administratorsCreateSuccess",
        "administratorsNameRequired",
        "administratorsPhoneRequired",
        "administratorsPhoneInvalid",
        "administratorsPasswordRequired",
        "administratorsPasswordInvalid",
        "administratorsPhoneExists",
        "administratorsCreateError",
        "administratorsConnectionError",
    )
    for key in assistant_keys:
        admin_head = admin_head.replace(f"\n  {key}:", f"\n    {key}:")

    text = admin_head + text[admin_close:]
    # Recompute the closing brace after indentation normalization.
    admin_start = text.find(admin_marker)
    admin_open = text.find("{", admin_start)
    admin_close = matching_brace(text, admin_open)
    ku_start = text.find(ku_marker)
    ku_open = text.find("{", ku_start)
    ku_close = matching_brace(text, ku_open)
    ku_semicolon = text.find(";", ku_close)
    if ku_semicolon < 0:
        raise SystemExit("Kurdish translation object terminator not found")

    insertion = "\n  ku: {\n" + ku_nested_body + "\n  },\n"
    text = text[:admin_close] + insertion + text[admin_close:]

    # Locate and remove the now-duplicated standalone Kurdish object after insertion.
    ku_start = text.find(ku_marker)
    ku_open = text.find("{", ku_start)
    ku_close = matching_brace(text, ku_open)
    ku_semicolon = text.find(";", ku_close)
    text = text[:ku_start] + text[ku_semicolon + 1 :]

    old_getter = '''export function getAdminText(language: string) {
  const lang = resolveAdminLanguage(language);
  if (lang === "ku") return kuTranslations;
  return adminTranslations[lang];
}'''
    new_getter = '''export function getAdminText(language: string) {
  const lang = resolveAdminLanguage(language);
  return adminTranslations[lang];
}'''
    if old_getter not in text:
        raise SystemExit("admin translation getter shape changed unexpectedly")
    text = text.replace(old_getter, new_getter, 1)

    if "const kuTranslations" in text:
        raise SystemExit("standalone Kurdish admin translation authority remained")
    if "  ku: {" not in text:
        raise SystemExit("nested Kurdish admin translation authority was not created")

    TARGET.write_text(text, encoding="utf-8")
    print("ADMIN_TRANSLATION_AUTHORITY_NORMALIZED")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
