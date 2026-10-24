#!/usr/bin/env bash
set -euo pipefail

git rev-parse -q --verify upstream >/dev/null || git fetch -q origin upstream:upstream
mapfile -t ours < <(git log --no-merges --no-renames --diff-filter=A --name-only --format= upstream..HEAD -- 'tests/*.test.ts' | sort -u | while read -r f; do [ -f "$f" ] && echo "$f"; done)
npx vitest run "${ours[@]}" tests/plugins tests/arch tests/tools "$@"
