#!/usr/bin/env bash
set -euo pipefail

CODEX_PYTHON="/Users/jamesy/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/bin/python3"

if [ -x "$CODEX_PYTHON" ]; then
  exec "$CODEX_PYTHON" "$@"
fi

exec python3 "$@"

