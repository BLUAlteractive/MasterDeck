# B023 — Experimental Evolved scoring

Implemented the owner's explicit Option A approval: `EVOLVED_A_EXPERIMENTAL_V1` uses the approved Straight table and uniform floor quantization in other categories. All 21 candidates include only eligible included hole instances; level, rarity, earned style, pocket pair and explicitly configured published-series effects are integer components capped at 1,200. Neutral board/unused holes/purchased display fields do not contribute. Numerical ties fall back to exact conventional rank and then split.

Changed files: game-poker `evolved-ranks.ts`, `evolved.ts`, `evolved.test.ts`, index exports; MASTER_SPEC's approved experimental mapping/corrected example; policy proposal, decisions, status and this report. No API, migration or launch enablement. Trusted callers must obtain metadata/publication configuration from verified server records; this package is not an eligibility proof or client input handler.

The lazily constructed 7,462-class table is checked against the independent existing rank-pattern oracle. Classic's evaluator is unchanged and does not invoke Evolved tables. Rules/effects and result structures are frozen. The approved example is 4,450 + 1,050 = 5,500 versus a neutral 5,210 Flush; tests use valid separate candidates and additionally verify a real shared-board upset. The 5,210 Flush ranks cannot supply three king-Straight board ranks, so that literal pair is not misrepresented as a shared-board fixture.

Focused `pnpm --filter @deckforge/game-poker build` and `pnpm exec vitest run packages/game-poker/src/evolved.test.ts` passed eleven cases, including all rank classes, 1,000 seeded candidate enumerations, neutral equivalence to Classic, board/unused-hole exclusions, skin/order invariance, eligibility rejection, cap, tie collisions and the algebraic two-category bound. Final quality evidence follows below. No persisted code changed; Prisma validation and latest B022 integration evidence remain applicable.

Live Evolved admission remains disabled pending B026 diagnostics and product balancing review. This ticket establishes a deterministic experimental engine, not proven fairness. Next ticket: B024 explanations and accessibility.

Final `pnpm ci:quality` passed **215 tests in 32 files**, **11 builds**, formatting, lint and strict/test types (`/tmp/deckforge-b023-quality.log`). `pnpm db:validate` and `git diff --check` passed. No persisted implementation changed, so a new destructive DB cycle was unnecessary for this ticket.
