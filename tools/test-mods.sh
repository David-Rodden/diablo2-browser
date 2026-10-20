#!/usr/bin/env bash
set -euo pipefail

git rev-parse -q --verify upstream >/dev/null || git fetch -q origin upstream:upstream
mapfile -t ours < <(git diff --name-only --diff-filter=A upstream HEAD -- 'tests/*.test.ts')
npx vitest run "${ours[@]}" tests/plugins tests/arch tests/tools "$@"
