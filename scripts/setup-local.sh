#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
if [[ "$#" -gt 1 || ( "$#" == 1 && "$1" != --hooks ) ]]; then
  echo "Usage: ./scripts/setup-local.sh [--hooks]" >&2
  exit 2
fi
command -v gh >/dev/null
command -v python3 >/dev/null
gh auth status >/dev/null
gh extension install devx-cafe/gh-tt --pin 84b3b74a79dd4907812cb02e59b2b048ce6e4c3e --force
gh alias import .gh_alias.yml --clobber
if [[ "${1:-}" == --hooks ]]; then
  existing=$(git config --get core.hooksPath || true)
  if [[ -n "$existing" && "$existing" != .githooks ]]; then
    echo "Existing hooksPath '$existing' was preserved. Run ./scripts/check.sh quick manually." >&2
    exit 1
  fi
  git config --local core.hooksPath .githooks
fi
if [[ -f package.json ]]; then npm ci; fi
echo "Ready. Run ./scripts/check.sh quick, gh workon -i <issue>, or gh flow time --issue <issue>."
