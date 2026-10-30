# Classic five-card poker — B012

`@deckforge/game-poker` evaluates exactly five distinct canonical face IDs from `@deckforge/game-core`. It is pure TypeScript with no UI, network, database, randomness, ownership or rarity input. A future server actor must establish the dealt faces and authority; a client result never authorizes settlement or rewards.

```ts
import {
  evaluateFiveCardHand,
  compareFiveCardHands,
} from '@deckforge/game-poker';

const wheel = evaluateFiveCardHand(['A-S', '2-H', '3-D', '4-C', '5-S']);
// category: STRAIGHT, categoryIndex: 4, tiebreak: [5]

const comparison = compareFiveCardHands(
  ['6-S', '2-H', '3-D', '4-C', '5-S'],
  ['A-S', '2-H', '3-D', '4-C', '5-S'],
);
// 1: left wins; -1: right wins; 0: exact conventional tie.
```

Each hand rejects duplicates independently. Opponents may share community faces across compared hands. Wrong length, unknown IDs, jokers, numeric/card-object inputs and sparse arrays throw `InvalidPokerHand` with code `INVALID_FIVE_CARD_HAND` and a fixed message. Runtime validation supplements the `readonly FaceId[]` TypeScript signature. No input is mutated; the returned rank and tie vector are frozen and do not retain input-array references.

## Rank contract

`categoryIndex` follows MASTER_SPEC §4.4's conventional category order. The tie vector lists significant ranks first, with Ace normally 14 and a wheel represented by top rank 5. Royal flush is the ace-high straight flush, not a tenth category. Suits never break an otherwise equal conventional rank. These rules follow the [operator's traditional poker ranking reference](https://www.pokerstars.com/poker/games/rules/hand-rankings/?no_redirect=1).

| Index | Category        | Tie vector, strongest component first        |
| ----- | --------------- | -------------------------------------------- |
| 0     | HIGH_CARD       | All five ranks descending                    |
| 1     | ONE_PAIR        | Pair rank, then three descending kickers     |
| 2     | TWO_PAIR        | Higher pair, lower pair, kicker              |
| 3     | THREE_OF_A_KIND | Trip rank, then two descending kickers       |
| 4     | STRAIGHT        | Top rank; 5 for A-2-3-4-5                    |
| 5     | FLUSH           | All five ranks descending                    |
| 6     | FULL_HOUSE      | Trip rank, then pair rank                    |
| 7     | FOUR_OF_A_KIND  | Quad rank, then kicker                       |
| 8     | STRAIGHT_FLUSH  | Top rank; 14 for royal, 5 for a suited wheel |

`strength` is an exact higher-is-better integer comparison key. It encodes the category followed by five base-15 tie digits, padding unused positions with zero. It preserves all kickers without rank collisions and remains within JavaScript's exact integer range. It is sparse: it is **not** a 1–7,462 ordinal, the Evolved 0–499 summary, an Evolved power score, a balance or an award. B023 must implement its separately versioned bounded scoring formula rather than substituting this key. No Evolved logic or paid/earned card attributes are present in this evaluator.

## Exhaustive validation

Run from the repository root:

```bash
pnpm test:poker:exhaustive
pnpm ci:quality
```

The dedicated command builds the shared packages and runs the exhaustive test. The same exhaustive test runs unconditionally in the normal unit suite and existing CI quality job; it is not a skipped/manual benchmark. Its own 90-second deadline leaves CI headroom without changing global test timeouts.

A test-only oracle outside production `src` constructs rank patterns independently per category, then orders their full conventional vectors. It does not import the runtime classifier or comparison-key encoder, and no third-party evaluator code/data is copied or installed. Its class totals follow combinations of ranks and multiplicities: 1,277 each for high card/flush, 2,860 pairs, 858 each two-pair/trips, ten each straights/straight flushes, and 156 each full houses/quads. There are 7,462 classes in total.

Every unordered five-card subset of the canonical 52 faces is evaluated through the public validated function. Tests compare its category and full tie vector with the independent pattern, require each equivalent hand to keep one strength, reject collisions, verify that strength order matches all 7,462 reference ordinals and verify each class's suit multiplicity. Separate invariance tests cover all 120 input orders and 24 global suit permutations for a representative of each category, plus explicit kicker/category/wheel/royal/invalid-input cases.

The disjoint physical-hand frequencies match [Treibergs' University of Utah combinatorial calculation](https://www.math.utah.edu/~treiberg/M3074StudEg.pdf):

| Category        | Physical hands | Rank classes | Physical hands per class |
| --------------- | -------------: | -----------: | -----------------------: |
| HIGH_CARD       |      1,302,540 |        1,277 |                    1,020 |
| ONE_PAIR        |      1,098,240 |        2,860 |                      384 |
| TWO_PAIR        |        123,552 |          858 |                      144 |
| THREE_OF_A_KIND |         54,912 |          858 |                       64 |
| STRAIGHT        |         10,200 |           10 |                    1,020 |
| FLUSH           |          5,108 |        1,277 |                        4 |
| FULL_HOUSE      |          3,744 |          156 |                       24 |
| FOUR_OF_A_KIND  |            624 |          156 |                        4 |
| STRAIGHT_FLUSH  |             40 |           10 |                        4 |
| **Total**       |  **2,598,960** |    **7,462** |                          |

The forty straight flushes include four royal flushes. Category counts alone are not sufficient proof of kicker correctness; the independent full-vector and rank-order comparisons supply that additional evidence. This is an independently implemented local oracle, not certification by an external evaluator vendor.

## Scope and recovery

B013 owns best-five-of-seven selection. B014 onward own shuffling/dealing, legal commands, betting, replay, privacy, pots and authoritative rooms. This ticket cannot play or settle a match and adds no mobile screen, persisted state, API, environment setting, dependency or migration. Reverting the code/export/script removes it; no data rollback or database reset is needed.
