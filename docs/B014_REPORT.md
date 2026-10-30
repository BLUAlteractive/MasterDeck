# B014 — Poker state machine

Implemented a pure, immutable Classic NLHE reducer with 2–6 seats, blinds, clockwise deal/burns, strict turns and wager sizes, short-all-in reopening, automatic streets/runouts and private deterministic replay. One canonical deck is shuffled using an injected bounded source; no collection metadata affects probability.

Changed: game-core deck helpers/exports; game-poker reducer/exports and ten focused tests; decisions, this report and backlog status. Acceptance covers invalid/stale commands, heads-up order, big-blind option, incomplete/cumulative raises, chip conservation and replay. No wallets or public room admission are implemented.

Validation: `pnpm build:packages`; `pnpm exec vitest run packages/game-poker/src/hand.test.ts` (10 passed). Full `pnpm ci:quality` is the commit gate; hosted validation is visible on the draft PR. No persisted feature or migration in this ticket.

Risk: private state includes every hidden card and must never be sent to clients. Public seed disclosure remains R-11. Next: B015 side pots and splits.

Local commit gate passed: `pnpm ci:quality` — 159 cases in 23 files, all lint/format/type checks and 11 builds. An initial internal mapped-type error was corrected before this successful run.

Hosted validation: [draft PR #13](https://github.com/BLUAlteractive/MasterDeck/pull/13), [CI run](https://github.com/BLUAlteractive/MasterDeck/actions/runs/41005766987) — Quality checks and Dependency audit passed.
