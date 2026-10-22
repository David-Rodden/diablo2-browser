import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const ROOT = resolve(__dirname, '../..')
const rules = readFileSync(resolve(ROOT, '.upstream-filter'), 'utf8').split('\n').map((line) => line.trim().split(/\s+/))
const englishFiles = rules.filter(([kind, path]) => (kind === 'english' || (kind === 'keep' && path?.endsWith('.md'))) && path).map(([, path]) => path!)

const dictionary = readFileSync(resolve(ROOT, 'tools/english.tsv'), 'utf8').split('\n').filter((line) => line.includes('\t')).map((line) => line.split('\t') as [string, string])

describe('english only', () => {
  it('keys the dictionary on his original text, never on words another entry already translated', () => {
    const translated = dictionary.filter(([from, to]) => /\p{Script=Han}/u.test(from) && /^[A-Za-z][\w ]{3,}$/.test(to))
    const stale = dictionary.flatMap(([key]) => translated.filter(([from, to]) => key !== from && key.includes(to) && /\p{Script=Han}/u.test(key)).map(([from, to]) => `${key} has "${to}" where his text says "${from}"`))
    expect(stale).toEqual([])
  })

  it.each(englishFiles)('%s has no Chinese left', (path) => {
    const lines = readFileSync(resolve(ROOT, path), 'utf8').split('\n')
    expect(lines.flatMap((line, i) => (/\p{Script=Han}/u.test(line) ? [`${i + 1}: ${line.trim()}`] : []))).toEqual([])
  })
})
