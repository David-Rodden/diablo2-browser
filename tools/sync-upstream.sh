#!/usr/bin/env bash
set -euo pipefail

url="${UPSTREAM_URL:-https://github.com/troytt/diablo2-web.git}"
merge=false
[ "${1:-}" = "--merge" ] && merge=true

git fetch -q origin upstream
git rev-parse -q --verify upstream >/dev/null || git branch upstream FETCH_HEAD
git merge-base --is-ancestor upstream FETCH_HEAD && git branch -f upstream FETCH_HEAD
git fetch -q "$url" main
snapshot="$(git rev-parse FETCH_HEAD)"
tip="$(git rev-parse upstream)"

if [ "$(git rev-parse "$snapshot^{tree}")" = "$(git rev-parse "$tip^{tree}")" ]; then
  echo "already on the latest snapshot: $(git log -1 --format=%s "$snapshot")"
else
  meta() { git log -1 --format="$1" "$snapshot"; }
  export GIT_AUTHOR_NAME="$(meta %an)" GIT_AUTHOR_EMAIL="$(meta %ae)" GIT_AUTHOR_DATE="$(meta %aI)"
  export GIT_COMMITTER_NAME="$(meta %cn)" GIT_COMMITTER_EMAIL="$(meta %ce)" GIT_COMMITTER_DATE="$(meta %cI)"
  stacked="$(meta %B | git commit-tree "$snapshot^{tree}" -p "$tip")"
  git branch -f upstream "$stacked"
  echo "new snapshot: $(git log -1 --format='%h %s' "$stacked")"
fi

if $merge; then
  git config merge.ours.driver true
  before="$(git rev-parse HEAD)"
  git merge -q --no-edit -m "Merge $(git log -1 --format=%s upstream | sed 's/^chore: publish d2web source //')" upstream
  [ "$(git rev-parse HEAD)" != "$before" ] && echo "merged. push with: git push origin main upstream"
fi
exit 0
