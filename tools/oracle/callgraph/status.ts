/**
 * Diablo II v1.13c Isomorphic Server Kernel Call Graph Status Board.
 *
 * Reads manifest-113c.json and reports precise progress, topological layering,
 * and next unblocked work orders for parallel development.
 */
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

interface FunctionEntry {
  va: string;
  module: 'D2Game' | 'D2Common';
  name: string;
  size: number;
  sccId: number;
  topoLevel: number;
  status: 'diff-verified' | 'diff-observed' | 'unverified' | 'pending';
  callees: string[];
  callers: string[];
  externalDeps: string[];
  tsReference?: string;
}

interface Manifest {
  version: string;
  generatedAt: string;
  summary: {
    totalReachable: number;
    d2GameReachable: number;
    d2CommonReachable: number;
    sccCount: number;
    maxTopoLevel: number;
    statusBreakdown: Record<string, number>;
  };
  functions: FunctionEntry[];
}

function printHeader(title: string): void {
  console.log(`\n========================================================================`);
  console.log(`  ${title}`);
  console.log(`========================================================================`);
}

function main(): void {
  const manifestPath = path.join(__dirname, 'manifest-113c.json');
  if (!fs.existsSync(manifestPath)) {
    console.error(`Error: manifest file not found at ${manifestPath}`);
    console.error(`Please run extract-callgraph.py first.`);
    process.exit(1);
  }

  const raw = fs.readFileSync(manifestPath, 'utf-8');
  const manifest: Manifest = JSON.parse(raw);
  const { summary, functions } = manifest;

  printHeader(`Diablo II v1.13c Server Core Call Graph Status (K0)`);
  console.log(`Version:             ${manifest.version}`);
  console.log(`Generated At:        ${manifest.generatedAt}`);
  console.log(`Total Reachable:     ${summary.totalReachable} functions`);
  console.log(`  - D2Game.dll:      ${summary.d2GameReachable}`);
  console.log(`  - D2Common.dll:    ${summary.d2CommonReachable}`);
  console.log(`SCC Units:           ${summary.sccCount}`);
  console.log(`Max Topo Depth:      Level ${summary.maxTopoLevel}`);

  printHeader(`Porting & Verification Status`);
  const total = summary.totalReachable;
  const verified = summary.statusBreakdown['diff-verified'] || 0;
  const observed = summary.statusBreakdown['diff-observed'] || 0;
  const unverified = summary.statusBreakdown['unverified'] || 0;
  const pending = summary.statusBreakdown['pending'] || 0;

  const pct = (n: number) => ((n / total) * 100).toFixed(2);
  console.log(`[+] diff-verified:   ${String(verified).padStart(5)} (${pct(verified)}%) [Golden diff / replay zero mismatch]`);
  console.log(`[~] diff-observed:   ${String(observed).padStart(5)} (${pct(observed)}%) [Covered in runs, open divergence]`);
  console.log(`[?] unverified:      ${String(unverified).padStart(5)} (${pct(unverified)}%) [Mapped by static analysis/kb]`);
  console.log(`[-] pending:         ${String(pending).padStart(5)} (${pct(pending)}%) [Awaiting port & harness tests]`);

  printHeader(`Topological Level Breakdown (Layers 0..${summary.maxTopoLevel})`);
  const levelCounts: Record<number, { total: number; verified: number; ready: number }> = {};
  for (let l = 0; l <= summary.maxTopoLevel; l++) {
    levelCounts[l] = { total: 0, verified: 0, ready: 0 };
  }

  const verifiedVas = new Set(
    functions.filter(f => f.status === 'diff-verified').map(f => `${f.module}:${f.va.toLowerCase().slice(2)}`)
  );

  for (const fn of functions) {
    const stat = levelCounts[fn.topoLevel];
    if (!stat) continue;
    stat.total++;
    if (fn.status === 'diff-verified') {
      stat.verified++;
    } else {
      // Check if all internal callees are verified
      const unverifiedCallees = fn.callees.filter(c => !verifiedVas.has(c.toLowerCase()));
      if (unverifiedCallees.length === 0) {
        stat.ready++;
      }
    }
  }

  console.log(` Level | Functions | Verified | Unblocked Ready | Progress`);
  console.log(`-------+-----------+----------+-----------------+---------`);
  for (let l = 0; l <= Math.min(10, summary.maxTopoLevel); l++) {
    const s = levelCounts[l];
    const bar = Math.round((s.verified / (s.total || 1)) * 20);
    const barStr = `[${'#'.repeat(bar)}${'-'.repeat(20 - bar)}]`;
    console.log(
      `   ${String(l).padStart(2)}  |   ${String(s.total).padStart(6)}  |   ${String(s.verified).padStart(5)}  |     ${String(s.ready).padStart(6)}      | ${barStr} ${(s.verified / (s.total || 1) * 100).toFixed(1)}%`
    );
  }
  if (summary.maxTopoLevel > 10) {
    let higherTotal = 0;
    let higherVerified = 0;
    let higherReady = 0;
    for (let l = 11; l <= summary.maxTopoLevel; l++) {
      higherTotal += levelCounts[l].total;
      higherVerified += levelCounts[l].verified;
      higherReady += levelCounts[l].ready;
    }
    console.log(
      ` 11..${summary.maxTopoLevel}|   ${String(higherTotal).padStart(6)}  |   ${String(higherVerified).padStart(5)}  |     ${String(higherReady).padStart(6)}      |`
    );
  }

  printHeader(`Next Work Orders: Unblocked Level 0 Leaf Functions (Top 12)`);
  const level0Ready = functions
    .filter(f => f.topoLevel === 0 && f.status === 'pending')
    .sort((a, b) => b.callers.length - a.callers.length);

  console.log(`Found ${level0Ready.length} pending leaf functions with 0 internal dependencies.`);
  console.log(`Ranked by number of inbound callers (highest fan-in first):\n`);
  console.log(`  VA          Module     Size   Callers  Name`);
  console.log(`  ----------  ---------  -----  -------  ---------------------------------------`);
  for (const fn of level0Ready.slice(0, 12)) {
    console.log(
      `  ${fn.va}  ${fn.module.padEnd(9)}  ${String(fn.size).padStart(4)}B  ${String(fn.callers.length).padStart(7)}  ${fn.name}`
    );
  }
  console.log(`\n========================================================================\n`);
}

main();
