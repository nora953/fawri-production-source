#!/usr/bin/env bash
set -euo pipefail

# This validation lane must never depend on or touch a real database.
# @workspace/db requires DATABASE_URL at module import time, so provide an
# intentionally unreachable localhost URL. Any unexpected DB query fails fast.
export DATABASE_URL="postgresql://fawri_validation:fawri_validation@127.0.0.1:1/fawri_validation"

exec bash <(git show github/parallel/frontend-translation-structure-hardening:scripts/run-auth-structure-hardening-local.sh)
