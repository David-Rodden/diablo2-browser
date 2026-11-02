#!/usr/bin/env bash
# Client display-value oracle (P5.4): load each level-40 save on original 1.13c
# in town, let it settle, and dump what the original D2Client displays
# (character sheet, per-skill attack/damage block, skill tree tooltips) with
# the clientui.dll hook (tools/oracle/hook/clientui.dll.c,
# kb/ui/oracle-client-display-113c.md).
#
# Usage: tools/oracle/run-client-ui.sh <out_dir> [class...]
#   class: barbarian paladin amazon sorceress necromancer (default: all five)
#   ORACLE_PREFIX  WINEPREFIX for this runner (give it its own copy, see run-oracle.sh)
# Output: <out_dir>/<class>/ui.ndjson (+ log.txt, inject.log, menu.log)
set -euo pipefail
HERE=$(cd "$(dirname "$0")" && pwd)
REPO=$(cd "$HERE/../.." && pwd)
OUT=$(realpath -m "${1:?out dir}")
shift
CLASSES=("$@")
if [ ${#CLASSES[@]} -eq 0 ]; then
  CLASSES=(barbarian paladin amazon sorceress necromancer)
fi

save_for() {
  case "$1" in
    barbarian) echo barbarian-l40-warcries ;;
    paladin) echo paladin-l40-auras ;;
    amazon) echo amazon-l40-passives ;;
    sorceress) echo sorceress-l40-elemental ;;
    necromancer) echo necromancer-l40-curses-summons ;;
    *) echo "unknown class $1" >&2; return 1 ;;
  esac
}

status=0
for cls in "${CLASSES[@]}"; do
  save="$REPO/tests/fixtures/oracle/saves/$(save_for "$cls").d2s"
  dir="$OUT/$cls"
  rm -rf "$dir"
  mkdir -p "$dir"
  # Menu (~14 s) + game load + 75 settle frames + margin.
  ORACLE_DLL=clientui.dll ORACLE_SAVE="$save" \
    "$HERE/run-oracle.sh" "$HERE/menus/sp-first-char.txt" "$dir" 60 -w -ns -seed 12345 \
    >"$dir/run.log" 2>&1 || true
  if [ -f "$dir/done" ] && [ -s "$dir/ui.ndjson" ]; then
    echo "$cls: $(wc -l <"$dir/ui.ndjson") lines -> $dir/ui.ndjson"
  else
    echo "$cls: no ui.ndjson (see $dir/log.txt)" >&2
    status=1
  fi
done
exit $status
