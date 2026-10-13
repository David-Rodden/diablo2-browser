/**
 * Configurable text encoding/decoding abstraction (`gbk`, `utf-8`, `latin1`).
 * Uses runtime `TextDecoder` / `TextEncoder` without importing DOM or Node types.
 */

export type SupportedTextEncoding = 'gbk' | 'utf-8' | 'latin1'
export type TextEncoding = SupportedTextEncoding

export interface TextCodec {
  readonly encoding: SupportedTextEncoding
  decode(bytes: Uint8Array, encodingOverride?: SupportedTextEncoding): string
  encode(text: string, encodingOverride?: SupportedTextEncoding): Uint8Array
}

interface RuntimeTextDecoder {
  decode(input?: Uint8Array): string
}

interface RuntimeTextEncoder {
  encode(input?: string): Uint8Array
}

function getRuntimeTextDecoder(label: string, fatal = false): RuntimeTextDecoder | null {
  const g = globalThis as unknown as {
    TextDecoder?: new (label?: string, options?: { fatal?: boolean }) => RuntimeTextDecoder
  }
  if (typeof g.TextDecoder === 'function') {
    try {
      return new g.TextDecoder(label, { fatal })
    } catch {
      if (fatal) return null
      return new g.TextDecoder('utf-8', { fatal: false })
    }
  }
  return null
}

function getRuntimeTextEncoder(): RuntimeTextEncoder | null {
  const g = globalThis as unknown as {
    TextEncoder?: new () => RuntimeTextEncoder
  }
  if (typeof g.TextEncoder === 'function') {
    return new g.TextEncoder()
  }
  return null
}

let cachedGbkEncodeTable: Uint16Array | null | undefined

function getGbkEncodeTable(): Uint16Array | null {
  if (cachedGbkEncodeTable !== undefined) {
    return cachedGbkEncodeTable
  }
  const gbkDecoder = getRuntimeTextDecoder('gbk', true) ?? getRuntimeTextDecoder('gbk', false)
  if (!gbkDecoder) {
    cachedGbkEncodeTable = null
    return null
  }
  const table = new Uint16Array(65536)
  // Single-byte 0x80 in WHATWG GBK maps to U+20AC (€)
  try {
    const euro = gbkDecoder.decode(new Uint8Array([0x80]))
    if (euro.length === 1 && euro.charCodeAt(0) !== 0xfffd) {
      table[euro.charCodeAt(0)] = 0x80
    }
  } catch {
    // ignore if 0x80 is rejected in fatal mode
  }
  // Batch decode all 126 GBK lead-byte rows (0x81..0xFE x 0x40..0xFE, excluding 0x7F)
  // Using fatal=false decoder on 3-byte cells [b1, b2, 0x20] so each pair is isolated by ASCII space
  const nonFatalGbk = getRuntimeTextDecoder('gbk', false)
  if (!nonFatalGbk) {
    cachedGbkEncodeTable = null
    return null
  }
  const pairsPerRow = 190 // 0x40..0xFE without 0x7F
  const rowBuf = new Uint8Array(pairsPerRow * 3)
  for (let b1 = 0x81; b1 <= 0xfe; b1++) {
    let idx = 0
    for (let b2 = 0x40; b2 <= 0xfe; b2++) {
      if (b2 === 0x7f) continue
      rowBuf[idx++] = b1
      rowBuf[idx++] = b2
      rowBuf[idx++] = 0x20
    }
    const decodedRow = nonFatalGbk.decode(rowBuf)
    let strPos = 0
    for (let b2 = 0x40; b2 <= 0xfe; b2++) {
      if (b2 === 0x7f) continue
      const ch = decodedRow.charCodeAt(strPos)
      const nextCh = decodedRow.charCodeAt(strPos + 1)
      if (nextCh === 0x20) {
        if (ch !== 0xfffd && ch >= 0x80 && table[ch] === 0) {
          table[ch] = (b1 << 8) | b2
        }
        strPos += 2
      } else {
        // Unassigned sequence emitted replacement char + trail byte + space
        while (strPos < decodedRow.length && decodedRow.charCodeAt(strPos) !== 0x20) {
          strPos++
        }
        if (strPos < decodedRow.length) strPos++
      }
    }
  }
  cachedGbkEncodeTable = table
  return table
}

