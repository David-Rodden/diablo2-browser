/**
 * Diablo II v1.13c x86 32-bit integer arithmetic primitives.
 *
 * Every server formula in D2Game.dll / D2Common.dll executes on 32-bit two's-complement
 * registers (`imul`, `idiv`, `div`, `sar`, `shl`, `shr`). JavaScript `Math.floor(a / b)`
 * rounds toward -Infinity on negatives, whereas x86 `idiv` truncates toward zero!
 *
 * Binary evidence:
 * - `D2Common.dll 0x6FD511E0` / `D2Game.dll 0x6FC214D0` (`mulDiv113c`)
 * - `D2Common.dll 0x6FD89530` (`EvalStatWithOps`: `imul`, `sar cl`, `mulDiv113c`)
 */
import { mulDiv113c } from '../../common/data/mul-div-113c.ts'

export { mulDiv113c }

/** Signed 32-bit `idiv` quotient (truncates toward zero; `-0x80000000 / -1` wraps to `-0x80000000`). */
export function sdiv32(a: number, b: number): number {
  const num = a | 0
  const den = b | 0
  if (den === 0) throw new RangeError('sdiv32: division by zero (INT_DIVIDE_BY_ZERO)')
  return Math.trunc(num / den) | 0
}

/** Signed 32-bit `idiv` remainder (`edx` after `cdq; idiv`: sign matches dividend `a`). */
export function smod32(a: number, b: number): number {
  const num = a | 0
  const den = b | 0
  if (den === 0) throw new RangeError('smod32: division by zero (INT_DIVIDE_BY_ZERO)')
  return (num % den) | 0
}

/** Unsigned 32-bit `div` quotient (`eax` after `xor edx, edx; div ecx`). */
export function udiv32(a: number, b: number): number {
  const num = a >>> 0
  const den = b >>> 0
  if (den === 0) throw new RangeError('udiv32: division by zero (INT_DIVIDE_BY_ZERO)')
  return Math.floor(num / den) >>> 0
}

/** Unsigned 32-bit `div` remainder (`edx` after `xor edx, edx; div ecx`). */
export function umod32(a: number, b: number): number {
  const num = a >>> 0
  const den = b >>> 0
  if (den === 0) throw new RangeError('umod32: division by zero (INT_DIVIDE_BY_ZERO)')
  return (num % den) >>> 0
}

/** x86 `imul r32, r32` (low 32 bits as signed int32). */
export function imul32(a: number, b: number): number {
  return Math.imul(a | 0, b | 0) | 0
}

/** x86 `sar r32, cl` (shift count masked by `& 31` per IA-32 `sar`). */
export function sar32(v: number, shift: number): number {
  return (v | 0) >> (shift & 31)
}

/** x86 `shl r32, cl` (shift count masked by `& 31` per IA-32 `shl`). */
export function shl32(v: number, shift: number): number {
  return ((v | 0) << (shift & 31)) | 0
}

/** x86 `shr r32, cl` (unsigned logical shift right, count `& 31`). */
export function shr32(v: number, shift: number): number {
  return (v >>> 0) >>> (shift & 31)
}
