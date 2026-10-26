/**
 * Static Asset Sidecar Compression & Content-Negotiation Middleware (`src/baker/io/sidecar-compression.ts`).
 *
 * Implements zero-code-change bandwidth reduction across two axes:
 * 1. Image WebP negotiation (`.png`, `.jpg`, `.jpeg` -> `<file>.webp` sidecar when `Accept: image/webp` is present).
 * 2. Binary & JSON pre-compressed sidecar negotiation (`.r8`, `.bin`, `.json` -> `<file>.br` / `<file>.gz` when
 *    `Accept-Encoding` includes `br` or `gzip`), plus canonical `application/octet-stream` MIME headers for `.r8`.
 */

import {
  createReadStream,
  existsSync,
  readdirSync,
  readFileSync,
  realpathSync,
  renameSync,
  statSync,
  writeFileSync,
} from 'node:fs'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { extname, join, relative, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { brotliCompressSync, constants as zlibConstants, gzipSync } from 'node:zlib'

export interface SidecarMiddlewareOptions {
  readonly publicDir?: string | undefined
  readonly stripUrlPrefixes?: readonly string[] | undefined
}

type NextFunction = (err?: unknown) => void

function resolveCandidatePaths(baseFilePath: string): readonly string[] {
  const out = [baseFilePath]
  try {
    const real = realpathSync(baseFilePath)
    if (real !== baseFilePath) {
      out.push(real)
    }
  } catch {
    // Ignore broken symlinks
  }
  return out
}

function findExistingSidecar(
  baseCandidates: readonly string[],
  suffix: '.webp' | '.br' | '.gz',
): { readonly path: string; readonly size: number } | undefined {
  for (const base of baseCandidates) {
    const candidate = `${base}${suffix}`
    try {
      if (!existsSync(candidate)) continue
      const st = statSync(candidate)
      if (st.isFile() && st.size > 0) {
        return { path: candidate, size: st.size }
      }
    } catch {
      continue
    }
  }
  return undefined
}

function parseAcceptTokens(headerVal: string | string[] | undefined): string {
  if (!headerVal) return ''
  return (Array.isArray(headerVal) ? headerVal.join(',') : headerVal).toLowerCase()
}

function appendVaryHeader(res: ServerResponse, token: string): void {
  const existing = res.getHeader('Vary')
  if (!existing) {
    res.setHeader('Vary', token)
    return
  }
  const existingStr = Array.isArray(existing) ? existing.join(', ') : String(existing)
  const parts = existingStr.split(',').map((p) => p.trim().toLowerCase())
  if (!parts.includes(token.toLowerCase())) {
    res.setHeader('Vary', `${existingStr}, ${token}`)
  }
}

/**
 * Connect/Vite HTTP middleware that transparently serves `.webp`, `.br`, and `.gz` sidecar
 * files from `public/` when supported by the client's `Accept` / `Accept-Encoding` headers.
 */
export function createSidecarAssetHttpMiddleware(
  options?: SidecarMiddlewareOptions,
): (req: IncomingMessage, res: ServerResponse, next: NextFunction) => void {
  const publicDir = resolve(options?.publicDir ?? join(process.cwd(), 'public'))
  const stripPrefixes = options?.stripUrlPrefixes ?? ['/diablo2/', '/pd2/']

  return (req: IncomingMessage, res: ServerResponse, next: NextFunction): void => {
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      next()
      return
    }
    const rawUrl = req.url
    if (!rawUrl) {
      next()
      return
    }

    const qIdx = rawUrl.indexOf('?')
    let pathname = qIdx >= 0 ? rawUrl.slice(0, qIdx) : rawUrl
    try {
      pathname = decodeURIComponent(pathname)
    } catch {
      next()
      return
    }

    for (const prefix of stripPrefixes) {
      if (pathname.startsWith(prefix)) {
        pathname = `/${pathname.slice(prefix.length)}`
        break
      }
    }

    // Do not intercept dynamicasset-manifest.json refresh endpoint
    if (pathname === '/asset-manifest.json') {
      next()
      return
    }

    const ext = extname(pathname).toLowerCase()
    const isImage = ext === '.png' || ext === '.jpg' || ext === '.jpeg'
    const isCompressibleData = ext === '.r8' || ext === '.bin' || ext === '.json'
    if (!isImage && !isCompressibleData) {
      next()
      return
    }

    const relPath = pathname.replace(/^\/+/, '')
    if (!relPath || relPath.includes('\0')) {
      next()
      return
    }

    const targetPath = resolve(publicDir, relPath)
    const relCheck = relative(publicDir, targetPath)
    if (relCheck.startsWith('..') || relCheck.startsWith('/')) {
      next()
      return
    }

    let baseStat
    try {
      if (!existsSync(targetPath)) {
        next()
        return
      }
      baseStat = statSync(targetPath)
      if (!baseStat.isFile()) {
        next()
        return
      }
    } catch {
      next()
      return
    }

    const baseCandidates = resolveCandidatePaths(targetPath)

    if (isImage) {
      appendVaryHeader(res, 'Accept')
      const accept = parseAcceptTokens(req.headers['accept'])
      if (accept.includes('image/webp')) {
        const webpSidecar = findExistingSidecar(baseCandidates, '.webp')
        if (webpSidecar) {
          res.statusCode = 200
          res.setHeader('Content-Type', 'image/webp')
          res.setHeader('Content-Length', String(webpSidecar.size))
          res.setHeader('X-Asset-Sidecar', 'webp')
          if (req.method === 'HEAD') {
            res.end()
            return
          }
          createReadStream(webpSidecar.path).pipe(res)
          return
        }
      }
      next()
      return
    }

    // .r8, .bin, or .json
    const mimeType = ext === '.json' ? 'application/json; charset=utf-8' : 'application/octet-stream'
    appendVaryHeader(res, 'Accept-Encoding')
    const acceptEncoding = parseAcceptTokens(req.headers['accept-encoding'])

    // Do not serve pre-compressed sidecar if client sent a Range header
    if (!req.headers['range']) {
      if (acceptEncoding.includes('br')) {
        const brSidecar = findExistingSidecar(baseCandidates, '.br')
        if (brSidecar) {
          res.statusCode = 200
          res.setHeader('Content-Type', mimeType)
          res.setHeader('Content-Encoding', 'br')
          res.setHeader('Content-Length', String(brSidecar.size))
          res.setHeader('X-Asset-Sidecar', 'br')
          if (req.method === 'HEAD') {
            res.end()
            return
          }
          createReadStream(brSidecar.path).pipe(res)
          return
        }
      }
      if (acceptEncoding.includes('gzip')) {
        const gzSidecar = findExistingSidecar(baseCandidates, '.gz')
        if (gzSidecar) {
          res.statusCode = 200
          res.setHeader('Content-Type', mimeType)
          res.setHeader('Content-Encoding', 'gzip')
          res.setHeader('Content-Length', String(gzSidecar.size))
          res.setHeader('X-Asset-Sidecar', 'gzip')
          if (req.method === 'HEAD') {
            res.end()
            return
          }
          createReadStream(gzSidecar.path).pipe(res)
          return
        }
      }
    }

    // Ensure .r8 and .bin always have a deterministic Content-Type even without a sidecar
    if (ext === '.r8' || ext === '.bin') {
      res.setHeader('Content-Type', 'application/octet-stream')
    }
    next()
  }
}

