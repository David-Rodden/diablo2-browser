#!/usr/bin/env bash
set -euo pipefail

url="${UPSTREAM_URL:-https://github.com/troytt/diablo2-web.git}"
rules="$(git rev-parse --show-toplevel)/.upstream-filter"
merge=false
[ "${1:-}" = "--merge" ] && merge=true

paths() { [ -f "$rules" ] && awk -v kind="$1" '$1 == kind { print $2 }' "$rules" || true; }

filtered_tree() {
  local snapshot="$1" tip="$2" index
  index="$(mktemp -u)"
  export GIT_INDEX_FILE="$index"
  git read-tree "$snapshot"
  paths drop | xargs -r git rm -r -q -f --cached --ignore-unmatch --
  paths keep | while read -r path; do
    git rm -r -q -f --cached --ignore-unmatch -- "$path"
    git ls-tree -r "$tip" -- "$path" | git update-index --index-info
  done
  git write-tree
  unset GIT_INDEX_FILE
  rm -f "$index"
}

if git fetch -q origin upstream 2>/dev/null; then
  git rev-parse -q --verify upstream >/dev/null || git branch upstream FETCH_HEAD
  git merge-base --is-ancestor upstream FETCH_HEAD && git branch -f upstream FETCH_HEAD
fi
git fetch -q "$url" main
snapshot="$(git rev-parse FETCH_HEAD)"
tip="$(git rev-parse upstream)"
tree="$(filtered_tree "$snapshot" "$tip")"

if [ "$tree" = "$(git rev-parse "$tip^{tree}")" ]; then
  echo "already on the latest snapshot: $(git log -1 --format=%s "$snapshot")"
else
  meta() { git log -1 --format="$1" "$snapshot"; }
  previous="$(git log -1 --format='%(trailers:key=Snapshot,valueonly)' "$tip")"
  stacked="$(
    export GIT_AUTHOR_NAME="$(meta %an)" GIT_AUTHOR_EMAIL="$(meta %ae)" GIT_AUTHOR_DATE="$(meta %aI)"
    export GIT_COMMITTER_NAME="$(meta %cn)" GIT_COMMITTER_EMAIL="$(meta %ce)" GIT_COMMITTER_DATE="$(meta %cI)"
    meta %B | git interpret-trailers --trailer "Snapshot: $snapshot" | git commit-tree "$tree" -p "$tip"
  )"
  git branch -f upstream "$stacked"
  [ "$previous" = "$snapshot" ] && echo "reapplied .upstream-filter to $(meta %s)" || echo "new snapshot: $(git log -1 --format='%h %s' "$stacked")"
fi

if $merge; then
  paths generated | xargs -r git checkout -q HEAD --
  before="$(git rev-parse HEAD)"
  if ! git merge -q --no-edit -m "Merge $(git log -1 --format=%s upstream | sed 's/^chore: publish d2web source //')" upstream; then
    echo "the merge has conflicts: fix them, then run git commit" >&2
    exit 1
  fi
  [ "$(git rev-parse HEAD)" != "$before" ] && echo "merged. push with: git push origin main upstream"
fi
exit 0
