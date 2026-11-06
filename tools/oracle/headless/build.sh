#!/usr/bin/env bash
# Build d2host-113c.exe with the rootless i686 mingw toolchain.
set -euo pipefail
HERE=$(cd "$(dirname "$0")" && pwd)
ROOT=${D2_ORACLE_ROOT:-$HOME/.local/opt/d2oracle}
CC=${CC:-$ROOT/mingw/usr/bin/i686-w64-mingw32-gcc-win32}
OUT=${1:-$ROOT/build}
mkdir -p "$OUT"
CFLAGS="-O2 -Wall -Wextra -Wno-unused-parameter -static-libgcc"

out="$OUT/d2host-113c.exe"
src="$HERE/d2host-113c.c"
if [ ! -f "$out" ] || [ "$src" -nt "$out" ]; then
  tmp=$(mktemp "$OUT/.build.XXXXXX")
  $CC $CFLAGS -o "$tmp" "$src" -Wl,--enable-stdcall-fixup
  mv -f "$tmp" "$out"
fi
echo "built: $out"
