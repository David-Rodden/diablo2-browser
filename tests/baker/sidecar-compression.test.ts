import { mkdtempSync, mkdirSync, rmSync, writeFileSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { PassThrough } from 'node:stream'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { generateAssetManifest } from '../../src/baker/io/asset-manifest.ts'
import {
  bakeSidecarCompression,
  createSidecarAssetHttpMiddleware,
} from '../../src/baker/io/sidecar-compression.ts'
import { resolveArtByCelFile } from '../../src/client/render/cel-file-key.ts'
import type { SpriteRenderer } from '../../src/client/render/renderer.ts'
import {
  loadMissileArtMap,
  loadOverlayArtMap,
} from '../../src/client/scene/missile-overlay-renderer.ts'

function createMockRenderer(): SpriteRenderer {
  let id = 0
  return {
    addAtlas: () => ({ id: ++id }),
  } as unknown as SpriteRenderer
}

function invokeMiddleware(
  middleware: (req: IncomingMessage, res: ServerResponse, next: () => void) => void,
  url: string,
  headers: Record<string, string>,
  method = 'GET',
): Promise<{
  nextCalled: boolean
  statusCode: number
  headers: Record<string, string>
  body: Buffer
}> {
  return new Promise(resolve => {
    const req = {
      method,
      url,
      headers,
    } as unknown as IncomingMessage

    const resHeaders: Record<string, string> = {}
    const stream = new PassThrough()
    const chunks: Buffer[] = []
    stream.on('data', (chunk: Buffer) => chunks.push(Buffer.from(chunk)))

    const res = Object.assign(stream, {
      statusCode: 200,
      getHeader(name: string) {
        return resHeaders[name.toLowerCase()]
      },
      setHeader(name: string, value: string) {
        resHeaders[name.toLowerCase()] = value
      },
    }) as unknown as ServerResponse

    let nextCalled = false
    stream.on('finish', () => {
      resolve({
        nextCalled,
        statusCode: res.statusCode,
        headers: resHeaders,
        body: Buffer.concat(chunks),
      })
    })

    middleware(req, res, () => {
      nextCalled = true
      resolve({
        nextCalled: true,
        statusCode: res.statusCode,
        headers: resHeaders,
        body: Buffer.alloc(0),
      })
    })
  })
}

describe('sidecar compression & lazy sprite art loading', () => {
  const tempDirs: string[] = []

  afterEach(() => {
    vi.unstubAllGlobals()
    while (tempDirs.length > 0) {
      const dir = tempDirs.pop()!
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('serves .webp sidecars transparently when Accept includes image/webp and falls back otherwise', async () => {
    const publicDir = mkdtempSync(join(tmpdir(), 'd2-sidecar-webp-'))
    tempDirs.push(publicDir)
    mkdirSync(join(publicDir, 'ui'), { recursive: true })
    writeFileSync(join(publicDir, 'ui', 'items-atlas.png'), Buffer.from('RAW_PNG_BYTES'))
    writeFileSync(join(publicDir, 'ui', 'items-atlas.png.webp'), Buffer.from('WEBP_SIDECAR_BYTES'))

    const middleware = createSidecarAssetHttpMiddleware({ publicDir })

    const webpRes = await invokeMiddleware(middleware, '/ui/items-atlas.png', {
      accept: 'image/avif,image/webp,image/apng,*/*;q=0.8',
    })
    expect(webpRes.nextCalled).toBe(false)
    expect(webpRes.headers['content-type']).toBe('image/webp')
    expect(webpRes.headers['x-asset-sidecar']).toBe('webp')
    expect(webpRes.headers['vary']).toContain('Accept')
    expect(webpRes.body.toString('utf8')).toBe('WEBP_SIDECAR_BYTES')

    const fallbackRes = await invokeMiddleware(middleware, '/ui/items-atlas.png', {
      accept: 'image/png,*/*;q=0.8',
    })
    expect(fallbackRes.nextCalled).toBe(true)
  })

  it('bakes .gz and .br sidecars for .r8/.bin/.json and serves them with Content-Encoding and ignored in asset manifest', async () => {
    const publicDir = mkdtempSync(join(tmpdir(), 'd2-sidecar-r8-'))
    tempDirs.push(publicDir)
    mkdirSync(join(publicDir, 'entities'), { recursive: true })
    const rawR8 = Buffer.alloc(8192, 0x2a)
    writeFileSync(join(publicDir, 'entities', 'char-so.r8'), rawR8)

    const summary = bakeSidecarCompression({
      publicDir,
      enableGzip: true,
      enableBrotli: true,
    })
    expect(summary.processedFiles).toBe(1)
    expect(summary.compressedBytes).toBeLessThan(summary.originalBytes)
    expect(existsSync(join(publicDir, 'entities', 'char-so.r8.gz'))).toBe(true)
    expect(existsSync(join(publicDir, 'entities', 'char-so.r8.br'))).toBe(true)

    const manifest = generateAssetManifest({
      publicDir,
      includePacksDir: false,
      outputFile: null,
    })
    expect(Object.keys(manifest.files)).toEqual(['entities/char-so.r8'])

    const middleware = createSidecarAssetHttpMiddleware({ publicDir })
    const brRes = await invokeMiddleware(middleware, '/entities/char-so.r8', {
      'accept-encoding': 'gzip, deflate, br',
    })
    expect(brRes.nextCalled).toBe(false)
    expect(brRes.headers['content-encoding']).toBe('br')
    expect(brRes.headers['content-type']).toBe('application/octet-stream')
    expect(brRes.headers['x-asset-sidecar']).toBe('br')
    expect(brRes.body.byteLength).toBeLessThan(rawR8.byteLength)

    const gzRes = await invokeMiddleware(middleware, '/entities/char-so.r8', {
      'accept-encoding': 'gzip, deflate',
    })
    expect(gzRes.nextCalled).toBe(false)
    expect(gzRes.headers['content-encoding']).toBe('gzip')
    expect(gzRes.headers['x-asset-sidecar']).toBe('gzip')
  })

  it('skips redundant .json HTTP requests for bundled missile/overlay metas and loads lazily on demand when { lazy: true }', async () => {
    const requestedUrls: string[] = []
    vi.stubGlobal('fetch', async (url: string) => {
      const cleanUrl = decodeURIComponent(url)
      requestedUrls.push(cleanUrl)
      if (cleanUrl.endsWith('/manifest.json')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({ schema: 1, atlases: {}, missiles: {}, overlays: {} }),
        }
      }
      if (cleanUrl.endsWith('.png')) {
        return {
          ok: true,
          status: 200,
          blob: async () => new Blob([new Uint8Array([1, 2, 3, 4])]),
        }
      }
      return { ok: false, status: 404 }
    })
    vi.stubGlobal('createImageBitmap', async () => ({
      width: 64,
      height: 64,
      close: () => undefined,
    }))

    const missileMap = await loadMissileArtMap(createMockRenderer(), undefined, {
      lazy: true,
      preloadStems: ['arrow', 'firebolt'],
    })

    // Zero .json requests for standard missiles because MISSILE_METAS already contains frame tuples
    const jsonFetches = requestedUrls.filter(
      u => u.endsWith('.json') && !u.endsWith('/manifest.json'),
    )
    expect(jsonFetches).toEqual([])

    // Only preloaded stems were fetched on boot
    const bootPngFetches = requestedUrls.filter(u => u.endsWith('.png'))
    expect(bootPngFetches.length).toBe(2)
    expect(missileMap.get('arrow')).toBeDefined()
    expect(missileMap.get('firebolt')).toBeDefined()

    // Non-preloaded stem ('poisonnova') is not yet in memory; first get() triggers background load
    expect(missileMap.get('poisonnova')).toBeUndefined()
    await missileMap.waitForInflight()

    const poisonNovaArt = resolveArtByCelFile(missileMap, 'poisonnova', 'poisonnova')
    expect(poisonNovaArt).toBeDefined()
    expect(requestedUrls.some(u => u.endsWith('/missiles/poisonnova.png'))).toBe(true)

    const overlayMap = await loadOverlayArtMap(createMockRenderer(), undefined, {
      lazy: true,
      preloadStems: ['town_portal_op_tr'],
    })
    expect(overlayMap.get('town_portal_op_tr')).toBeDefined()
  })
})
