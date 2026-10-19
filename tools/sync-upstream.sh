#!/usr/bin/env bash
set -euo pipefail

url="${UPSTREAM_URL:-https://github.com/troytt/diablo2-web.git}"
git fetch -q "$url" main
snapshot="$(git rev-parse FETCH_HEAD)"
tip="$(git rev-parse upstream)"

if [ "$(git rev-parse "$snapshot^{tree}")" = "$(git rev-parse "$tip^{tree}")" ]; then
  echo "upstream already matches $(git log -1 --format=%s "$snapshot")"
  exit 0
fi

meta() { git log -1 --format="$1" "$snapshot"; }
export GIT_AUTHOR_NAME="$(meta %an)" GIT_AUTHOR_EMAIL="$(meta %ae)" GIT_AUTHOR_DATE="$(meta %aI)"
export GIT_COMMITTER_NAME="$(meta %cn)" GIT_COMMITTER_EMAIL="$(meta %ce)" GIT_COMMITTER_DATE="$(meta %cI)"
stacked="$(meta %B | git commit-tree "$snapshot^{tree}" -p "$tip")"
git branch -f upstream "$stacked"
echo "upstream -> $(git log -1 --format='%h %s' "$stacked")"
