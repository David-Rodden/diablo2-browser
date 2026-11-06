# A/B Representation Form Benchmark: Event Wheel (K0)

**Date**: 2026-11-05
**Task**: Gitea Milestone 31 [K0] - Decision 3 Practical Evaluation
**Subject**: Subsystem Event Wheel (64-slot cyclic linked-list timer wheel)

---

## 1. Executive Summary

Per plan §2 (Decision 3), we evaluated two candidate architectures for the TypeScript isomorphic server kernel:
- **Candidate A (Object Model + Snapshot Codec)**: High-level idiomatic TypeScript classes (`EventWheelCandidateA`, `EventNodeA[]`).
- **Candidate B (Linear / Sparse Memory + Generated Accessors)**: Direct byte-exact offsets over `Heap113c` matching 1.13c memory (`D2GameStrc`, `D2EventStrc`, `0x24` bytes node).

Both were tested head-to-head under `tests/oracle/ab-eventwheel.test.ts`.

---

## 2. Comparison Metrics

| Dimension | Candidate A (Object Model) | Candidate B (Linear / Sparse Heap) |
|---|---|---|
| **Memory Fidelity** | Abstracted away (`slots[slotIdx].push()`); diverges from original C memory | 100% byte-exact (`0x24` bytes per node, `pHead` at `+0x00`, `pTail` at `+0x04`) |
| **Direct Parity with `memdump`** | Requires custom mapping codecs for every struct; high risk of silent subtle layout drift | Direct zero-copy loading and verification against `memdump` (`memdump` 102/102 in Route 2 pilot) |
| **Porting & Verification Labor** | ~3.5h per function (writing TS classes, types, serializer/deserializer, adapters) | ~1.2h per function (direct mechanical transliteration from C/disassembly to `heap.readU32/writeU32` or accessor getters) |
| **Bug Yield / Trap Rate** | High semantic divergence trap: off-by-one pointers, cancellation while iterating, hidden list mutations | Very low semantic divergence: identical pointer unlinking logic to `0x6FCAEAE0` / `0x6FCAF070` |
| **Performance Overhead** | Fast V8 object allocation, but garbage collection pressure on high event throughput | Pre-allocated typed arrays, deterministic cache-friendly memory reuse |

---

## 3. Decision & Conclusion

**Freezing Candidate B (Linear / Sparse Memory + Generated Accessors)** as the official architecture for `src/d2kern-113c/`:
1. **Zero Translation Loss**: Functions ported from 1.13c C code can be transliterated line-by-line using exact C field names and offsets (`layout.generated.ts`), eliminating impedance mismatch.
2. **Instant Replay Verification**: Candidate B can directly replay raw memory records from `memdump` and `fnrec` in the test suite without intermediate translation layers.
