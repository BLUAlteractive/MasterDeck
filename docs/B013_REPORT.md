# B013 — Best five of seven implementation report

29 October 2026. **Implemented and locally validated; hosted validation pending.** This is a pure engine library change, not a playable table or settlement feature. Existing provider/device/product acceptance gaps remain open.

## Changed files

- `packages/game-poker/src/five.ts`: B012's existing five-card implementation moved byte-for-byte; root public exports and behavior retained.
- `packages/game-poker/src/index.ts`: re-exports five/seven modules without a circular module dependency.
- `packages/game-poker/src/seven.ts`: strict seven-face validation, all 21 candidate evaluations, every equally best Classic selection, stable canonical display order, deeply frozen outputs, fixed safe error and three-way comparison.
- `packages/game-poker/src/seven.test.ts`: 27 focused/property cases including 50,000 generated hands, 500 complete tie-selection checks, 4,999 forward/reverse reference comparisons, all category/edge cases and 5,040 input permutations of a multi-choice hand.
- `packages/game-poker/test/seven-reference.ts`: test-only direct rank/suit classification, independent of B012/production seven-card code; separate bitmask subset traversal for complete tie checks.
- `package.json`: `pnpm test:poker:seven` repeatable verification command. No dependency or lockfile change/install is required.
- `packages/game-poker/README.md`, README, DECISIONS, acceptance matrix, backlog status and this report: API/source evidence, scope, actual results, no settlement/complete-game claims.

## Actual verification

- `pnpm test:poker:seven`: **27 cases passed**. The 50,000 deterministic fixtures matched the independent direct reference in category and complete tie vector. The corpus covered all nine categories and all 21 winning subset positions; complete tied selections matched on 500 samples.
- `pnpm ci:quality`: **149 cases in 22 files**, formatting/lint/strict types and **11 workspace builds passed**. This includes B012's unchanged exhaustive 2,598,960-hand/7,462-class regression.
- `pnpm ci:audit`: passed the high/critical gate; one inherited low finding remains.
- Compiled-package consumer smoke (`pnpm --filter @deckforge/game-poker exec node -e ...`): loaded real package exports, verified legacy five-card wheel behavior, three equally best seven-card quad/kicker choices and a shared-board royal tie. Passed.
- A direct source-byte comparison against the previous Git revision confirmed B012's implementation was moved without changes. All prior B012 cases remain passing.
- Final whitespace and local documentation-link checks passed. Existing local API health returned ok and web preview returned HTTP 200; no new game screen or live visual acceptance is claimed.

No local database suite, native export/compile or live browser/device run is claimed for this pure library ticket. No API, mobile flow, schema, persisted state, runtime RNG or platform integration changes. Hosted CI will independently run its existing isolated database regression suite; that does not imply a local DB rerun. No migration/data rollback is needed; revert this code/export/script change to remove B013.

## Semantics, risks and next work

The API evaluates exactly seven canonical faces, with no mandatory hole-card usage, rarity or cosmetic inputs. Stable canonical ordering only chooses output representation; suits never break ranking ties. All tied best subsets are returned so callers do not silently choose personal-card attribution. Evolved must independently score all 21 candidates under B023, not only the returned Classic winners. Client-evaluated ranks never authorize results, chips or grants.

The [standard Hold'em reference](https://www.pokerstars.com/poker/learn/lesson/texas-holdem-rules/?scroll=null) supplies the best-five rule. The test reference is independently implemented using direct rank/suit classification and imports no production evaluator/encoder. It is not an externally certified library. Generated deterministic samples do not constitute full seven-card enumeration; all 133,784,560 hands were not evaluated. The test sampler is not a secure runtime shuffle/deal source.

The acceptance matrix now distinguishes completed seven-card ranking/tie detection from still-open actual split-pot allocation/settlement. A comparison result of zero does not distribute chips or establish eligibility. Public/private outcome projection is B017/B020 work; internal best-card selections must not become unfiltered room broadcasts.

Next smallest ticket: **B014 — Poker state machine**. Legal actions, dealing/shuffle authority, replay, pots, hidden-card privacy and full-game/device acceptance remain separate. Pending R-11 seed disclosure/privacy policy must be respected before exposing shuffle evidence; B013 adds no such evidence or policy.
