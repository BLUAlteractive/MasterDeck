# B012 — Pure five-card evaluator implementation report

29 October 2026. **Implemented and validated locally and on hosted CI; ready for review.** Implementation `0007ef2` is in [draft PR #11](https://github.com/BLUAlteractive/MasterDeck/pull/11); [hosted CI](https://github.com/BLUAlteractive/MasterDeck/actions/runs/41000211835) passed both required jobs. This is the five-card library, not a complete playable poker game. Existing B005/B010/B011 external/product acceptance gaps remain open.

## Changed files

- `packages/game-poker/src/index.ts`: pure validated face-only evaluator, conventional category/full tie-vector/exact integer rank result, immutable outputs and three-way comparison. No UI/network/database/ownership/rarity/RNG input.
- `packages/game-poker/src/evaluator.test.ts`: 40 targeted/property cases covering all categories, kicker positions and dominance, wheel/royal/no-wrap, all 120 input permutations and 24 suit permutations per category, ties/antisymmetry, frozen inputs/results, later input mutation and malformed/duplicate/sparse/forged inputs in either comparison operand.
- `packages/game-poker/src/evaluator.exhaustive.test.ts`: every 2,598,960 unordered five-card hand, all nine category totals, 7,462 collision-free classes, ordered equivalence ranks and exact physical suit multiplicities. Ninety-second per-test bound; always part of normal unit/CI checks.
- `packages/game-poker/test/pattern-oracle.ts`: independently constructed category rank patterns and lexicographic reference order; no production classifier/encoder import and excluded from the package production build.
- `package.json`: `pnpm test:poker:exhaustive` rerun command. No dependencies/lockfile changes or installs are needed.
- `packages/game-poker/README.md`: usage, rank semantics, mathematical/source evidence, expected frequencies, limits and recovery.
- README, DECISIONS, acceptance matrix, backlog status and this report: implementation evidence and remaining boundaries.

## Actual validation

- Targeted evaluator/exhaustive Vitest run passed **41 cases** in two files. All **2,598,960** physical hands matched the independent rank-pattern oracle; category totals and every class/order/multiplicity assertion passed.
- `pnpm ci:quality` passed **122 cases in 21 files**, formatting/lint/strict types and **11 workspace builds**. The final rerun also passed after adding the explicit later-input-mutation assertion and documentation.
- `pnpm test:poker:exhaustive --reporter=json --outputFile=/tmp/deckforge-b012-exhaustive-results.json` passed; the dedicated exhaustive case took **3,952.9 ms** on this machine. This is observed local test runtime, not a service throughput or hosted/native performance claim.
- Review caught a parameterized-test issue where malformed arrays could be expanded as test arguments; fixtures are wrapped as objects so actual arrays reach the function. Sparse-array validation uses `Array.from` so holes cannot be skipped. The test oracle uses ES2022-compatible array operations. No unsafe type suppression was added.
- `pnpm ci:audit` passed the high/critical gate; the inherited single low advisory remains.
- A compiled-package consumer smoke (`pnpm --filter @deckforge/game-poker exec node -e ...`) loaded the actual CommonJS export, verified royal-flush classification and wheel-versus-six comparison, and passed. Production build output contains only `index.js` and `index.d.ts`; the test oracle is not emitted.
- Whitespace and local documentation-link checks passed.
- Hosted logs confirm **122 cases in 21 files**, **11 builds**, and **51 database regression cases in eight files before and after rollback/reset/reseed**. Quality checks and Dependency audit both passed. The exhaustive test runs inside that hosted unit suite; no local database rerun is inferred from these hosted results.
- The running local API health check passed and web preview returned HTTP 200. No new game screen or live visual/device test is claimed.

No local database-suite rerun or native device/export run is claimed for this pure library ticket. No schema, stored feature, platform binding or mobile UI changed. Existing hosted CI still runs the isolated database regression suite in addition to quality/audit. No migrations, persisted-state rollback, private credentials or external production mutation are involved.

## Scope, risks and next ticket

The exact rank key is not a dense conventional ordinal or Evolved score; those distinctions are documented and no scoring policy changes are proposed. The library accepts canonical faces only, so collected rarity, paid display skins and card-instance metadata cannot alter Classic outcomes. Server authority for dealt faces and settlement is unchanged; a client evaluation is not authorization.

The constructive oracle is independent of the production classification algorithm and source-backed by [traditional poker rules](https://www.pokerstars.com/poker/games/rules/hand-rankings/?no_redirect=1) and [published combinatorial frequencies](https://www.math.utah.edu/~treiberg/M3074StudEg.pdf). It is not an externally certified third-party engine. Per-hand validation/allocation is deliberate at this stage; future performance work must preserve the exhaustive checks. Rules beyond standard 52-face high poker are unsupported.

B013 — Best 5 of 7 is the next smallest ticket. Betting, shuffling, room protocols, private projection, chip settlement, Evolved scoring and complete-game/device acceptance remain later work. Revert the application/library commit to remove B012; no data recovery is needed.
