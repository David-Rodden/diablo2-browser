#!/usr/bin/env bash
# Builds the native D2MOO DRLG oracle used to diff the TypeScript Act I port (see README.md).
#
# Environment:
#   D2MOO_SRC   D2MOO checkout (default: ~/tmp/D2MOO), must be at the pinned commit below.
#   CXX         C++ compiler (default: g++); needs 32-bit support (-m32, gcc-multilib).
#   OUT         install directory of the binary (default: tools/d2moo-oracle/build).
#
# Objects are compiled in a private temporary directory and the binary is installed with an atomic
# rename ($OUT/d2moo-oracle.tmp -> $OUT/d2moo-oracle), so an oracle that is running concurrently is
# never deleted or replaced by a half-written file.
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
D2MOO_SRC="${D2MOO_SRC:-$HOME/tmp/D2MOO}"
PINNED_COMMIT=5596f5cb6c5251a0a07c6637d26458b06099d516
CXX="${CXX:-g++}"
OUT="${OUT:-$HERE/build}"

actual_commit="$(git -C "$D2MOO_SRC" rev-parse HEAD)"
if [[ "$actual_commit" != "$PINNED_COMMIT" ]]; then
  echo "error: $D2MOO_SRC is at $actual_commit, expected $PINNED_COMMIT" >&2
  exit 1
fi

# 32-bit so every D2MOO struct has the exact 1.13c layout of the compiled .bin tables.
# -O0/-fwrapv/-fno-strict-aliasing keep MSVC-like integer and aliasing semantics.
FLAGS=(-m32 -std=c++17 -O0 -g -fwrapv -fno-strict-aliasing -fPIC -ffunction-sections -fms-extensions -fpermissive
       -Wno-invalid-offsetof -w -DD2_VERSION_HAS_UBERS=1 -include DataTbls/LevelsIds.h "-DD2ORACLE_D2MOO_COMMIT=\"$PINNED_COMMIT\"")
INCLUDES=(-I"$HERE/include" -I"$HERE/src")
for component in D2Common D2CommonDefinitions Fog Storm D2CMP D2Lang D2Hell; do
  INCLUDES+=(-I"$D2MOO_SRC/source/$component/include")
done

D2MOO_SOURCES=("$D2MOO_SRC"/source/D2Common/src/Drlg/*.cpp
               "$D2MOO_SRC/source/D2Common/src/D2Collision.cpp"
               "$D2MOO_SRC/source/D2Common/src/DataTbls/LevelsTbls.cpp")
ORACLE_SOURCES=("$HERE"/src/*.cpp)

WORK="$(mktemp -d "${TMPDIR:-/tmp}/d2moo-oracle-build.XXXXXX")"
trap 'rm -rf "$WORK"' EXIT
mkdir -p "$WORK/obj/d2moo" "$WORK/obj/oracle"

compile() {
  local src="$1" obj="$2"
  "$CXX" "${FLAGS[@]}" "${INCLUDES[@]}" -c "$src" -o "$obj"
}
export -f compile
export CXX
pids=()
d2moo_objs=()
for src in "${D2MOO_SOURCES[@]}"; do
  obj="$WORK/obj/d2moo/$(basename "${src%.cpp}").o"
  d2moo_objs+=("$obj")
  compile "$src" "$obj" &
  pids+=($!)
done
oracle_objs=()
for src in "${ORACLE_SOURCES[@]}"; do
  obj="$WORK/obj/oracle/$(basename "${src%.cpp}").o"
  oracle_objs+=("$obj")
  compile "$src" "$obj" &
  pids+=($!)
done
for pid in "${pids[@]}"; do
  wait "$pid"
done

# Every D2MOO object that emits a SEED_* roll must have been compiled against the traced header;
# otherwise the linker could merge an untraced inline copy and the trace would have gaps.
for obj in "${d2moo_objs[@]}"; do
  if nm "$obj" | grep -q "SEED_Roll" && ! nm "$obj" | grep -q "D2ORACLE_TraceRoll"; then
    echo "error: $obj uses SEED rolls but was not compiled against include/D2Seed.h" >&2
    exit 1
  fi
done

WRAP_FLAGS=(
  -Wl,--wrap=_Z32DRLGOUTWILD_InitAct1OutdoorLevelP15D2DrlgLevelStrc
  -Wl,--wrap=_Z32DRLGOUTDESR_InitAct2OutdoorLevelP15D2DrlgLevelStrc
  -Wl,--wrap=_Z33DRLGOUTPLACE_InitAct3OutdoorLevelP15D2DrlgLevelStrc
  -Wl,--wrap=_Z33DRLGOUTSIEGE_InitAct5OutdoorLevelP15D2DrlgLevelStrc
  -Wl,--wrap=_Z23DRLGPRESET_AllocDrlgMapP15D2DrlgLevelStrciP15D2DrlgCoordStrcP10D2SeedStrc
  -Wl,--wrap=_Z32DRLGOUTPLACE_CreateOutdoorRoomExP15D2DrlgLevelStrciiiiiiii
)
"$CXX" -m32 "${d2moo_objs[@]}" "${oracle_objs[@]}" "${WRAP_FLAGS[@]}" -o "$WORK/d2moo-oracle"

mkdir -p "$OUT"
cp "$WORK/d2moo-oracle" "$OUT/d2moo-oracle.tmp"
mv -f "$OUT/d2moo-oracle.tmp" "$OUT/d2moo-oracle"
echo "built $OUT/d2moo-oracle (D2MOO $PINNED_COMMIT)"
