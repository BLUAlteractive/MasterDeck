# Acceptance matrix and adversarial testing

## Poker engine

B012 evidence and limits: [five-card report](../docs/B012_REPORT.md); `pnpm test:poker:exhaustive`. B013 ranking evidence: [seven-card report](../docs/B013_REPORT.md); `pnpm test:poker:seven`. Other poker/room/settlement gates below remain open.

- [x] Enumerate all 52 choose 5 hands for category distributions; exact counts total 2,598,960.
- [x] Distinguish all 7,462 classical five-card rank equivalence classes.
- [x] A-2-3-4-5 = 5-high straight; 10-J-Q-K-A suited = highest straight flush.
- [x] Full house > flush > straight in Classic; kickers and pair ordering correct.
- [x] Seven-card ranking chooses best among 21 five-card combinations; exact ties and board-only hands (B013).
- [ ] Actual split-pot allocation and settlement, including board-only ties (B015/B022).
- [ ] Poker betting rounds, blinds, min raise, all-in, side pots, folded players, pot conservation.
- [ ] Face map never duplicates any (rank, suit) at one table; collector appearance never affects shuffle chance.
- [ ] A purchased display skin never modifies earned rarity, level or playStyleFamily, or changes Evolved outcome.
- [ ] Evolved scoring example: 5,500 Straight > 5,210 Flush; Classic result opposite.
- [ ] Max collectible bonus 1,200 and no win against two-tier-higher hand.
- [ ] No bonus for a hole card excluded from the evaluated five; no bonus for neutral board cards.
- [ ] Equal Evolved scores defer to standard rank and then split; active ruleset immutable mid-game.
- [ ] Redacted projection: opponent cannot read unrevealed hole cards, seed, deck order or hidden effects.

## Spades engine
- [ ] Exactly 52 distinct cards, 13 per player; 13 tricks per hand.
- [ ] Follow suit enforced if held; trump/spades-broken behavior matches chosen rules config.
- [ ] Legal bids and nil scoring, sandbags, partner scoring, final win conditions.
- [ ] Spades Classic ignores rarity/evolution when determining trick winner.
- [ ] Disconnects, invalid cards, repeated commands, stale turn versions, unauthorized seats rejected.

## Card/inventory
- [ ] Exactly-once starter grant of 52 distinct faces per account across concurrent retries.
- [ ] Loadout all 52 faces exactly once; 100-slot manager never discards legitimately owned overflow.
- [ ] UUID uniqueness, edition cap and serial number constraints hold during parallel minting.
- [ ] Five matching inputs consumed and one child minted atomically; no mixed face/series/branch/level.
- [ ] Evolution 1→3→5 blue / 2→4→6 red; level 5/6 terminal.
- [ ] Source items locked in live matches/tournaments/refunds cannot fuse.
- [ ] Parent lineage and historical ownership survive all fusions and ownership status updates.
- [ ] Double-submit fusion and network retry issue one result only.

## Economy and commerce
- [ ] Wallet balances reconcile exactly to ledger; no negative or cross-currency transfers.
- [ ] Server transaction verifies signed store receipt/purchase, not client success event alone.
- [ ] Refund/reversal and cross-platform restore preserve inventory invariants.
- [ ] Play Chips cannot be purchased, cashed out or transferred; Store Gems and Trail Credits cannot enter gambling pot or exchange with each other.
- [ ] Duplicated match-settlement/achievement/tournament events never double-grant rewards.
- [ ] Real-money fixed-content cosmetic packs list exact items; earned-only random packs disclose odds; cash-purchased randomized packs remain disabled until approved.

## Steps, safety, live operations
- [ ] User can refuse health permission without losing access to games; alternative available.
- [ ] OS step overlap deduped, source attributed, anomaly cap enforced; exact paths never collected for step-only feature.
- [ ] Suspended account cannot participate or receive free store rewards.
- [ ] Admin role boundaries, MFA, audit reason and high-risk double approval.
- [ ] Tournament late entries, disconnects, bracket recalculations, dispute/reversal paths covered.
- [ ] Reporting/blocking and deletion/export GDPR/CCPA workflows tested per applicable law.
- [ ] Simulated 500+ concurrently active games (load target should be tuned) without settlement corruption.
- [ ] Backup and restore test with event replay; multi-device account conflicts handled.
- [ ] iOS and Android actual-device permission, purchase and notification tests.

## v1.1 Pack / Printing Press / trail edge cases
- [ ] 100 records, repeated or overlapping source data yield one Trail Credit debit/credit sequence and one Press Job advancement; source correction reconciles.
- [ ] A verified player can earn Trail Credits, purchase Basic Blue Screen, progress 4,000 accepted steps, complete L1→L3 on SAME UUID, and see new permanent provenance history.
- [ ] Full press recipe snapshot is immutable for active jobs; concurrent press/fusion/card locks cannot both consume one card.
- [ ] Early job cancellation applies published screen-return rule; job finish consumes owned functional screen once and rejects double claim.
- [ ] Exact fixed cosmetic pack contents visible before IAP, verified receipts and refunds handled; store cannot indirectly alter Evolved bonuses.
- [ ] Earned Discovery Packs debit earned Trail Credits once; RNG and pool version saved; retry returns identical rewards and instance IDs.
- [ ] Denying GPS keeps walking credits and press fully functional; revoking HealthKit/Health Connect leaves traditional gameplay available.
- [ ] Nearby generic drop requires foreground consent, location precision threshold, public safe site, fresh proof and rate-limited claim.
- [ ] Curated public route laps require ordered checkpoints, plausible movement and elapsed time; jump-to-end, car speed, mock location, duplicate runs denied or flagged.
- [ ] Public safety: routes cannot be activated until admin approval and rights/attribution/accessibility review; emergency route suspend available.
- [ ] Trial route evidence removed after policy-defined TTL and full account deletion; no raw home/work path leak or public sharing.
- [ ] Accessibility-equivalent reward sources available for players unable to walk or reach an approved park.
