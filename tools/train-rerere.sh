#!/usr/bin/env bash
set -euo pipefail

base="${1:-origin/main}"
upstream="${2:-upstream}"
depth="${3:-40}"
git config rerere.enabled true
git config rerere.autoupdate true
start="$(git symbolic-ref -q --short HEAD || git rev-parse HEAD)"
trap 'git merge --abort 2>/dev/null || true; git checkout -q -f "$start"' EXIT

git rev-list --merges -n "$depth" "$base" | while read -r merge; do
  git merge-base --is-ancestor "$merge^2" "$upstream" || continue
  git checkout -q -f --detach "$merge^1"
  git merge -q --no-edit --no-commit "$merge^2" >/dev/null 2>&1 && { git merge --abort; continue; }
  mapfile -t conflicted < <(git diff --name-only --diff-filter=U)
  if [ "${#conflicted[@]}" -gt 0 ]; then
    git checkout -q "$merge" -- "${conflicted[@]}"
    git rerere >/dev/null
    echo "learned ${#conflicted[@]} resolution(s) from $(git log -1 --format='%h %s' "$merge")"
  fi
  git merge --abort 2>/dev/null || git reset -q --hard
done
