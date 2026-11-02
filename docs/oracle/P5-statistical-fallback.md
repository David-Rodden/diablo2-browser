# P5.5 Statistical Fallback (temporary)

`tools/oracle/lib/stat-tests.ts` (two-sample Kolmogorov–Smirnov, chi-square homogeneity) compares
**distributions** of probabilistic outcomes between the original game and the TS server when the
individual RNG draws cannot be aligned yet. Tests: `tests/oracle/stat-tests.test.ts`.

> [!IMPORTANT]
> A statistical pass is **not** parity. The acceptance criterion for every mechanic remains
> frame-exact agreement in `tools/oracle/diff.ts` (including unit seed columns). Each use of this
> fallback must be listed below together with the RNG-alignment work item that retires it.

## Usage rules

1. Collect ≥ 10⁵ samples per side (e.g. `dmg[].raw` rolls from many oracle runs with different
   `-seed`, versus the replica over the same seeds/scenarios).
2. Continuous/ordinal outcomes (damage rolls, durations): `ksTwoSample`; categorical outcomes
   (hit/miss, crit, block, dodge, drop quality): `chiSquareHomogeneity`.
3. Fail threshold: `p < 0.001`. Report statistic, p, n, m.
4. Register the use in the table below **in the same change**.

## Why it is needed today

The replica has a single game-wide `D2Rng` stream (`GameInstance.rng`, see `P0-audit.md` §3),
while 1.13c draws from per-unit `D2SeedStrc` streams (`unit+0x20`; oracle trace columns
`seedLo`/`seedHi`) and the game stream (`pGame+0xD0`, trace key `gs`). Until per-unit streams
are ported, damage/to-hit/crit/block rolls cannot match draw-for-draw.

## Registry (fallback uses → retirement work item)

| Mechanic | Test | Retired by |
|---|---|---|
| _(none yet)_ | | Port per-unit `D2SeedStrc` streams (`SUNIT_AllocUnitData` → `ITEMS_AllocItemData`/unit seed init, `D2Common 0x6FD7A7A6`) and draw order per `kb/combat/d2game-sunitdmg-rng-rolls-113c.md`; then compare `seedLo/seedHi` columns frame-exactly. |
