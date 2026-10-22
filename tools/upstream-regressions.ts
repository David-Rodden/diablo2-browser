import { readFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'
import EXPECTED from './upstream-expected-failures.json' with { type: 'json' }

export interface VitestReport {
  readonly testResults: readonly {
    readonly name: string
    readonly status: string
    readonly message?: string
    readonly assertionResults: readonly { readonly fullName: string; readonly status: string }[]
  }[]
}

export interface Comparison {
  readonly compared: number
  readonly regressions: readonly string[]
  readonly expected: readonly string[]
  readonly fixed: readonly string[]
}

const relative = (file: string) => file.slice(Math.max(0, file.lastIndexOf('/tests/') + 1))

const outcomes = (report: VitestReport): ReadonlyMap<string, string> =>
  new Map(
    report.testResults.flatMap((file) =>
      file.assertionResults.length === 0
        ? [[relative(file.name), file.status] as const]
        : file.assertionResults.map((test) => [`${relative(file.name)} > ${test.fullName}`, test.status] as const),
    ),
  )

export function compareReports(theirs: VitestReport, ours: VitestReport, expected: Readonly<Record<string, string>> = EXPECTED): Comparison {
  const [before, after] = [outcomes(theirs), outcomes(ours)]
  const both = [...before.keys()].filter((key) => after.has(key) || after.has(key.split(' > ')[0]!))
  const outcome = (key: string) => after.get(key) ?? after.get(key.split(' > ')[0]!)
  const broken = both.filter((key) => before.get(key) === 'passed' && outcome(key) === 'failed').sort()
  return {
    compared: both.length,
    regressions: broken.filter((key) => !(key in expected)),
    expected: broken.filter((key) => key in expected),
    fixed: both.filter((key) => before.get(key) === 'failed' && outcome(key) === 'passed').sort(),
  }
}

export function summary({ compared, regressions, expected, fixed }: Comparison, reasons: Readonly<Record<string, string>> = EXPECTED): string {
  const list = (keys: readonly string[]) => keys.map((key) => `- ${key}`).join('\n')
  return [
    '### troytt\'s tests on this branch',
    regressions.length === 0 ? `All ${compared} of his tests that pass on his snapshot still pass here.` : `${regressions.length} of his tests pass on his snapshot but fail here:\n\n${list(regressions)}`,
    ...(expected.length > 0 ? [`\n${expected.length} fail here on purpose:\n\n${expected.map((key) => `- ${key}: ${reasons[key] ?? ''}`).join('\n')}`] : []),
    ...(fixed.length > 0 ? [`\n${fixed.length} fail on his snapshot and pass here:\n\n${list(fixed)}`] : []),
  ].join('\n\n')
}

function main([theirsPath, oursPath]: readonly string[]): void {
  if (!theirsPath || !oursPath) throw new Error('usage: upstream-regressions.ts <theirs.json> <ours.json>')
  const read = (path: string) => JSON.parse(readFileSync(path, 'utf8')) as VitestReport
  const comparison = compareReports(read(theirsPath), read(oursPath))
  comparison.regressions.forEach((key) => console.error(`::warning title=troytt's test now fails::${key}`))
  console.log(summary(comparison))
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main(process.argv.slice(2))
