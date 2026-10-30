# DECKFORGE
## Independent Collectible Playing-Card Platform
### Business Plan, Product Requirements, Game Design, Technical Blueprint, and Codex / Astra Build Plan

**Working title:** DeckForge (placeholder only; conduct name and trademark clearance before use)  
**Document version:** 1.1 — 27 October 2026  
**Status:** Build specification / planning baseline; not an implemented product  
**Commercial scope:** Original IP at launch. Brand licensing, promotional collaborations, transferable NFTs, cryptocurrency, real-money prizes, and cash-out systems are **not** required to ship.  
**Primary platforms:** iOS and Android; web administration and optional read-only collector gallery.

> **Core investment thesis:** Build a persistent digital collection of individually identifiable playing cards that players can use across familiar tabletop games. The long-term platform asset is the collection, its history, and the rule engine—not any specific sponsored deck or game.

---

# 1. Executive Summary

DeckForge combines the accessibility of a standard 52-card deck with the appeal of collectible card games. A new player receives a complete playable base deck. Every collectible is a unique card instance with a rank, suit, visual series, back design, rarity, level, provenance, activity history, and potential evolution path. Players play Texas Hold'em and Spades, earn virtual rewards, improve their collections by combining duplicates or walking to run cards through a Printing Press, earn Trail Credits, open card packs, discover route rewards, complete thematic sets, and compete in seasons and tournaments. Future card games can share the same inventory and collection service.

The defining mechanic is **Evolved Hold'em**. Ordinary poker evaluates the best five of seven cards; Evolved Hold'em evaluates those same hand types but adds a bounded, transparent power score to the player's own cards. A premium straight can sometimes defeat an ordinary flush. A separate **Classic** mode uses completely traditional hand ranking so purists can play on equal terms. This split safeguards fairness and expands the audience.

Launch independently with original artwork, no required augmented-reality vendor, no outside brand deal, no blockchain wallet, no on-chain trading, and no real-money gambling. **Original, opt-in outdoor discovery, park-loop rewards and Printing Press walking upgrades are independent launch features**; licensed commercial drops, AR and on-chain provenance remain optional later adapters.

**Business model at launch:** free-to-play; real-money **fixed-content cosmetic card packs**, series and premium presentation; optional season pass; plus random **earned-only discovery packs** bought with Trail Credits earned through walking. Printing screens with functional upgrade recipes are earned or purchased **only with Trail Credits**; real-money screens may change their appearance but never confer game strength. Distinct currencies are nonredeemable. No cash-out, real-money wagering or NFT staking. Randomized real-money packs stay off pending policy/legal review and visible odds disclosures.

**Build strategy:** one TypeScript monorepo, one authoritative multiplayer backend, a shared rule-engine package, a mobile client, an admin console, and event-ledgered inventory. Use **Astra as product/architecture/review support if available**, and **Codex for incremental coding and tests**, without assuming a direct Astra-to-Codex product integration.

# 2. Product Vision, Problem, Market Position

## 2.1 Customer problem

Conventional mobile poker or spades apps offer repeatable matches, but often little enduring emotional value in the cards themselves. Collector card games offer progression but require players to learn a new ruleset. DeckForge bridges the two: players already understand card ranks and suits, while upgrades, distinctive artwork, rare backs, and a permanent archive encourage ongoing collecting.

## 2.2 Target audiences

1. **Social card players** — want quick, trusted Hold'em and Spades matches with friends.
2. **Digital collectors** — want artwork, numbered variants, scarcity information, set completion, and ownership history.
3. **Progression players** — enjoy fusing duplicates, achievement goals, seasonal rankings, daily quests, and walking-powered Printing Press progression.
4. **Traditional playing-card enthusiasts** — want vintage-inspired, aesthetically crafted editions, in-game card handling, and authentic rules in Classic mode.

Initial audience: adults aged 18+, English-language U.S. beta (commercial geographic rollout requires review). Avoid a youth-oriented gambling-like presentation.

## 2.3 Competitive context and differentiation

- **Classic poker/spades apps:** strong familiarity; DeckForge adds portable, evolving individual cards and collection goals.
- **Balatro:** shows how modifiers can reframe familiar poker scoring, but is a different solo roguelike product; DeckForge prioritizes multiplayer, persistent collectible ownership, and multi-game interoperability.
- **Pokémon TCG Pocket and collectible games:** emphasize acquisition and art; DeckForge leverages standard playing-card literacy instead of a proprietary battle ruleset.
- **Location-based games:** establish a pattern for movement-driven rewards; DeckForge's step incubation does not require AR or a mapping partnership.

Do not describe this as an existing licensed Bicycle / Niantic / Pokémon product. All comparator marks belong to their respective owners.

## 2.4 Positioning and message

**Positioning:** “The deck you collect. The cards you evolve. The games you already love.”  
**Value proposition:** One permanent collection, multiple games, meaningful upgrades, original collectible art, and both fair traditional and optional powered modes.

## 2.5 North-star metric and guardrails

**North star:** Weekly Engaged Collectors (WEC): unique players who both finish at least one valid match and perform at least one collection action (view, favorite, evolve, archive progress, or incubate) in a rolling seven-day window.

Guardrails: D1/D7/D30 retention; matches/player/week; match completion; average matchmaking wait; crash-free sessions; fraudulent inventory actions; organic-to-paid conversion; spending concentration; unfair-match reports; consent opt-in rates; chargebacks and refunds.

# 3. Scope and Release Strategy

## 3.1 Full independent version (production v1)

The goal is a **working, polished independent v1**, not a prototype consisting only of card images. It must support:

- Email/social authentication, profiles, avatars, guest trial and account linking, consent, settings, and deletion.
- Initial **52-card playable collection** with exactly one face identity per rank and suit, plus an ownership archive.
- Active collection management for up to **100 displayed/managed slots**; archived history and owned-card storage designed for more without destroying ownership.
- Original card series, individual card instances, fronts/backs, serial numbers, rarity tiers, six progression levels, collections and set completion.
- Duplicate fusion; **Printing Press card incubation/evolution** driven by verified steps; purchasable-with-earned-Trail-Credits printing screens; structured achievements, account XP, and seasonal progression.
- **Texas Hold'em Classic**, **Texas Hold'em Evolved**, **Spades Classic**, and casual friend/private rooms; authoritative matchmaking, turns, timeouts, resign/reconnect.
- Live tournament schedules, entry, brackets/leaderboard, result settlement, anti-cheat, audit history, admin dispute view.
- Three separate nontransferable wallets: *Play Chips* (play only), *Trail Credits* (earned by walking or equivalent accessibility quests; packs and functional press screens), and *Store Gems* (purchased cosmetics only).
- Pack Store for platform-billed **fixed-content cosmetic card packs** and Trail Credit-priced **earned-only randomized card packs**; disclosed contents/odds, packing/opening history, purchase verification, refund handling, and restore.
- **Opt-in Explore mode** with safe, original location-category drops and verified curated public park/trail laps; daily/weekly missions, push notifications, moderation/reporting/blocking, metrics, event logs, backup and restore.
- Administrative dashboard for card series, game rulesets, item grants, tournament operation, entitlements, abuse cases, feature flags, and analytics.

## 3.2 Later modules, designed now but not launch-blocking

- Blackjack, Tonk, Bid Whist, and additional card games as rule plug-ins.
- Card trading / gifting / marketplace subject to risk controls and platform review.
- Partner-branded retail drops, optional AR view, more complex multi-stop hunts, and large-scale expansion of the curated public trails catalog.
- NFC/QR redemptions from physical products and authorized sponsor promotions.
- External company licensing, co-branded collections and revenue-share reporting.
- Immutable public provenance anchoring, optional NFT interoperability, and wallet export **only after legal/product/store review**.
- Real-world prize programs only after independently approved promotion rules, jurisdictions, eligibility controls and tax obligations.

## 3.3 Non-goals for v1

No crypto token issuance; no real-world monetary value promises; no cash-outs; no peer-to-peer betting; no transferable high-value loot; no scraped social graph or user likes; no copyrighted film or brand images without rights; no dependence on an AR vendor. “Complete” means the above independent, operational product—not every partnership and experimental feature.

# 4. Game System and Design Rules

## 4.1 Card ontology

Separate the **face definition** (e.g., Queen of Hearts), **edition/series** (e.g., Midnight Foundry), and **owned instance** (e.g., UUID + serial number). This prevents confused rarity, duplicate card identities, and unsafe marketplace logic.

| Field | Example / rule |
|---|---|
| Face identity | `Q-H` (one of 52 rank/suit pairs); optional jokers remain out of initial poker/spades rules |
| Instance ID | Globally unique UUID, never reused; not automatically an NFT |
| Set / series | An original 52-card themed collection; series may contain variants |
| Front and back | Separate licensed/design asset IDs, versioned; defined combinations are validated |
| Edition serial | Sequence + print-run cap if explicitly minted as a capped edition |
| Rarity | Common, Uncommon, Rare, Epic, Legendary; published supply/rates when applicable |
| Evolution | 1–6; determined by back/trim evolution line, not rarity |
| Provenance | Granted, purchased, fused, earned, incubated, transferred (when permitted) |
| Lifetime stats | Hands participated, match wins, showdown appearances; audit-sourced |
| Ownership | `owner_user_id`, status, lock reason, version; transactions always atomic |

