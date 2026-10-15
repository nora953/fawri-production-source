#!/usr/bin/env bash
set -u

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

echo "=== TRANSLATION INVENTORY ==="
PYTHONDONTWRITEBYTECODE=1 python3 scripts/audit-translation-inventory.py

echo
echo "=== TRANSLATION STRUCTURE ==="
set +e
PYTHONDONTWRITEBYTECODE=1 python3 scripts/audit-translation-structure.py
STATUS=$?
set -e

echo "TRANSLATION_STRUCTURE_AUDIT_EXIT=$STATUS"
exit "$STATUS"
