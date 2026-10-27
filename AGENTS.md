# DeckForge project rules for Codex

Read `MASTER_SPEC.md`, `docs/EXPLORATION_AND_PRESS.md`, `docs/DECISIONS.md`, `backlog/BUILD_BACKLOG.csv` and the assigned ticket before writing code. `MASTER_SPEC.md` is product authority; unresolved ambiguity is recorded in DECISIONS, not silently improvised.

## Architecture
- TypeScript strict mode, pnpm monorepo. Domain rules are pure functions with no UI/network/DB dependencies.
- Server is authoritative for shuffled faces, deals, legal commands, match settlement, chips, rewards, card grants, inventory and walking validation. Never trust client-calculated wins or balances.
- One 52-face virtual shuffle per poker hand. Ownership appearance is resolved after dealing; do not concatenate player-owned decks or alter face probability based on rarity.
- Two explicitly distinct poker rulesets: standard Classic (never rarity bonuses) and Evolved (versioned integer power formula). Spades Classic suit/trump is never overridden by rarity.
- A card's unique `instanceId` persists; history is append-only. Fusion consumes exactly five eligible copies and creates exactly one new instance in one transaction. Protect with idempotency and row locking.
- Poker event payloads must never reveal other players' hidden cards. Only the server may advance room state; store stateVersion and rulesetVersion.

## Business / safety boundaries
- No cash-out, real-money betting, NFT staking/trading, crypto issuance, purchased wagering chips, paid functional press boosts, or real-world prize payout.
- Never exchange currencies: Play Chips (earned play only), Trail Credits (earned only from validated steps/accessible quests; functional screens/earned packs), Store Gems (paid cosmetics only). Purchased cosmetics may not alter earned rarity, level, playStyleFamily, printing speed, route rewards, fusion eligibility or Evolved bonuses.
- Printing Press mutates an eligible original card instance in place upon verified steps + earned functional screen + supplies, with atomic screen consumption, persisted job version and append-only provenance. Five-card fusion is a separate alternate path; do not conflate them.
- Single canonical activity source ledger feeds independent Trail Credit and ONE Press Job allocations; never double-credit repeats across HealthKit, Health Connect, devices or sessions.
- V1 includes opt-in, foreground-only curated public trail loops and safe unbranded POI drops; prove checkpoint sequence (not geofence alone) and retain no raw route history beyond short-lived verification. No brand implying sponsorship.
- No copied Bicycle/Niantic/Pokémon/trademark artwork or brand names in shipped assets. `DeckForge` is a placeholder name until cleared.
- Do not introduce AR, NFT, marketplace or partner dependencies on critical launch path. A simple Explore map/list for curated v1 trails and public-category drops IS in core scope, using a legally licensed map/data provider.
- Real-money fixed-content cosmetic packs are permitted subject to verified platform billing; earned randomized discovery packs show current odds. Paid randomized packs disabled until legal/policy review and required odds disclosure. Never invent a trusted step or location proof source.

## Development discipline
- Implement one small backlog ticket at a time. State files touched and acceptance criteria first; avoid broad unrelated changes.
- Use Zod / robust schema validation at API boundaries; use authorization and rate limits; avoid leaking user-specific details in logs.
- Provide unit/property/concurrency tests for financial, inventory, RNG, game-rules and idempotency changes.
- Add migrations, rollback plan, metrics/logging and docs for any persisted feature.
- Run lint/typecheck/test/Prisma validate relevant to touched code; report actual results without guessing.
- Never expose production credentials, commit secrets or execute production data mutations without approval.
- Update `docs/DECISIONS.md` when a choice differs from the baseline; seek product owner approval for scoring, paid economy or legal boundary changes.

## Task completion report
Return: summary; changed files; tests actually run/results; remaining risks; next smallest ticket. Treat green tests as necessary, not sufficient, for shipping.