Monetized art must be **presentation-only**: a purchased `displaySkinId` never changes card level, earned rarity, earned `playStyleFamily`, fusion eligibility or Evolved score. Gameplay style matching uses the immutable earned card/template `playStyleFamily`, not the cosmetic skin shown on screen. Distinct cosmetic foil treatments cannot impersonate earned silver/gold evolution levels.

One player's *active gameplay loadout* always resolves to **52 unique ranks and suits**, even if the larger inventory contains duplicates. The 100-slot interface means collection management slots, not the ability to deal a rigged 100-card poker deck. Extra cards are retained in inventory or archive; do not silently delete anything over slot 100.

## 4.2 Six-tier visual evolution model

| Level | Back | Finish | Acquisition / next fusion |
|---|---|---|---|
| 1 | Blue | Standard | Starter/free drops; fuse five identical eligible L1 instances -> one L3 |
| 2 | Red | Standard | Earned drops/collections; fuse five eligible L2 -> one L4 |
| 3 | Blue | Silver trim | Fuse five eligible L3 -> one L5 |
| 4 | Red | Silver trim | Fuse five eligible L4 -> one L6 |
| 5 | Blue | Gold trim | Terminal blue branch |
| 6 | Red | Gold trim | Terminal red branch |

**Fusion contract:** five instances must match face, original series, back-color branch, source level and eligibility; cannot include a card locked in a game, tournament, escrow, or pending refund. They are consumed atomically and produce one new unique instance with links to all five parents. User confirms before fusion; dry-run preview shows all losses and resulting attributes. Rarity and art variants use documented output rules rather than hidden arbitrary boosts. The user’s original idea labels the blue sequence 1→3→5 and the red sequence 2→4→6; retain this explicitly, not an undocumented 1→2→3→4→5→6 chain.

**Printing Press walking evolution:** assign one eligible owned card to a Press Job, attach an owned screen of the matching branch/tier, and advance its imprint through accepted walking steps. An earned functional screen can enable the exact **same level transition** as fusion (blue 1→3→5, red 2→4→6) without consuming four duplicates; the job consumes the screen and may require nontradeable ink. The **card retains its original instance ID** and gains a versioned transformation event. Five-of-a-kind fusion remains a faster alternative and still consumes five instances when chosen. Starting tuning values: Basic 4,000 steps (1→3), Fine 10,000 steps (2→4), Master 20,000 steps plus Trail Ink (3→5 or 4→6). Numbers are prototypes, not guaranteed launch prices. Only earned Trail Credits buy functional screens; real-money cosmetics never affect these recipes. Each accepted step sample can advance one active card and produce Trail Credits without double-crediting either subsystem.

## 4.3 Fairness: two Hold'em queues

**Classic Hold'em:** Standard 52-face distribution, 2 hole cards/player, 5 shared cards, betting rounds, normal side pots, legal folds/calls/raises, and best 5-card hand from any 5 of 7. Rank/category and kicker rules match Texas Hold'em. Cosmetics have no game effect. Chips have no cash value. Support 2–6 players per table after load testing.

**Evolved Hold'em:** Exactly the same deal and betting sequence, but a separate scoreboard includes a clearly disclosed, capped collectible bonus. This is an alternative ruleset, never passed off as conventional Texas Hold'em. Display both *poker category* and *power score* so surprises are understandable. Hold'em community cards are neutral: only hole cards assigned to a player may map to that player's eligible unique collection instances. The card faces are selected by the server and cannot be selected or reordered by the player to force particular hands.

**Critical integrity model:** The server creates **one shuffled virtual 52-face deck per table/hand**, rather than physically concatenating the participants' collections. Two different players cannot introduce a duplicate Ace of Spades into the same dealt hand. When a player receives `A-S`, the display can refer to their owned `A-S` instance in their 52-face loadout; if absent due to a temporary issue, use a neutral fallback and reject a broken loadout in ranked modes. Unowned style/rarity never changes face probability. Board cards never inherit an individual player's upgrades.

## 4.4 Deterministic Evolved score (initial balancing proposal)

For each of the 21 possible five-card combinations from seven dealt cards, calculate:

`Score = (CategoryIndex * 1000) + StandardTieValue(0..499) + CollectibleBonus(0..1200)`

**CategoryIndex**: 0 High Card, 1 One Pair, 2 Two Pair, 3 Three of a Kind, 4 Straight, 5 Flush, 6 Full House, 7 Four of a Kind, 8 Straight Flush (royal flush is the highest straight flush). `StandardTieValue` is a monotone, **nondecreasing** 0–499 summary of the conventional within-category ordinal (including ace-low straight). Because a category may contain more than 500 distinct ranks, collisions are possible; in a complete numerical-score tie, compare exact conventional rank and then split if still equal. The 7,462 conventional five-card rank classes remain the oracle for Classic mode. Owner-approved experimental Option A (30 October 2026) uses Straight values from five-high through ace-high of `0,56,112,168,225,281,337,393,450,499`; other categories use `floor(499 * ordinal / (classCount - 1))` over ascending exact within-category rank classes. Freeze this as `EVOLVED_A_EXPERIMENTAL_V1`; approval is for experimental implementation, not live admission or balance sign-off.

**Bonus**, counting only owned *hole* instances included in that candidate hand:

- Card level: `70 × (level−1)` per included hole card (maximum 700 across two).
- Instance rarity: Common 0; Uncommon 30; Rare 60; Epic 90; Legendary 120 per included hole card (maximum 240).
- Matched back/style: +120 if **both** included hole cards have matching **earned `playStyleFamily`**, regardless of any purchased display skin.
- Pair-of-hole-cards synergy: +80 if both included hole cards form a pocket pair and share the same earned style family.
- Special defined same-series set event: +60 if a published, configured effect applies to **both included hole cards**.
- Clamp total bonus at 1,200; all such values are configurable by ruleset version and must be immutable mid-match.

Example: a Straight with base `4,450` and collectible bonus `1,050` scores **5,500**; a Flush with base `5,210` and no bonus scores **5,210**. That Straight wins in Evolved mode, but loses in Classic mode. Since a category spans 1,000 points and tiebreak values are ≤499, the maximum bonus allows at most a one-category upset; it cannot overcome a two-category deficit. **This is a proposed design requiring simulations and playtesting, not a proven balanced formula.**

The winner is the player with the maximum score across all candidate 5-card combinations. On equal Evolved score, compare conventional evaluated rank; on remaining equality, split the pot. Never use non-deterministic server/client floating-point computations: use integers. Tests must enumerate known poker hand cases and seeded simulations to confirm fairness. Each game response includes category, category tie rank, eligible owned IDs and a human-readable bonus breakdown.

## 4.5 Spades specification

Initial implementation: four players in two fixed partnerships, standard bidding, 13 tricks per deal, follow-suit enforcement, spades as trump, spades broken rule, nil bids (configurable initially), team bag scoring, and end-of-game target (illustrative 500 points). Match options: private room, casual ranked. **Rarity/evolution must never override trick winner in Classic Spades.** Evolved cosmetics may yield progression or post-hand set bonuses, not change suit/trump legality. A future separately labeled variant can explore powered mechanics after fair testing. Bot substitution after timeout requires an explicit match policy, not silent cheating.

## 4.6 Player progression, Play Chips, Trail Credits, Store Gems, and collection rewards

**Account XP:** increases on completed verified play, collection milestones, daily challenges, and season achievements. Player Level is derived server-side from a versioned XP curve, not cash spend.

**Play Chips:** earned-only, non-purchasable, nontransferable, no cash equivalent; used as play-table scores/buy-ins for social poker and optional earned-only cosmetics. Cap flows, define daily faucet/sink and free replenishment. No withdrawal or exchange to Credits or real-world items.

**Trail Credits:** earned-only movement currency from accepted step/activity records and accessibility-equivalent quests; spend on randomized earned-only discovery packs, functional Printing Press screens, and limited collection supplies. **Store Gems:** premium-paid cosmetic-only currency, or direct IAP cosmetic entitlements (including fixed-content cosmetic card packs); never used for functional screens, earned packs, stakes, strength or meaningful RNG advantage. Both are nontransferable, nonredeemable, and cannot turn into Play Chips, cash or NFTs. Card art purchased via Store Gems must not change rarity, level, earned style synergy, or Evolved power. Platform billing and consumer review are release gates.

**Collectible awards:** completing an original 52-card series, special five-card themed combinations in an archive, or 10 verified Full House outcomes can grant titles, cosmetics, album pages, fusion dust or specific bound cards. **Platinum Chips** is preserved as a collectible award label only if it is kept outside any purchased/wagering currency system; choose distinct naming to prevent confusion.

**Game achievements:** first victory, 10 Full Houses, a royal flush, 25 Spades wins, winning a nil, completing full series, first gold-trim fusion, Printing Press walking evolution, and season rank. Each has eligibility criteria, anti-farming limits and idempotent fulfillment.

## 4.7 Tournaments and seasons

Support monthly feature tournaments and weekly lightweight events. Config: game/ruleset version, scheduled times, max entrants, seeding, rounds, eligibility, admin approvals, reward contents and finalization state. Reentries and fraud flags are audited. Launch prizes are **in-game nontransferable digital items and prestige**, not gift cards, cash, tradable NFTs, or crypto. An always-free alternative to any paid progression competition prevents pay-to-win events. Leaderboard calculations must be idempotent and replayable.

