# Classic poker ranking — B012/B013

`@deckforge/game-poker` provides exact five-card ranking and best-five-of-seven selection using canonical face IDs from `@deckforge/game-core`. It is pure TypeScript with no UI, network, database, randomness, ownership or rarity input. A future server actor must establish the dealt faces and authority; a client result never authorizes settlement or rewards.

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

## Best five of seven — B013

```ts
import {
  evaluateSevenCardHand,
  compareSevenCardHands,
} from '@deckforge/game-poker';

const result = evaluateSevenCardHand([
  'A-S',
  'A-H',
  'A-D',
  'A-C',
  'K-S',
  'K-H',
  'K-D',
]);
// result.rank: FOUR_OF_A_KIND, tiebreak [14, 13]
// result.bestFives: three equivalent selections, one for each available king kicker.
```

`evaluateSevenCardHand` requires exactly seven distinct canonical IDs and evaluates every one of the 21 five-card subsets with the B012 evaluator. It returns `{rank, bestFives}`. Each five-card selection and every enclosing output layer is frozen. All equally best Classic selections are retained, with cards/subsets ordered by the shared canonical face order. Reordering input leaves the complete result unchanged. That stable display order gives no suit a winning rank; `compareSevenCardHands` returns 1, -1 or 0 solely from exact conventional strength, ignoring unused sixth/seventh cards.

The [Hold'em rules](https://www.pokerstars.com/poker/learn/lesson/texas-holdem-rules/?scroll=null) permit the best five from the available seven; this helper imposes no hole-card quota. Its tests include board-only play and using one or both hole cards. This is not an Omaha evaluator. Shared board cards across two comparison operands are valid, while each operand must independently contain seven unique faces. The server's later dealing/room layer owns physical table-wide uniqueness, card visibility and player eligibility.

Invalid lengths (including five/six/eight), unknown IDs, duplicate faces, sparse arrays and forged card objects raise `InvalidSevenCardHand` / `INVALID_SEVEN_CARD_HAND` with a fixed message. All seven faces are validated before selecting a winner, even when a royal flush is already present. B012's five-card exports, error contract and algorithm are unchanged; the implementation moved byte-for-byte to `src/five.ts` behind the same package root exports, avoiding a circular import with `src/seven.ts`.

`bestFives` contains only the conventional winners. **B023 must still score all 21 candidates for Evolved**, including candidates below the Classic maximum; it must not add bonuses to one arbitrary representative or assume all returned choices use the same personal hole cards. B017/B020 own explanations and authorized per-viewer projections; this internal result is not a room broadcast payload. No cards are dealt, events emitted or chips split by either comparison helper.

Run `pnpm test:poker:seven`. B013's test-only direct reference classifies each seven-card hand directly from its rank/suit counts, without calling B012 or the production seven-card routine. On 50,000 deterministic fixture seeds, tests require the full category/tie-vector to match, exercise all nine categories and cover all 21 subset positions as winners across the corpus. A separate traversal of the 128 possible seven-bit masks checks every equally best subset on 500 samples. Comparisons are checked in both directions against reference order on 4,999 generated pairs. Additional cases cover double trips, three pairs, six/seven-card flushes/runs, all 5,040 input permutations of a multi-choice hand, all 24 suit permutations per category, immutable outputs and invalid inputs.

The fixture sampler is deterministic and noncryptographic, test-only and excluded from production exports. It is never a trusted shuffle or deal source. This is generated/reference coverage, **not** enumeration of all 133,784,560 seven-card sets or certification by a third-party evaluator. The targeted command and ordinary CI unit suite both run these tests; existing B012 exhaustive checks remain enabled.

## Scope and recovery

B012/B013 cover ranking and selection only. B014 onward own shuffling/dealing, legal commands, betting, replay, privacy, pots and authoritative rooms. This ticket cannot play or settle a match and adds no mobile screen, persisted state, API, environment setting, dependency or migration. Reverting the code/export/script removes it; no data rollback or database reset is needed.

## Hand lifecycle, allocations and safe outcomes — B014–B017

The package now also exports immutable `createPokerHand`/`startPokerHand`, `reducePokerHand`, `legalPokerActions`, private `replayPokerHand`, `allocatePokerPots` and allow-list `projectPokerHand`. The ranking APIs above remain unchanged. Engine state/replay includes secret holes and deck order and must never be sent to clients. Production CSPRNG and database authority are API responsibilities. Injected fixture randomness is not a production proof source.

Run `pnpm test:poker:harness` for the deterministic 1,000-hand regression, or append `--seed 874` to reproduce a single case. The generator lives outside runtime output. See [engine/room contract](../../docs/POKER_ROOMS.md) for action semantics, safe outcome fields, persistence boundaries and remaining admission/settlement gates.
