/**
 * Pure Diablo II `.d2s` save file checksum & header constants (`src/common/formats/d2s.ts`).
 */

const D2S_CHECKSUM_OFFSET = 0x0c

/** Diablo II version this writer targets (1.09+ layout, v96). */
export const D2S_VERSION = 96

/**
 * Diablo II's save checksum.
 *
 * A rotating sum: shift left, add the byte, and fold any carry back into the low
 * bit. Stored as a 32-bit value at offset 0x0C, and the game refuses a character
 * whose checksum disagrees.
 *
 * @param data - the file bytes, with the checksum field present.
 * @returns the checksum.
 */
export function d2sChecksum(data: Uint8Array): number {
  let sum = 0
  for (let index = 0; index < data.byteLength; index += 1) {
    const byte = index >= D2S_CHECKSUM_OFFSET && index < D2S_CHECKSUM_OFFSET + 4 ? 0 : data[index]!
    sum = sum * 2 + byte
    if (sum > 0xffffffff) sum = (sum % 0x100000000) + 1
  }
  return sum >>> 0
}
