import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const ROOT = resolve(__dirname, '../..')
const rules = readFileSync(resolve(ROOT, '.upstream-filter'), 'utf8').split('\n').map((line) => line.trim().split(/\s+/))
const englishFiles = rules.filter(([kind, path]) => (kind === 'english' || (kind === 'keep' && path?.endsWith('.md'))) && path).map(([, path]) => path!)

describe('english only', () => {
  it.each(englishFiles)('%s has no Chinese left', (path) => {
    const lines = readFileSync(resolve(ROOT, path), 'utf8').split('\n')
    expect(lines.flatMap((line, i) => (/\p{Script=Han}/u.test(line) ? [`${i + 1}: ${line.trim()}`] : []))).toEqual([])
  })
})