export interface BakeSidecarOptions {
  readonly publicDir?: string | undefined
  readonly subdirs?: readonly string[] | undefined
  readonly enableBrotli?: boolean | undefined
  readonly enableGzip?: boolean | undefined
  readonly brotliQuality?: number | undefined
  readonly gzipLevel?: number | undefined
}

export interface BakeSidecarSummary {
  readonly processedFiles: number
  readonly originalBytes: number
  readonly compressedBytes: number
}

function shouldCompressDataFile(fileName: string): boolean {
  if (fileName.endsWith('.r8') || fileName.endsWith('.json')) return true
  if (
    fileName.endsWith('.bin') &&
    (fileName.includes('drlg-bundle') || fileName.includes('palette') || fileName === 'meta.bin')
  ) {
    return true
  }
  return false
}

function writeAtomicSidecar(targetPath: string, data: Uint8Array): void {
  const tmpPath = `${targetPath}.tmp.${process.pid}`
  writeFileSync(tmpPath, data)
  renameSync(tmpPath, targetPath)
}

/**
 * Generates `.gz` (and optional `.br`) pre-compressed sidecar files for `.r8`, `.bin`, and `.json`
 * assets under `public/`.
 */
export function bakeSidecarCompression(options?: BakeSidecarOptions): BakeSidecarSummary {
  const publicDir = resolve(options?.publicDir ?? join(process.cwd(), 'public'))
  const subdirs = options?.subdirs ?? ['act-packs', 'entities', 'ui', 'items-pd2', 'ui-pd2', 'anim', 'chars']
  const enableGzip = options?.enableGzip ?? true
  const enableBrotli = options?.enableBrotli ?? false
  const gzipLevel = options?.gzipLevel ?? 6
  const brotliQuality = options?.brotliQuality ?? 6

  let processedFiles = 0
  let originalBytes = 0
  let compressedBytes = 0

  const walk = (dir: string): void => {
    if (!existsSync(dir)) return
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.name.startsWith('.') || entry.isSymbolicLink()) continue
      const fullPath = join(dir, entry.name)
      if (entry.isDirectory()) {
        walk(fullPath)
      } else if (entry.isFile() && shouldCompressDataFile(entry.name)) {
        const raw = readFileSync(fullPath)
        if (raw.byteLength < 512) continue
        processedFiles += 1
        originalBytes += raw.byteLength
        let bestBytes = raw.byteLength

        if (enableGzip) {
          const gzPath = `${fullPath}.gz`
          const gz = gzipSync(raw, { level: gzipLevel })
          if (gz.byteLength < raw.byteLength * 0.95) {
            writeAtomicSidecar(gzPath, gz)
            bestBytes = Math.min(bestBytes, gz.byteLength)
          }
        }

        if (enableBrotli) {
          const brPath = `${fullPath}.br`
          const br = brotliCompressSync(raw, {
            params: {
              [zlibConstants.BROTLI_PARAM_QUALITY]: brotliQuality,
            },
          })
          if (br.byteLength < raw.byteLength * 0.95) {
            writeAtomicSidecar(brPath, br)
            bestBytes = Math.min(bestBytes, br.byteLength)
          }
        }

        compressedBytes += bestBytes
      }
    }
  }

  for (const sub of subdirs) {
    walk(join(publicDir, sub))
  }

  return { processedFiles, originalBytes, compressedBytes }
}

const isMain =
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href

if (isMain) {
  const enableBrotli = process.argv.includes('--brotli')
  const summary = bakeSidecarCompression({ enableBrotli })
  console.log(
    `✓ Baked sidecar compression for ${summary.processedFiles} files: ${(summary.originalBytes / (1024 * 1024)).toFixed(2)} MB -> ${(summary.compressedBytes / (1024 * 1024)).toFixed(2)} MB`,
  )
}