function encodeGbk(text: string): Uint8Array | null {
  const table = getGbkEncodeTable()
  if (!table) return null
  const bytes: number[] = []
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i)
    if (code < 0x80) {
      bytes.push(code)
      continue
    }
    // Surrogate pair (non-BMP code point) is outside 2-byte GBK table
    if (code >= 0xd800 && code <= 0xdfff) {
      return null
    }
    const gbkWord = table[code]!
    if (gbkWord === 0) {
      return null
    }
    if (gbkWord <= 0xff) {
      bytes.push(gbkWord)
    } else {
      bytes.push((gbkWord >>> 8) & 0xff, gbkWord & 0xff)
    }
  }
  return new Uint8Array(bytes)
}

function decodeLatin1(bytes: Uint8Array): string {
  let s = ''
  for (let i = 0; i < bytes.length; i++) {
    s += String.fromCharCode(bytes[i]!)
  }
  return s
}

function encodeLatin1(text: string): Uint8Array {
  const out = new Uint8Array(text.length)
  for (let i = 0; i < text.length; i++) {
    out[i] = text.charCodeAt(i) & 0xff
  }
  return out
}

export function createBrowserTextCodec(encoding: SupportedTextEncoding = 'gbk'): TextCodec {
  const decoderLabel = encoding === 'latin1' ? 'iso-8859-1' : encoding
  const decoder = encoding === 'latin1' ? null : getRuntimeTextDecoder(decoderLabel, false)
  const utf8FatalDecoder = encoding === 'gbk' ? getRuntimeTextDecoder('utf-8', true) : null
  const utf8Encoder = getRuntimeTextEncoder()

  return {
    encoding,
    decode(bytes: Uint8Array, encodingOverride?: SupportedTextEncoding): string {
      if (bytes.length === 0) return ''
      const eff = encodingOverride ?? encoding
      if (eff !== encoding) {
        return resolveTextCodec(eff).decode(bytes)
      }
      if (eff === 'latin1' || decoder === null) {
        return decodeLatin1(bytes)
      }
      const decoded = decoder.decode(bytes)
      if (eff === 'gbk' && utf8FatalDecoder !== null) {
        let hasNonAscii = false
        for (let i = 0; i < bytes.length; i++) {
          if (bytes[i]! >= 0x80) {
            hasNonAscii = true
            break
          }
        }
        if (hasNonAscii) {
          try {
            const utf8Str = utf8FatalDecoder.decode(bytes)
            if (decoded.includes('\ufffd') || encodeGbk(utf8Str) === null) {
              return utf8Str
            }
          } catch {
            // Not valid UTF-8; return GBK decoder output
          }
        }
      }
      return decoded
    },
    encode(text: string, encodingOverride?: SupportedTextEncoding): Uint8Array {
      if (text.length === 0) return new Uint8Array(0)
      const eff = encodingOverride ?? encoding
      if (eff !== encoding) {
        return resolveTextCodec(eff).encode(text)
      }
      if (eff === 'latin1') {
        return encodeLatin1(text)
      }
      let isAscii = true
      for (let i = 0; i < text.length; i++) {
        if (text.charCodeAt(i) >= 0x80) {
          isAscii = false
          break
        }
      }
      if (isAscii) {
        return encodeLatin1(text)
      }
      if (eff === 'gbk') {
        const gbkBytes = encodeGbk(text)
        if (gbkBytes !== null) {
          return gbkBytes
        }
      }
      if (utf8Encoder === null) {
        return encodeLatin1(text)
      }
      return utf8Encoder.encode(text)
    },
  }
}

export const defaultTextCodec: TextCodec = createBrowserTextCodec('gbk')

const codecCache: Record<SupportedTextEncoding, TextCodec> = {
  gbk: defaultTextCodec,
  'utf-8': createBrowserTextCodec('utf-8'),
  latin1: createBrowserTextCodec('latin1'),
}

export function resolveTextCodec(codecOrEncoding?: TextCodec | SupportedTextEncoding): TextCodec {
  if (!codecOrEncoding) return defaultTextCodec
  if (typeof codecOrEncoding === 'string') {
    return codecCache[codecOrEncoding] ?? defaultTextCodec
  }
  return codecOrEncoding
}

export function decodeText(bytes: Uint8Array, encoding: SupportedTextEncoding = 'gbk'): string {
  return resolveTextCodec(encoding).decode(bytes)
}

export function encodeText(text: string, encoding: SupportedTextEncoding = 'gbk'): Uint8Array {
  return resolveTextCodec(encoding).encode(text)
}
