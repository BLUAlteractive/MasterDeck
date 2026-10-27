# DeckForge v1.1 — Packs, Printing Press & Trail Discovery: Build Contract

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
