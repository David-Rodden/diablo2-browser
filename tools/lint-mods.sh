#!/usr/bin/env bash
set -euo pipefail

cd "$(git rev-parse --show-toplevel)"
git rev-parse -q --verify upstream >/dev/null || git fetch -q origin upstream:upstream
[ -d tools/lint/node_modules ] || npm install --prefix tools/lint --no-package-lock --no-audit --no-fund --silent
mapfile -t ours < <(git diff --name-only --diff-filter=A upstream -- '*.ts' ':!*.gen.ts')
tools/lint/node_modules/.bin/eslint --config tools/lint/eslint.config.js "${ours[@]}" "$@"
