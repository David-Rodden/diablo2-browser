#!/usr/bin/env bash
set -euo pipefail

url="${UPSTREAM_URL:-https://github.com/troytt/diablo2-web.git}"
root="$(git rev-parse --show-toplevel)"
rules="$root/.upstream-filter"
dictionary="$root/tools/english.tsv"
merge=false
[ "${1:-}" = "--merge" ] && merge=true

paths() { if [ -f "$rules" ]; then awk -v kind="$1" '$1 == kind { print $2 }' "$rules"; fi; }

english() {
  perl -CSD -e 'open my $d, "<", shift or die; my @pairs = sort { length $b->[0] <=> length $a->[0] } map { chomp; [split /\t/, $_, 2] } grep { /\t/ } <$d>;
    local $/; my $text = <STDIN>; $text =~ s/\Q$_->[0]\E/$_->[1]/g for @pairs; print $text' "$dictionary"
}

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
  paths english | xargs -r git ls-files -s -- | while read -r mode blob _ file; do
    printf '%s %s\t%s\n' "$mode" "$(git cat-file blob "$blob" | english | git hash-object -w --stdin)" "$file"
  done | git update-index --index-info
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
  stacked="$(meta %B | git interpret-trailers --trailer "Snapshot: $snapshot" | env \
    GIT_AUTHOR_NAME="$(meta %an)" GIT_AUTHOR_EMAIL="$(meta %ae)" GIT_AUTHOR_DATE="$(meta %aI)" \
    GIT_COMMITTER_NAME="$(meta %cn)" GIT_COMMITTER_EMAIL="$(meta %ce)" GIT_COMMITTER_DATE="$(meta %cI)" \
    git commit-tree "$tree" -p "$tip")"
  git branch -f upstream "$stacked"
  [ "$previous" = "$snapshot" ] && echo "reapplied .upstream-filter to $(meta %s)" || echo "new snapshot: $(git log -1 --format='%h %s' "$stacked")"
fi

if $merge; then
  paths generated | xargs -r git checkout -q HEAD --
  before="$(git rev-parse HEAD)"
  message="Merge $(git log -1 --format=%s upstream | sed 's/^chore: publish d2web source //')"
  if ! git merge -q --no-edit -m "$message" upstream; then
    unresolved="$(git diff --name-only --diff-filter=U)"
    if [ -n "$unresolved" ] || git diff --cached --name-only | xargs -r grep -l -E '^(<{7}|>{7})( |$)' -- 2>/dev/null | grep -q .; then
      printf 'the merge has conflicts: fix them, then run git commit\n%s\n' "$unresolved" >&2
      exit 1
    fi
    git commit -q --no-edit -m "$message"
    echo "reused earlier conflict resolutions"
  fi
  [ "$(git rev-parse HEAD)" != "$before" ] && echo "merged. push with: git push origin main upstream"
  leftover="$(paths english | xargs -r git ls-files -- | xargs -r perl -CSD -ne 'print "  $ARGV:$.: $_" if /\p{Han}/; close ARGV if eof')"
  [ -z "$leftover" ] || printf 'Chinese text not in tools/english.tsv yet:\n%s\n' "$leftover"
fi
exit 0
