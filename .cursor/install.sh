#!/usr/bin/env bash
# Idempotent Cloud Agent install. Runs from the repository root during a Build.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

if command -v corepack >/dev/null 2>&1; then
  corepack enable
fi

if [[ -f frontend/package.json ]]; then
  (cd frontend && pnpm install --frozen-lockfile)
fi

PYTHON=""
for candidate in python3.13 python3; do
  if command -v "$candidate" >/dev/null 2>&1; then
    PYTHON="$candidate"
    break
  fi
done

if [[ -z "$PYTHON" ]]; then
  echo "No python3 found; skip backend venv. Install Python 3.13 on this image."
  exit 0
fi

"$PYTHON" -c "import sys; raise SystemExit(0 if sys.version_info[:2] == (3, 13) else 1)" || {
  echo "Warning: $($PYTHON -V) is not Python 3.13. Creating venv anyway."
}

if [[ ! -d backend/.venv ]]; then
  "$PYTHON" -m venv backend/.venv
fi

# shellcheck disable=SC1091
source backend/.venv/bin/activate
python -m pip install --upgrade pip
python -m pip install -r backend/requirements/dev.txt
