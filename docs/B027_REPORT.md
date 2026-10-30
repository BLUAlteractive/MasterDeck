# B027 — Spades deal and trick engine

Added a pure Classic Spades reducer in `packages/game-spades/src/index.ts` with four clockwise seats, fixed opposite partnerships, one validated canonical deck, thirteen cards per player, legal turn/follow-suit checks, the spades-broken lead restriction (including all-spades exception), trump/led-suit winners and winner-led next tricks. Immutable states preserve complete private replay. Face identity alone determines legality and winners; collection metadata has no input channel. Server RNG is injected through game-core. There is no poker, UI, network or database dependency.

Changed files: the package entry point, `tricks.test.ts`, decisions, status and this report. No migration or new dependency. B028 owns bidding/scoring; B029 owns authorized realtime projections and durable room integration. This private state must never be serialized wholesale to clients.

Validation: focused suite passed ten cases, including 1,000 complete seeded deals (52,000 accepted actions) replayed from genesis, 52 unique faces throughout, independent trick-winner reference, every dealer, follow-suit/lead/turn/version rejection, no fourteenth card, malformed input and frozen state. Fixture RNG is test-only. Initial quality check caught ES2023 `toSorted` in a test under the ES2022 target; corrected without widening the platform. Final full quality results are recorded below after completion.

Rules reference: [Pagat basic four-player Spades](https://www.pagat.com/auctionwhist/spades.html), checked 30 October 2026. No house scoring or live match policy is selected here. Next independent ticket: B028.

Final `pnpm ci:quality` passed formatting, lint, strict/test types, **191 unit tests in 30 files** and **11 builds** (`/tmp/deckforge-b027-quality-final.log`). The first sandboxed full test attempt could not bind its localhost HTTP fixture; rerunning with authorized test-server permissions passed. Prisma generation/type validation ran through the quality gate; no persisted code changed, so B022's 85-case-twice DB evidence remains the latest applicable integration gate. `git diff --check` passed.
