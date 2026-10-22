#!/usr/bin/env bash
set -euo pipefail

date="$(git log -1 --format=%s upstream | grep -oE '[0-9]{4}-[0-9]{2}-[0-9]{2}' | tail -1)"
tag="snapshot-$date"
for n in $(seq 2 9); do
  git rev-parse -q --verify "refs/tags/$tag" > /dev/null || gh release view "$tag" > /dev/null 2>&1 || break
  tag="snapshot-$date.$n"
done
gh release create "$tag" --target "$(git rev-parse HEAD)" --title "Snapshot $date" --notes "Brings in troytt's snapshot of $date." --generate-notes