## 4.8 Collection tiers and original series taxonomy

Separate a **promotional collection production tier** from **card evolution level**:

- **Jack edition:** distinctive back with mostly standard readable faces.
- **Queen edition:** distinctive back and custom face-card illustrations.
- **King edition:** distinctive back and all 13 ranks in each suit customized within legibility rules.
- **Ace edition:** fully designed 52-card original series and interactive album art.

Suggested independent launch themes: Art Deco Casino, Foundry Gold, Neon City, Celestial, Vintage Expedition, Puzzle Mosaic. Historical aesthetic inspiration is permitted, but do not copy protected contemporary brand marks, distinctive card backs, or unlicensed artwork. Exact “14 matching suites” from the original notes is ambiguous (a 52-card deck contains four suits × 13 ranks); treat it as a design question rather than silently changing face counts.

# 5. User Journeys and UX Specification

## 5.1 Primary navigation

**Home** (daily rewards, play, walk/Press Job progress), **Play** (Classic/Evolved Hold'em; Spades; friends), **Collection** (52-face loadout, albums, inspect, fuse, press), **Explore** (nearby original drops, safe public park trails and lap progress), **Pack Store**, **Profile**. Always label Trail Credits as earned-only, Store Gems as purchase-only, and Play Chips as having no monetary value.

## 5.2 Critical journeys

**Onboard (≤5 minutes):** download → age/region notice → guest start or login → select a starter original series → server grants 52 unique face-matched L1 blue cards → introduce the two modes → finish guided game with no monetization pressure → first completion reward. Guest accounts cannot spend until linked appropriately.

**Classic Hold'em:** choose mode → accept public table or invite → load single canonical deck → pre-flop/blinds → flop/turn/river with turn timer → showdown and verifiable hand explanation → table summary → earned XP and Play Chips settled exactly once.

**Evolved showdown:** reveal both standard hand rank and rarity calculation; tap any contributor to inspect which personal cards made the chosen five. In a zero-bonus board-only hand, cards on the table do not inherit powers.

**Fuse five:** search matching eligible copies → preview with five source IDs and one result → confirm → one atomic inventory transaction → show lineage and rollback/report path. Never accept a double tap as two fusions.

**Press and walk:** explain permissions → select card → choose purchased-with-Trail-Credits functional screen → start Press Job → validated step records accrue Trail Credits and press progress once → screen is consumed only when completed → card is upgraded in place with a permanent history event. Basic step progress does not require GPS. Accessible movement/quest alternative is available without faking steps. **Trail lap:** opt into a route session, follow a curated accessible public trail loop through ordered checkpoints, finish verified lap, and claim a distinct trail-only original edition or Trail Ink. **Nearby drop:** consent to foreground location → arrive near a safe public access point → validate proximity/cooldown → claim a location-category reward once.

**Spades party:** invite 3 friends → choose casual rules → bid → tricks → settle team bags/nil → match report, rematch and disconnect policy.

**Tournaments:** view schedule → transparent entry requirements → registration/check-in → live bracket/table → result → in-app only reward → dispute window.

**Archive/album:** owned and previously held instance provenance, clearly distinguishing **Owned now**, **Previously owned**, **Discovered**, and **Completed series**. If later transfers exist, collection credit policy must be defined independently of custody.

## 5.3 Accessibility and usability

Readable rank/suit at mobile sizes despite artistic editions; high-contrast/large-symbol modes; colorblind safe suit indicators; screen-reader labels; haptic opt-out; portrait first and tablet layout; short turn countdown with accessibility adjustments in casual rooms; low-bandwidth asset mode; settings for spending limits, privacy and notifications.

# 6. Functional Requirements (contract level)

| ID | Priority | Requirement | Testable acceptance |
|---|---|---|---|
| FR-001 | P0 | User signup, login, guest linking and deletion | Account state and deletion workflow audited; authorization checks enforced |
| FR-002 | P0 | Starter grant exactly 52 distinct faces | Concurrent requests cannot mint duplicate starter grants |
| FR-003 | P0 | Card inventory and lineage | Every owned ID is unique, never duplicated or double-spent |
| FR-004 | P0 | Active 52-face loadout + 100-slot manager | Gameplay validates all ranks/suits; collection capacity doesn't delete ownership |
| FR-005 | P0 | Classic Hold'em rules engine | Deterministic outcomes match exhaustive oracle cases and betting tests |
| FR-006 | P0 | Evolved Hold'em score engine | Versioned integer bonus, clear breakdown and one-category maximum upset |
| FR-007 | P0 | Server-controlled shuffle and deals | No client requests arbitrary face or sees opponent hidden card |
| FR-008 | P0 | Real-time rooms/reconnect | State reconstructs from authoritative events and handles timeout |
| FR-009 | P0 | Spades engine and partner scoring | Follow suit, trump, scoring and valid bids covered by unit tests |
| FR-010 | P0 | Fusion | Five matching eligible sources consumed once and one child produced |
| FR-011 | P0 | Wallet and ledger | Balances derive from immutable audit entries, never trusted from client |
| FR-012 | P0 | Purchase/restore/refund | Server verified receipts; rollback/entitlement revocation supported |
| FR-013 | P0 | Tournament engine | Schedule, eligibility, results and grant are idempotent |
| FR-014 | P0 | Moderation, dispute, admin audit | RBAC, immutable actions and report queue |
| FR-015 | P1 | Walking incubation | Explicit consent; steps deduped and anomalies rejected; nonwalker fallback |
| FR-016 | P1 | Achievements and collection album | Event-based count and exactly-once reward grant |
| FR-017 | P1 | Missions, seasons and notifications | Jobs retry safely; preference opt-out honored |
| FR-018 | P1 | Metrics and experimentation | Actionable opt-in telemetry without storing precise paths |
| FR-019 | P1 | Store cosmetics and 52-series publishing | Pending drafts QA'd and activated with versioned content |
| FR-020 | P2 | New game rule plugin interface | A separate adapter can use same card catalog/inventory service |
| FR-021 | P2 | Physical promotion redemption adapter | Disabled until specific licensed campaign and anti-fraud controls |
| FR-022 | P2 | Blockchain proof adapter | Disabled by default; no token unlocking gameplay or staking |

Acceptance tests and edge cases in the companion build pack expand these requirements.

# 7. Nonfunctional Requirements and Service Levels

- **Reliability:** pilot target ≥99.5% measured monthly service availability; mature launch goal ≥99.9% after operations investment. Never claim SLA without monitoring.
- **Latency:** target P95 server-ack on normal move <250 ms in same region excluding client network; match join <5 seconds at tested baseline; conduct load tests before advertising these targets.
- **Consistency:** card grants, fusion, balances, rewards and tournament settlement use ACID transactions, idempotency keys, and append-only ledgers.
- **Security:** TLS everywhere; managed secrets; OAuth/JWT verified per request and socket; rate limiting; strict admin RBAC; encrypted sensitive data; no secrets or wallet keys in mobile app.
- **Privacy:** steps and foreground location are separate opt-ins; no raw route/location for basic printing; brief route evidence only during verification for trail lap, then discard precise path; deletion/export flows, child-safety, site safety and accessible alternative review.
- **Scalability:** stateless API, authoritative room actors with durable snapshots/events, Redis for matchmaking and presence, queue workers for idempotent async jobs.
- **Resilience:** socket disconnect/rejoin and duplicate event handling; restore from snapshot + event log; multi-AZ managed database when growth demands.
- **Observability:** logs with correlation IDs, traces, metrics, security alerts, game-economy reconciliation and daily ledger checks.
- **Quality:** domain rule coverage of critical path 95%+ target; mutation/property tests; integration, E2E, fairness and app-store review testing.

# 8. Reference Architecture

## 8.1 Stack (recommended, replaceable with ADR)

**Monorepo:** TypeScript, pnpm workspaces / Turborepo, strict TS, ESLint, Prettier, Vitest, GitHub Actions.  
**Mobile:** React Native + Expo development builds; Expo Router, React Query, Zustand for transient UI; React Native Skia/Reanimated for card motion and accessibility alternatives. Test step sensor support on physical iOS/Android hardware.  
**Backend:** NestJS on Node.js using REST for resource CRUD, Socket.IO/WebSockets for game commands/events. Pure domain packages must not import NestJS.  
**Database:** PostgreSQL (Prisma migrations), Redis for room presence/pub-sub/rate limits, durable background queue (BullMQ), S3-compatible assets store with CDN.  
**Auth:** audited managed auth provider or Supabase Auth, JWT validation on API/socket and app account-linking.  
**Purchase:** Apple StoreKit / Google Play Billing via an approved client integration and verified server webhook/receipt pipeline.  
**Admin:** Next.js dashboard, role-protected, audit log and content moderation.  
**Maps later:** Maps abstraction with properly licensed commercial tiles (OSM data may be used with appropriate attribution; do not assume OSM public tile infrastructure is an unlimited production tile API).  
**Optional chain adapter later:** separate service boundary; no wallet/account key in core game DB.

## 8.2 Logical components

```
Mobile App ── REST/JWT ── API / Identity ── PostgreSQL
     │                        │                   │
     └── WebSocket ── Game Gateway/Room Actor ── Game Event Log
                              │                   │
                     Pure Rules Packages     Transactional Ledgers
                              │                   │
                       Matchmaking / Redis ── Reward/Job Workers
                                                  │
                            Catalog / Collection / Press / Steps / Explore / Packs / Store
                                                  │
                                       Admin Next.js + Audit
     [Future adapters: geospatial quests | redemption codes | brand CMS | on-chain proofs]
```

The game server is the only authority that advances game state or deals cards. Client requests are declarative commands (fold/call/raise/bid/play). Domain transitions return a new state and events. Never trust client-reported balances, shuffle seeds, rewards, rank scores, step totals, card grants or match outcomes.

## 8.3 Domain boundaries

- `identity`: accounts, consent, geo restrictions, moderation.
- `catalog`: face definition, card designs, series, variants, publication and edition supply.
- `collection`: owned instances, loadouts, holdings and archive.
- `evolution`: eligible recipes, five-card fusion, owned functional screens, walking press jobs, in-place card transitions and lineage.
- `games`: rules interfaces, poker/spades engines and room lifecycle.
- `matchmaking`: queues, player match quality, reconnections.
- `economy`: separate currency types, immutable journal, idempotency.
- `commerce`: products, digital entitlements, verified transactions, refund/chargeback.
- `achievements`: activity and eligibility, dedupe and reward grants.
- `events`: tournaments, seasons, leaderboard snapshots and settlements.
- `safety`: reports, risk flags, admin actions and audit.
- `partners` (future): partner rights, licensed asset scopes, campaigns, codes, brand dashboards.
- `provenance` (future): public anchoring and reversible chain adapters.

## 8.4 Data model essentials

Minimum tables (detailed Prisma scaffold supplied separately): `User`, `Profile`, `Consent`, `CatalogSeries`, `DesignAsset`, `FaceDefinition`, `CardTemplate`, `CardInstance`, `OwnershipEvent`, `FusionJob`, `FusionIngredient`, `Loadout`, `LoadoutCard`, `IncubationJob`, `StepClaim`, `GameRoom`, `RoomPlayer`, `GameEvent`, `GameSnapshot`, `MatchResult`, `Wallet`, `LedgerEntry`, `Product`, `Purchase`, `Entitlement`, `AchievementDefinition`, `AchievementProgress`, `RewardGrant`, `Tournament`, `TournamentEntry`, `TournamentResult`, `Season`, `ModerationReport`, `AdminAudit`, `IdempotencyKey`, `FeatureFlag`. Partition or archive large append-only event streams as volume grows.

**CardInstance cardinality:** one row per individually granted card; immutable `instanceId`, `faceId`, provenance `originEventId` and `createdAt`; authoritative `currentOwnerId`, `status`, `level`, `rarity`; unique serial within series if edition claims capped issuance; separate current inventory and historical ownership views. Track fusion parents as a join table; no database row should be erased during a normal fusion.

## 8.5 API contract examples

**REST (authenticated except public catalog):**

```
POST /v1/auth/guest-link
GET  /v1/me
GET  /v1/catalog/series
GET  /v1/cards?owner=me&status=owned&cursor=...
GET  /v1/cards/:id/provenance
PUT  /v1/loadouts/:id                    {faceToInstanceIds, version}
POST /v1/evolutions/preview              {ingredientIds[5]}
POST /v1/evolutions/confirm              {ingredientIds[5], idempotencyKey}
POST /v1/press/jobs                     {instanceId, ownedScreenId, idempotencyKey}
POST /v1/activity/sync                  {sourceCursor, samples, idempotencyKey} [server reconciles; never trusts client totals]
GET  /v1/trails/nearby                  {coarseLocation, radius}
POST /v1/trails/:id/start               {idempotencyKey}
POST /v1/trails/runs/:id/complete       {sessionEvidence, idempotencyKey}
GET  /v1/drops/nearby                   {coarseLocation}
POST /v1/drops/:id/claim                {deviceProof, idempotencyKey}
POST /v1/packs/:id/open                 {idempotencyKey}
GET  /v1/wallets                        [play_chips, trail_credits, store_gems separate]
POST /v1/commerce/verify                 {platform, transactionId, signedPayload}
GET  /v1/tournaments
POST /v1/tournaments/:id/register
GET  /v1/matches/:id/audit-summary
POST /v1/reports                         {targetId, reason, evidence}
```

**Socket lifecycle (room channel):** `room.join`, `game.command` with `commandId`, `stateVersion`, `gameId` and `payload`; server emits `game.state`, `game.actionAccepted`, `game.actionRejected`, `game.reconnected`, `game.settled`. Hide hole-card secrets using per-recipient projections. A command is applied at most once; stale versions produce a conflict and a resync snapshot.

**Example transaction:** fusion confirmation locks ingredient rows, checks all five invariants, writes `FusionJob`, updates five statuses to `CONSUMED`, writes child instance and five lineage edges, writes `OwnershipEvent` + relevant inventory ledger/outbox records, commits once, then publishes notification. A failed retry returns the original confirmed result.

## 8.6 Real-time architecture, randomness and disputes

Use CSPRNG server-side shuffle and opaque hand/session seeds. Persist a commitment hash before cards are revealed and reveal a verifiable seed after hand closure where it does not expose other concurrent games. Do not reuse seeds and do not implement a client-controllable “provably fair” mechanism without cryptographic review. Keep replayable match events, versioned rules and a referee tool for disputes. Room actors serialize commands; do not process parallel betting actions without conflict checks.

# 9. Functional Game Engine Interfaces and Test Vectors

Define a pure TypeScript engine interface:

```ts
type GameKind = 'HOLDEM_CLASSIC' | 'HOLDEM_EVOLVED' | 'SPADES_CLASSIC';
interface GameRuleEngine<S, C, E> {
  kind: GameKind;
  version: string;
  validate(state: S, command: C): void;
  reduce(state: S, command: C): { nextState: S; events: E[] };
  projectForPlayer(state: S, playerId: string): unknown;
  isTerminal(state: S): boolean;
}
```

**Poker test vectors:** A-2-3-4-5 is a five-high straight; 10-J-Q-K-A one suit is royal flush; full house outranks flush; flush outranks straight in Classic; 7-card evaluator selects best five of seven; board-only ties split; folded player cannot win showdown; side-pot eligibility follows contribution. Evolved `4*1000+450+1050 = 5500` beats unpowered flush `5*1000+210 = 5210`. Evolved cannot beat hands two categories higher using a ≤1,200 bonus. Test equal evolved score fallback and all 21 combinations.

**Spades vectors:** if a player holds led suit they cannot discard another; a spade wins a trick when spades are broken or legally played, subject to configured trump rules; nil win/loss and bags score exactly once; no one can play a fourteenth card in a deal.

**Inventory vectors:** 5 L1 blue `Q-H` from same collection -> one L3 blue/silver `Q-H`; 5 L2 red `Q-H` -> one L4 red/silver; mixed ranks, series or tiers reject; 2 simultaneous fusions sharing sources cannot both succeed; consumed parents remain in history; purchase refunds respect locked/granted item status.

**Economy vectors:** replaying a `MatchSettled` event does not award chips twice; Play Chips and Credits never interchange; purchased Credits cannot enter betting pot; negative ledger balance and refunded entitlements are blocked.

# 10. Walking, Location and Future AR

## 10.1 Launch Printing Press (steps, not map dependency)

Ask for HealthKit / Health Connect permissions when the user activates a Printing Press job, not at install. Import permissioned, source-deduped activity records with timestamps; apply conservative daily caps and plausibility checks; never treat a client-entered number as proof. One accepted activity event can separately fund one Trail Credit credit and one assigned Press Job progress (not two wallets or two Press Jobs). Walking must not be a mandatory purchase gate or only route to competitive strength; offer equivalent accessible non-location quests. Publish an explicit regional privacy/data-retention policy before production. Refer to the full rules in §24.

## 10.2 Launch opt-in Explore, with future geospatial extensions

Use an `ExplorationProvider` interface for tile maps, quests, proximity checks and possible AR sites. Check-in awards should use a server-issued challenge, time-limited geo proof and anti-spoof heuristics. Do not copy Foursquare/Facebook functionality or claim platform APIs are accessible without a written integration plan. Niantic Spatial's SDK may be evaluated if it fits and is separately licensed, but v1 needs none of it.

# 11. Monetization and Business Model

## 11.1 Revenue streams in priority order

1. **Original collection cosmetics** (direct sale of known designs and animation; no outcome advantage in Classic queues).
2. **Season pass** for cosmetic/collection tracks with accessible free path and transparent reward contents.
3. **Premium profile and collectible presentation**: albums, display stands, frames and collection showcase features.
4. **Fixed-content purchasable cosmetic packs** through verified platform billing, alongside **earned randomized discovery packs** with published drop pools and Trail Credit pricing. Paid randomized packs remain gated until chance/consumer-protection/legal/store approval and pre-purchase odds disclosure.
5. **Future licensed series/campaign sponsorship** after retention and operational economics are established.
6. **Future physical collectibles** and redemption campaigns after inventory, rights, consumer law and fraud controls exist.

Reject any marketing claim that rarity automatically gives assets cash value. Market value, if an eventual permitted secondary market exists, is determined by demand and legal/platform constraints—not an internal formula.

## 11.2 Illustrative operating model (not market forecast)

For scenario modeling, use variables: `MAU`, `payerConversion`, `monthlyARPPU`, `platformFeeRate`, `COGSperMAU`, `monthlyFixedCosts`.

`GrossMonthlySales = MAU * payerConversion * monthlyARPPU`  
`ContributionBeforeFixedCosts = GrossMonthlySales * (1-platformFeeRate) - MAU*COGSperMAU`  
`OperatingProfit = ContributionBeforeFixedCosts - monthlyFixedCosts`

**Example only:** 10,000 MAU × 3% payers × $12 monthly ARPPU = **$3,600 gross monthly sales**, before platform fees, chargebacks, hosting, labor, marketing and tax. It is not a viable full-team business by itself; retainment, conversion, organic acquisition and cost must be proven with paid beta cohorts. Build a spreadsheet model after beta data is collected.

## 11.3 Primary unit economics and growth experiments

Track 7-day and 30-day retention by entry mode; percent of collectors who play; time to first win and first fusion; first purchase rate and repeat purchase; paid acquisition CAC; creator/organic referral effectiveness; revenue by cohort; cloud cost per completed match; customer-support tickets per 1,000 matches; inventory and refund discrepancies.

Experiments: collector-first vs play-first onboarding; free starter art series; Classic vs Evolved matchmaking entry; Printing Press rewards; free album quest vs direct purchase. Randomized treatment must not undermine fairness in ranked competitions.

## 11.4 Indicative team and sequencing

For a serious production mobile/social game, plan for product/design, game rules, mobile, backend/realtime, QA/automation, art, and operations, with independent specialist reviews for gaming law, privacy and app-store compliance. **Illustrative, not quoted estimates:** an experienced 3–5-person engineering group plus part-time product/art/legal may need roughly 8–14 months for the independent version, depending on scope and reuse; a solo founder using Codex should plan materially longer and limit simultaneous features. Budget from actual rates and staffing assumptions rather than representing this as a verified vendor quote.

# 12. Content and Art Production Pipeline

Original art system should require **one base vector face set** plus distinctive face-card collections, modular card-back art, trims/foil layers and thematic series extensions; new editions should not require 52 unrelated illustrations. Create a style guide for dimensions, safe zones, rank/suit readability, suit color/high-contrast variants, back symmetry, reflective textures, animation budgets and LOD/mobile compression.

Asset deliverables: design source files with commercial rights, exported PNG/WebP/SVG where supported, JSON manifests, thumbnails, animation atlas or Lottie assets, accessibility labels, licensing provenance, marketing screenshots. Require content moderation and originality checks. AI-generated art should be reviewed for consistency and commercial/IP risk; do not imitate living artists or protected franchise style assets without permission.

Publishing flow: draft edition → QA validated 52 unique face mappings → designer/producer approvals → hashed assets/CDN → scheduled release → rollback path (cannot alter already disclosed limited print-run supply) → product metadata and localized descriptions.

# 13. Admin, LiveOps, Trust and Safety

Admin permissions: Customer Support (read/report), Content Editor (draft series), Game Operator (tournament scheduling), Economy Operator (two-person approval for currency/card grants), Security Auditor (immutable access log), Superadmin (break-glass). All write actions require actor, reason, scope, timestamp and idempotency token. No admin interface may mint unbounded limited-edition cards without explicit controlled override.

Anti-cheat: authoritative hands and shuffles, match collusion heuristics, wallet reconciliation, fusion/pack/press concurrency controls, source-aware step deduplication, location-spoof heuristics, impossible-speed checks, false GPS and repeated-lap detection, device integrity where available, receipt verification, moderation/report/block, and disputed-match replay.

Plan incident playbooks for inventory duplication, incorrect hand settlement, server outage mid-tournament, purchase issue, leaked credentials, location spoofing, exploit report and account deletion. Publish a moderation policy, terms and privacy notice before public beta.

# 14. Security, Legal and Regulatory Gates

**Critical:** The user idea involves poker, paid currency, rare cards, possible crypto value, and gift-card prizes. Combining payment + chance + prize of monetary value can implicate gambling, sweepstakes, app store and financial regulatory regimes. This document is a product plan, **not legal advice**. Counsel must review jurisdictional rules before real-money-value features, NFT trading or prize promotions are enabled. Even virtual-only poker requires attention to app-store age ratings and local rules.

- **Copyright:** A specific written spec, original code, artwork and designs can be protected as expression, but **an abstract game concept or rule mechanic cannot simply be copyrighted to stop others building it**. Obtain lawyer advice on trademark, patent-eligible inventions if any, contracts and trade secrets; use written assignment agreements for contractors.
- **Brand rights:** Bicycle, Bee, Hoyle, Aviator and related marks/designs may require licenses from the proper rights holder. Cartamundi acquired USPC in 2019. Do not claim affiliation without a license.
- **Game-platform organization:** Niantic's games business moved to Scopely in May 2025. Niantic Spatial is a distinct technology route. A deal with one does not grant rights held by the other.
- **Apple:** published guidelines address in-app purchases, randomized item odds disclosure, NFTs unlocking app functionality, cryptocurrencies and real-money gambling, which requires permissions/geofencing. Design economy to comply rather than relying on future loopholes.
- **Google Play:** blockchain assets require specific disclosures and prohibit NFT wagering for real-world-value prizes outside approved gambling regimes; review gambling/real-money policy independently.
- **Digital goods:** mobile digital purchases generally require platform-approved billing; verify cross-platform behavior and changing regional rules before launch.
- **Privacy/location:** minimize step, location and device data; informed opt-in; retention/deletion/consumer requests; privacy and security impact review.
- **Promotion laws:** sponsored card collection rewards, gift-card value, random prizes, sweepstakes, product-code redemption and charitable cause claims require individual campaign review and potentially no-purchase entry methods, geography and disclosures.

**Launch red-line checklist:** no deposits or cash-out; no fiat or crypto token sale; no P2P card wagering; no secondary market; no cash/card gift prizes linked to purchased chance; no unlicensed brands on cards or location drops; no location collection without consent; no paid randomized packs without approved policy/legal analysis and odds disclosure; no real-money functional Printing Press acceleration; no gambling advertising aimed at minors; require appropriate app age rating.

# 15. Future Partnerships — Explicitly Not a Launch Dependency

## 15.1 What to prove before approaching partners

Validate a stable live product, retention cohorts, cost to serve, match completion, collection engagement, organically earned vs bought item acquisition, tournament participation, localization/accessibility, fraud controls and attractive sample original series. Have a concise 12-slide partner deck, rights-safe demo, sample partner storefront, audience deck (aggregated privacy-safe), campaign economics, brand safety framework and contract playbook.

## 15.2 Partnership architecture (built as abstractions only)

Maintain an optional `Partner`, `LicenseAgreement`, `AssetRights`, `Campaign`, `RedemptionCode`, `PromotionReward`, `AttributionEvent`, `RoyaltyLedger` model in design docs, but defer implementation until there's a partner. Contracts govern territory, platform, term, approval, use of historical card backs, creation rights, minimum guarantees, royalties, user-generated content, data access, codes, physical product integration, survivability of player collections after license expiry, withdrawal obligations and dispute handling.

## 15.3 Potential deal sequences

**Phase A: independent product → paid branded pilot.** Offer a limited original branded collection, without asking a partner to build core infrastructure. Test measured opt-in engagement against specific KPIs. Use a fixed fee or capped pilot economics and documented rights.

**Phase B: playing-card licensor.** Bicycle/USPC/Cartamundi is a candidate for card-back licensing, collectible vintage-style history, physical pack redemption, and limited designs; separately determine who owns what marks/design artwork. Position the value proposition as fan engagement, digital collectibles and cross-sell—not a vague promise to digitize a brand.

**Phase C: location/technology provider.** Explore map and AR providers as service vendors. Treat Scopely (games/audience) and Niantic Spatial (spatial tooling) as distinct counterparties; neither necessary to ship the first game.

**Phase D: retail/entertainment programs.** Sponsor-backed original collectible sets, co-branded digital item releases, proof-of-purchase codes, venue quests and charitable decks. Research specific partners' marketing goals and eligibility before pitching; names such as Starbucks or Mountain Dew are **hypothetical examples**, not endorsements or agreements.

## 15.4 Concept examples retained for later exploration

- Physical gift-card/package codes grant known cosmetic card packages (do not imply that $5/$25 purchases provide odds-based, more powerful ranks in competitive play).
- Coffee-shop themed 52-card album and 52 safe, consent-based activity quests; promotional cup or gift card only after separate sweepstakes/lottery/contest review.
- Social engagement deck with direct creator participation; never assume Facebook “52 likes” or Foursquare check-in APIs can be used as originally proposed.
- Cause-based card releases with verifiable donation accounting and independent approvals.
- Vintage Vegas and historical playing-card collections where the underlying asset and rights have been audited and licensed as necessary.

## 15.5 Partnership pitch and negotiation readiness

Prepare: 1-page teaser; product demo; 10–12 slide deck; target partner KPI and opportunity cost; audience segmentation; illustrated activation timeline; sample branded design; rights request and approved use; campaign budget; data privacy and reporting; minimum guarantee vs royalty economics; termination/expiry policy; trademark clearance. Execute mutual NDA if commercially appropriate—but do not assume an NDA creates copyright over general ideas. File/contract work should occur with counsel before supplying sensitive source or art.

# 16. Blockchain / NFT Decision Framework

## 16.1 Make instance provenance useful without chain

At v1, `CardInstance` has a UUID, edition serial if any, lineage and immutable `OwnershipEvent` stream. Public collection pages can show a signed provenance certificate with event hashes. This captures uniqueness and most collector value propositions without gas fees, wallet recovery, fraud/marketplace complexity, token economics or app-store friction.

## 16.2 Possible later three-stage implementation

1. **Signed off-chain certificates:** server signs a canonical card state digest with key rotation, audit logs and verification endpoint. No token, no transfer.
2. **Public attestation:** periodically publish Merkle roots/hashes to a suitable chain as tamper-evidence, with no on-chain personal data or gameplay entitlement. Legal review first.
3. **Optional tokenization:** choose chain/standard, immutable metadata policy, custodial vs self-hosted wallets, smart-contract audit, fees, transfer and theft recovery, marketplace/KYC/AML/consumer rules, geographic availability, taxes, app-store policy, royalty semantics, sponsored-IP expiration; only then build export/mint/trading.

Never represent “more play” or “rarer cards” as a guaranteed cryptocurrency price formula. If an on-chain token has tradable value, poker prizes or wagers in that token may materially change gambling and financial obligations. There is no token issuance in the product baseline.

# 17. Metrics, Reporting and Experimentation

Event schema must include event ID, event version, server time, actor ID, session ID, room ID, ruleset version, feature flags, consent status and an idempotency key where settlement applies; redact personal data from analytics.

Core events: `StarterGranted`, `CardViewed`, `AlbumProgressed`, `FusionPreviewed`, `FusionCompleted`, `IncubationStarted`, `StepDeltaAccepted`, `IncubationCompleted`, `QueueEntered`, `MatchJoined`, `MatchCompleted`, `GameDisputed`, `TournamentRegistered`, `TournamentSettled`, `CurrencyEarned`, `PurchaseVerified`, `PurchaseRefunded`, `ItemEquipped`, `SeasonRewardClaimed`.

Dashboards: onboarding funnel, day cohorts, 7-day WEC, match/queue health, economy generation/sinks, content series sell-through, retention by first experience, tournament conversion, suspicious transactions, support/refund health. Define sources of truth; do not measure successful purchases from client-side events alone.

# 18. Codex + Astra Execution Playbook

## 18.1 Tool roles and expectations

**Astra planning/review:** take the authoritative PRD and design decisions, stress-test game logic, challenge security/economy assumptions, review architectural change proposals, analyze test failures and write acceptance criteria. **Codex execution:** implement small bounded tickets in Git, run tests, produce diffs and evidence, fix issues. Human product owner approves economy/legal/content decisions. This describes a workflow, **not a claimed built-in integration or specific Codex model toggle**. Any models available to the user can fill the planning/review role.

## 18.2 Git / repository structure

```
deckforge/
  AGENTS.md
  README.md
  docs/{PRD.md,DECISIONS.md,ARCHITECTURE.md,GAME_RULES.md,SECURITY.md,API.md}
  prompts/{START_HERE.md,REVIEW_PROMPTS.md}
  apps/mobile/                       # React Native Expo
  apps/admin/                        # Next.js
  services/api/                      # NestJS REST + WebSocket
  services/jobs/                     # background jobs
  packages/game-core/                # engine contracts and state transitions
  packages/game-poker/               # holdem rules and evaluator
  packages/game-spades/              # spades trick/bid/scoring
  packages/card-domain/              # evolution, rarity, schema definitions
  packages/contracts/                # Zod schema + API event types
  packages/ui/                       # reusable visual components
  prisma/schema.prisma
  tests/{unit,integration,property,e2e,load}
  .github/workflows/ci.yml
```

## 18.3 Workflow per ticket

1. Read `AGENTS.md`, scoped PRD, decisions and issue acceptance criteria.
2. Summarize assumptions and touched modules before coding; **do not silently change original game rules**.
3. Implement one domain bounded issue/PR at a time with new unit/integration tests.
4. Run lint, TS typecheck, test suite, migration checks, dependency scans and relevant mobile E2E.
5. Show changed files, meaningful diff summary, test command/output, API changes, migration impact and unresolved risks.
6. Astra/human review security, invariants, changes in economy, fairness or legal boundary; merge only if acceptance passes.
7. Update `DECISIONS.md` and next issue, then repeat.

## 18.4 Start with invariant-heavy vertical slices

Phase 0: Repo / CI / ADR / local database / test harness.  
Phase 1: Identity + exact starter grant + card registry.  
Phase 2: Catalog + loadouts + archive + card art preview.  
Phase 3: Pure Classic Hold'em evaluator and deterministic game reducer; exhaustive test corpus.  
Phase 4: Socket rooms, state projection, reconnect and settle.  
Phase 5: Evolved score rules and transparent breakdown; balancing simulator.  
Phase 6: Spades engine + team rooms.  
Phase 7: Fusion + three-wallet ledger + activity sync + Printing Press + earned packs and achievements.  
Phase 8: Fixed cosmetic IAP packs, curated safe trails, location-category drops, tournaments, moderation and admin.  
Phase 9: Mobile experience, observability, security audits, app-store QA and controlled launch.

The build pack contains `AGENTS.md`, a ticket CSV, initial Prisma schema, detailed review and build prompts, and acceptance-test matrix. Do **not** instruct Codex to “build the whole app in one go.” Start with the first small ticket; advance only when tests are green.

# 19. Delivery Backlog and Definition of Done

All P0 requirements must be deployed to staging, auditable and tested end-to-end; P0 Printing Press/exploration and P1 achievements/UX make this a differentiated **full working v1**; P2 integrations are optional expansion. Detailed 82 issue definitions are in `backlog/BUILD_BACKLOG.csv` and `backlog/SPRINT_PLAN.md`. Scope dependencies before implementation.

**Definition of Done, every domain ticket:** typed API/contracts; authentication/authorization; validation and invariants; idempotency; tests including negative/concurrent cases; structured logs/metrics; migrations + rollback where applicable; documentation + ADR; reviewed UX/accessibility; threat model for any sensitive data; evidence of commands executed.

**Launch acceptance gate:** first guest/user can receive exactly 52 cards; buy a known-content cosmetic pack through verified billing; open an earned pack using walking-earned Trail Credits; buy a functional screen with Trail Credits and press-evolve an eligible card through verified steps; complete a curated public park trail lap for a unique bound reward; claim an original category-location drop with permission; complete Classic and Evolved Hold'em and full Spades game on separate devices; experience zero duplicates; evolve a card; complete incubation or accessibility alternative; complete tournament; receive earned-only rewards; purchase and restore a cosmetic via verified platform billing; see own archive; report abuse; delete/export account; recover from mid-hand disconnect; admins can review and reconcile outcome; audit logs/backup restore tests pass; app policy and legal sign-offs documented.

# 20. Critical Decisions and Open Questions

| Decision ID | Baseline answer | Validation needed |
|---|---|---|
| D-01 | Use original brand; DeckForge is a working title | Trademark/domain clearance |
| D-02 | Classic and Evolved Hold'em separate queues | Player preference and balance simulation |
| D-03 | 52-face loadout + 100-slot collection manager | Actual optimal UI and slot economics |
| D-04 | Five-of-kind fusion blue 1→3→5, red 2→4→6 | Progression speed and rarity preservation |
| D-05 | Red branch from rewards/drops, not blue fusion | Source rates and acquisition pacing |
| D-06 | Evolved power only for included owned hole cards | Showdown clarity and fairness |
| D-07 | 1,200 cap, +1000/category | Statistical fairness vs arbitrary-looking upsets |
| D-08 | Spades always rule-correct in Classic | Default nil/bags/target variants |
| D-09 | Play Chips never purchased or cashed out | Legal counsel on applicable virtual poker mechanics |
| D-10 | Store Gems paid cosmetic only; Trail Credits earned through verified activity | App Store / Google billing and activity integrity |
| D-11 | Paid fixed-content cosmetic packs plus earned random packs; no paid randomized packs | Catalog odds, refunds and fulfillment |
| D-12 | Printing Press and curated opt-in trail/nearby discovery launch; AR remains later | OS permissions, safe route verification, equitable alternatives |
| D-13 | Off-chain instance provenance at launch | Collector trust vs need for transfer |
| D-14 | No brand licensing as blocker | Artwork sufficiency and independent growth |
| D-15 | 18+ initial positioning | Jurisdiction/age rating review |
| D-16 | No physical prize/gift card promo at launch | Later sweepstakes legal clearance |

# 21. 30/60/90-Day Founder Execution Plan

**Days 1–30:** approve product decisions, working title and legal boundary; create private Git repo; pin specs and design system; put CI in place; generate the starter 52-face catalog and art direction; implement identity, instance registry, exactly-once starter grant and read-only collection screens; establish test fixtures. Conduct early interviews with card players/collectors using an unlicensed demonstration.

**Days 31–60:** ship local playable Classic Hold'em in test environment; verify hand evaluator against independent oracle; build server room protocol and end-to-end 2-player match; add ledger + match settlement; implement first fusion flow; test adversarial concurrency and reconnect.

**Days 61–90:** add Evolved scoring, readability and balancing simulator; start Spades engine, mobile UI and private-room experience; instrument activation/retention; begin incubation permission prototype; prepare external playtest and compliance reviews. Replan after actual velocity—not after a nominal fixed calendar.

# 22. Risk Register

| Risk | Likelihood / impact | Mitigation / owner |
|---|---|---|
| Gambling classification / prize economy | High impact; uncertain jurisdiction | Exclude real-value outcomes, counsel before beta, Product/Legal |
| Collector advantage harms fairness | Medium / high | Separate Classic mode, power cap, simulations, Product/Game Design |
| Poker state/side-pot bugs | High / high | Pure evaluator oracle, deterministic event replay, Game Engineering |
| Fusion duplication/exploit | Medium / high | DB locks, unique idempotency, audit reconciliation, Backend |
| In-app purchase reconciliation | Medium / high | Server verify, webhooks, refund testing, Commerce |
| 52-card art volume delays release | Medium / medium | Modular design system, staged original series, Art Lead |
| Real-time disconnect/collusion | High / high | Room actors, reconnect policies, reports, Trust/Game Ops |
| Walking/location fraud, safety, privacy | High / high | Consent, step dedupe, checkpoint verification, safe public sites, GPS TTL, accessibility alternatives, Mobile/Privacy |
| Scope creep (NFTs, AR, brands, 7 games) | High / high | Signed v1 scope and adapters, Founder/PM |
| Team/platform cost overrun | Medium / high | Stage gates, cohort economics, billing alerts, Engineering/Ops |
| Trademark/design infringement | Medium / high | Original designs, clearance, chain-of-title, Counsel |
| Platform rule changes | Medium / high | Feature flags, conservative economy, quarterly policy review |

# 24. Packs, Printing Press, Trail Credits & Park Routes (v1.1 core launch addition)

**Status:** Required independent production v1 feature domain. This document supersedes earlier v1 assumptions that walking granted only incidental dust and that geospatial discovery was deferred. No licensed brand, GPS provider, AR platform, blockchain, or NFT is required.

## A. The three connected player loops

- **Pack loop:** play and walk -> earn Trail Credits -> buy an earned-only randomized *Discovery Pack* -> open a server-awarded set of collectible card instances and/or nontransferable ink. Alternatively, a player can buy a **known-content cosmetic Pack** with platform billing (price and every cosmetic item disclosed, no hidden power or chance). A first-party series may include 52 individual faces with original front/back art. A purchasable pack cannot grant an earned rarity, level advantage, style-family synergy or superior Evolved result.
- **Press loop:** select one eligible existing card -> acquire a matching functional screen with **earned Trail Credits** -> install it in a themed **Printing Press** -> complete an activity goal or accessibility equivalent -> finish printing -> the **same card instance** gains a higher tier/trim (or a separately tracked special finish) with an append-only history event and screen consumption. Duplicate five-card fusion remains an alternate upgrade route. A consumable screen defines an alternate recipe; it does not stack additional power on top of the target level.
- **Explore loop:** nearby safe, approved public-category POIs offer original unbranded drops. Curated public park paths/loops provide stronger rewards for completing genuine on-route walking sessions and successive laps, rather than just walking arbitrary steps. Travel to a nearby retail category must never imply affiliation with the actual business. Walk anywhere to earn base Trail Credits; walks on verified routes can additionally earn scarce **Trail Ink**, trail series cards or special press finishes.

## B. Currency and entitlement invariants

| Balance | Acquisition | Spend | Hard constraints |
|---|---|---|---|
| Play Chips | Earned through legitimate card games | Noncash poker play | Not purchasable, exchangeable, transferable or redeemable |
| Trail Credits | Accepted activity events plus equivalent accessibility quests | Functional Press Screens; earned Discovery Packs; common print supplies | Earned-only; never wagered or sold; no real-world redemption |
| Store Gems | Platform purchase / approved refund restoration | Cosmetic screen themes, known-content cosmetic card packs, nonfunctional visual effects | Never alters card tier/rarity/style synergy/earning rate; no exchange to Trail Credits |
| Trail Ink | Curated route completion or configured equivalent quests | Special press recipes and finishes | Bound, not tradable; no cash value |

Economy tuning proposal, not final: 100 accepted steps = 1 Trail Credit; daily earn cap = 150 Trail Credits; earned Discovery Pack = 100 Trail Credits; Basic Screen = 60 Trail Credits, Fine Screen = 140, Master Screen = 300; first Press Job = 4,000 steps, intermediate = 10,000, top tier = 20,000 plus Trail Ink. Explicitly publish caps, cooldowns, reward contents and all relevant odds. Adjust by telemetry only through a versioned `economyConfigId`, never silently mid-job. Accessibility-equivalent quests pay the same relevant bounded rewards without demanding a GPS route.

**No double-granting:** the same approved activity interval may legitimately contribute both (i) Trail Credit minting and (ii) the single selected Press Job's progress, because those are distinct published rewards. It must NEVER mint the same Trail Credits twice, progress multiple Press Jobs, or be claimed for multiple exclusive trail-lap prizes. Keep one canonical accepted activity ledger keyed by `(userId, source, sourceRecordId or bounded interval fingerprint)` with independently idempotent downstream allocations. Import corrections/deletions trigger deterministic adjustment and fraud review.

## C. Printing Press feature, game economy and UX

**Screen as tool, not a card:** distinguish **Screen Pattern** (versioned recipe definition) from **Owned Screen** (consumable entitlement). Store fields: `screenId`, `branch`, `sourceTier`, `targetTier`, `requiredSteps`, `requiredTrailInk`, `creditPrice`, `consumable`, `ruleVersion`, `visualThemeId`. Screen pattern purchase with Trail Credits produces an owned screen; display themes with Store Gems never change the rule fields. A screen is one-time-use on **successful completion**; allow cancel/reassign before first accepted step with a clear refund policy, else return a spent partial-progress policy defined at job creation.

**Job state machine:** `AVAILABLE -> ACTIVE -> READY_TO_CLAIM -> COMPLETED` with `PAUSED/CANCELLED/REVOKED` branches. Active job locks a card against fusion, transfer, deletion and live-round modification; allow it to remain playable at its **old immutable snapshot** until press finishes, with no retroactive changes to active matches. At most one active Press Job per user by default (further slots may be earnable in later versions; premium purchase does not multiply active upgrade throughput). Completing a job atomically checks prerequisites; changes `CardInstance.level` to the published target, sets `stateVersion += 1`, consumes owned screen and any ink, persists `PressJob`, and appends `OwnershipEvent` action `PRESS_EVOLVE`. **Preserve instanceId** and create a versioned before/after history snapshot; never issue a second card as if the original were duplicated. Never permit terminal level 5/6 to advance.

**Art language:** a physical-press-inspired interface with a platen, ink roller, printing plate/screen, paper feed and animated foil/trim reveal; the card is placed on the press and accumulates an imprint meter. Call items *Printing Screens*, *Trail Ink*, *Press Jobs*, *Edition Foils*, *Master Imprints*. Use original vintage engraving aesthetics; do not copy Bicycle graphics or third-party trade dress.

**Onboarding example:** the player receives a blue L1 King of Hearts, buys a Basic Blue Screen for 60 earned Trail Credits, assigns the card to the press, walks 4,000 approved steps, claims the completed print and now owns the *same* King of Hearts instance at L3 with silver trim. The five-copy fusion route produces the same L3 outcome, by a separate provenance event. With earned-only screens, a player can make meaningful progress without collecting duplicate copies first.

## D. Card-pack taxonomy and opening transaction

| Pack | Method | Outcome | Launch status |
|---|---|---|---|
| Starter Deck | Free once per account | 52 unique faces, common/base style | Required |
| Discovery Pack | Trail Credits from walking/quests | Disclosed random pool of earnable cards/ink, published table version, nontransferable contents | Required |
| Trail Cache | Completion of approved public trail or lap | Server-defined bound limited original card, press finish, or Trail Ink | Required |
| Fixed Cosmetic Pack | Direct IAP or cosmetic Store Gems | Explicit exact set of artwork/skins/frames without power changes | Required |
| Paid Random Pack | Real money or Store Gems | Randomized items | **Disabled** pending specific platform/legal review and compliant displayed odds |

**Pack contract:** versioned pack product with start/end time, stock/supply cap, region eligibility, earned currency price or store SKU, contents/odds config version, guarantee logic, duplicate policy, receipt/claim state. `POST /v1/packs/{packId}/open` MUST atomically debit the correct Trail Credits **once**, sample server-side from a recorded RNG/pack-pool version, issue each instance or ink with its own idempotent source key, record a PackOpening (item IDs, pool version, timestamp), and return a safe opening reveal. Opening may be retried after network failure and return **the same** contents, without new rewards. IAP grants only validated preset cosmetic entitlements; handle refunds without invalidating legally owned unrelated cards or corrupting a played match.

**Policy note:** Both Apple and Google Play require odds disclosure for randomized items purchased with real money; digital purchases normally require platform billing. The safest independent v1 commercial approach is fixed-content paid cosmetics and earned-only random packs. Do not assume buying Trail Credits is allowed; it is disabled. See official platform rules in the master spec sources.

## E. Exploration and real-world location events

**Two distinct location reward types:**

1. **Nearby Drop:** server-defined original drop at a public safe approach location (`dropId`, category, geographic geometry, rewardPoolVersion, schedule, cooldown, capacity, safety flag, permission region); app foreground location and freshness/accuracy check allow one bound reward per defined player cooldown. Sample category: *Café Corner* near an eligible coffee/fast-food location; **not** a branded McDonald's card or sponsor claim. Avoid requiring purchase, entering private premises, blocking entrances or crossing roads. Exclude schools, healthcare facilities, unsafe road edges, private/residential addresses, sensitive places, and closed venues. Actual branded drops require a signed license and updated art/campaign configuration.
2. **Curated Trail / Park Loop:** a reviewed public, walkable route with legal access, public hours, wheelchair/accessibility metadata where available, planned checkpoints, distance, route status, and reward configuration. A player starts a foreground route activity, passes checkpoints in order, and finishes a lap. **A lap is not merely returning to the same GPS coordinate**. Validate signed-in user, session start, checkpoint order, tolerance to GPS drift, minimum plausible elapsed time/distance and nonvehicle movement indicators, replay/fraud flags, and maximum eligible laps/day. Award themed bound collectible cards, Trail Ink, event foils or additional Trail Credits. Repeated laps may form escalating original sets (e.g., first lap common trail card, third lap silver scenic edition, fifth lap limited press art). Reward tables are configurable, not hard-coded by park name. Offer weather and daylight advisories and never route through nonpublic or closed areas.

**Walking everywhere vs selected trails:** *Anywhere* steps grow Press Job progress and Trail Credits (including indoors); *public approved trails* add exclusive location reward eligibility; *verified laps* enable higher rarity or limited artwork subject to published supply and cooldowns. Examples for inspiration: a public park loop earns an *Oak Grove Foil*; a longer riverside trail earns a *River Etching*; near a permitted shopping district a generic *Neighborhood Cache* appears. Original art only. No user location, biometric detail, or walking route goes on-chain or into public profiles.

**Proof quality:** iOS Core Location / Android Fused Location foreground session, OS activity/step feeds when consented, server timestamp sequence and plausibility heuristics. An ordinary geofence entry cannot prove that someone walked a complete loop. Do not rely on GPS points alone as cryptographic proof; use conservative verified-session confidence scores plus appeal/support and accessible alternative. Implement route samples as short-lived proof under an explicit retention window; persist only coarse `routeId`, `lapCount`, `claimId`, `validationStatus`, *not full personal movement history*. If a GPS permission is denied, normal walking Press Jobs and Trail Credits continue; show trail rewards unavailable or accessible equivalent quests without faking a route.

**Device/battery policy:** foreground active trail sessions for v1. No default always-on background location. Prioritize only nearby candidate geofences; iOS has a limited monitored-region budget, so do not register every drop citywide. Cache approved public route geometry; protect map dataset/provider licensing and attribution. If geospatial accuracy insufficient, fail softly with progress preservation or a manual review path rather than silently granting fraud-prone rewards.

## F. User flows and screens

- **Pack Store:** tabs `Earn With Steps` / `Buy Cosmetic Packs`; balance, pack counts, exact item list or odds, batch open, receipt history, refund state.
- **Explore Map:** nearby original safe drops, approved public trails, accessibility label, public hours and active events. No brand imagery without rights. Map is optional view; a list view works for screen readers.
- **Trail detail:** distance, estimated walk difficulty (not live travel ETA), checkpoints/laps, rules, claim cap, type of reward, consent and safe-access notice; start/pause/end controls.
- **Printing Press:** card-slot, screen inventory/shop, matching branches, ink requirement, progress and upgrade outcome preview; press reveal animation. Warn if the selected card is in a match, in a pending trade or already at terminal level.
- **Activity Hub:** step consent, accepted steps and daily Trail Credit allowance, synced devices/source info, press progress and non-walking accessible quests.
- **Collection/Album:** cards searchable by origin `purchased_cosmetic`, `trail_loop`, `nearby_drop`, `press_evolved`, `fused`; archive shows lineage, original issuance and subsequent transformations.

## G. Acceptance and threat-model minimums

1. 100 distinct step samples process once; any replay yields same Trail Credit balance and same one Press Job progress. Overlapping HealthKit/Health Connect samples do not double-count; source data adjustments reconcile.
2. A new player walking 4,000 verified steps can acquire a Basic Screen with earned Trail Credits and upgrade an eligible blue L1 card to L3, given the published earn rate and available wallet balance. The instance UUID does not change, the screen is consumed exactly once and fusion is not invoked.
3. Press completion racing with fusion or a concurrent card lock cannot spend the same card twice or modify an active-match ruleset snapshot.
4. Paying money for cosmetic packs, screens' appearance, or Store Gems cannot change an Evolved result, press speed, screen recipes or route reward probabilities.
5. Paid **fixed** cosmetics show exact contents before purchase; randomized earned pack shows current pool/odds, and opening retries return the original card IDs and outcomes.
6. One verified lap yields exactly one configured trail prize; jumping straight from beginning to end, GPS spoofing, driving through checkpoints, replaying a session or timing laps implausibly fast is rejected/flagged.
7. A claimed nearby public-category drop requires fresh opt-in foreground location within acceptable precision; repeated claims respect cooldown and idempotency; an unlicensed business name never appears on the reward card.
8. Revoked location permission disables location rewards without invalidating existing collection or suppressing step-based press progress. Route traces are deleted on retention expiry and account deletion.
9. Accessibility-equivalent quests provide a feasible way to obtain functional upgrades and any progress-critical resources; no real-world place visit is required to compete in Classic mode.
10. Location data and health-step data are protected, purpose-limited and never used for ad targeting, raw-route leaderboards or partner reporting at person level.

## H. Feature sequencing, ownership and live operations

Build order: (1) separate wallets and atomic reward ledger; (2) pack catalog, earned and fixed cosmetic fulfillment; (3) activity aggregation and deduplication; (4) functional screen store/inventory; (5) Press Job state machine and card mutation; (6) opt-in foreground location and nearby generic drops; (7) admin-curated public trails, proof verifier and lap rewards; (8) analytics/safety controls; (9) two-platform in-device tests, fraud drills, privacy and platform review. Do not launch with arbitrary public user-submitted location events or unreviewed trail geometry.

**Admin requirements:** publish/version pack odds and assets; change screen recipes only for new jobs; curate/suspend unsafe routes or drop points; monitor source-based step fraud, lap exploitation, inventory economics and user complaints; audit each award; cap supplies and run rollback/deactivation if a safety incident occurs. Never re-price or change an active user's press job without an explicit migration policy.

**Launch gates:** full feature-flags for POI drops and trail rewards; validated IAP receipts; policy review for game chance/pack odds; privacy impact assessment and deletion testing; geo dataset rights + public trail approval; emergency drop/route disable; positive device tests across Android and iOS; actual consent and background battery usage audit.


---

# 23. Dependencies and External Sources (checked 27 October 2026)

This section records external **references**, not endorsements. Product/legal rules are subject to change; confirm again near launch.

1. U.S. Copyright Office — *What Does Copyright Protect?*: https://www.copyright.gov/help/faq/faq-protect.html
2. U.S. Copyright Office — *Works Not Protected* (Circular 33): https://www.copyright.gov/circs/circ33.pdf
3. Bicycle Playing Cards — *About / USPC brand portfolio*: https://bicyclecards.com/about/
4. Cartamundi — *USPC acquisition close (Dec 31, 2019)*: https://cartamundi.com/en/press/cartamundi-announces-closing-united-states-playing-card-company-uspc-aquisition/
5. Scopely — *Niantic games acquisition closed May 29, 2025*: https://www.scopely.com/en/news/scopely-to-acquire-niantic-games-business-which-includes-pokemon-go-one-of-the-most-successful-mobile-games-of-all-time
6. Niantic Spatial — *NSDK migration / VPS documentation*: https://www.nianticspatial.com/docs/ardk/migration_guide/ ; https://www.nianticspatial.com/docs/nsdk/features/lightship_vps/
7. Apple Developer — *App Review Guidelines* (sections 3.1 and 5.3): https://developer.apple.com/app-store/review/guidelines/
8. Google Play — *Blockchain-based Content*: https://support.google.com/googleplay/android-developer/answer/13607354
9. Google Play — *Real-Money Gambling, Games and Contests*: https://support.google.com/googleplay/android-developer/answer/9877032
10. Android Developers — *Health Connect Steps*: https://developer.android.com/health-and-fitness/health-connect/features/steps
11. OpenStreetMap Foundation — *Tile usage policy*: https://operations.osmfoundation.org/policies/tiles/
12. OpenAI — *Codex AGENTS.md guidance*: https://learn.chatgpt.com/docs/agent-configuration/agents-md
13. OpenAI — *Iterating development workflows with Codex*: https://developers.openai.com/cookbook/examples/codex/iterating-development-workflows-with-codex
14. PokerStars — *Conventional poker hand rankings*: https://www.pokerstars.com/poker/games/rules/hand-rankings/
15. Pagat — *Texas Hold'em rules*: https://www.pagat.com/poker/variants/texasholdem.html
16. Balatro — *Official FAQ*: https://www.playbalatro.com/faq
17. Pokémon TCG Pocket — *Official description*: https://tcgpocket.pokemon.com/en-us/
18. Apple — *Core Location*: https://developer.apple.com/documentation/corelocation/
19. Apple — *HealthKit*: https://developer.apple.com/documentation/healthkit/
20. Google — *Health Connect step aggregation*: https://developer.android.com/health-and-fitness/health-connect/read-data
21. Google — *Play Payments / randomized item odds*: https://support.google.com/googleplay/android-developer/answer/9858738

---

**Final product principle:** Players must enjoy and understand this game using its original cards, without any brand agreement, NFT, AR vendor, or cash-based reward. If that works, the permanent collection becomes the foundation for the much larger vision.
