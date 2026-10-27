# Milestone-by-milestone execution

A “sprint” below is a **workstream grouping**, not a promised two-week period. Scope measured by acceptance rather than an invented date.

| Milestone | Required ticket families | Shippable demonstration / gate |
|---|---|---|
| M0 Foundation | B001–B005 | Typed monorepo, CI, local DB, identity scaffolding, design decisions |
| M1 Collection | B006–B011 | Idempotent starter grant, card instance/catalog/provenance/active loadout, gallery |
| M2 Pure Poker | B012–B017 | Oracle-tested five and seven-card ranking, state machine, betting, side pots, legal turn order |
| M3 Real-time Poker | B018–B022 | Multi-device match, hidden-information projection, reconnect and settlement ledger |
| M4 Evolved | B023–B026 | Versioned power calculation, plain-English explanation, 100k simulations, fairness reviews |
| M5 Spades | B027–B031 | Four-person full game, trick validation, bids, nil/bags, teams, reconnect |
| M6 Collection Economy | B032–B038 + B060–B071 | Fusion, three-ledger wallets, validated activity, earned packs, purchased fixed cosmetics, functional Printing Press and atomic in-place upgrades |
| M7 Commerce and LiveOps | B039–B046 + B072–B079 | Verified IAP, admin, tournaments, **curated original nearby drops and park/trail laps**, moderation |
| M8 Production | B047–B054 + B080–B082 | E2E mobile QA, proof/spoof drills, safe-route review, privacy/security, audits, soft launch |
| M9 Future adapters | B055–B059 | Brand-partner promotions, AR, blockchain, additional games: interfaces only |

## Branch and QA policy

- One ticket per pull request unless truly coupled.
- Each PR includes design decision(s), acceptance ID(s), what tests ran, and screenshots/recordings for UI.
- No merge on failing deterministic domain tests, failed migration validation, exposed private card data, unresolved duplicate grants or purchase/refund errors.
- Run independent seeded simulations and property tests; compare poker rankings to an independently sourced known-good evaluator.
- App distribution occurs only after legal/app-store and privacy gates are reviewed, not based on engineering CI alone.

## First ten pull requests

1. `B001` monorepo and developer environment.
2. `B002` CI and test runners.
3. `B003` architecture contracts and ADR.
4. `B004` database migration scaffold.
5. `B005` auth and authorization.
6. `B006` face/series catalog.
7. `B007` atomic starter grant.
8. `B008` ownership and audit events.
9. `B009` loadout validator.
10. `B012` standalone five-card poker evaluator.

Each is a separate Codex instruction using `prompts/START_HERE.md` as a template.
