# Evolved A diagnostic balance report

Experimental Option A, seed **230026**, **100,000** synthetic heads-up showdowns, fixture version `EVOLVED_SIM_FIXTURES_V1`. Each hand compares Classic and Evolved on the same two pairs of holes and shared board from one canonical shuffled 52-face deck, with normal burn/deal positions. No betting or chip payouts are simulated. This report is diagnostic and **does not approve launch**.

| Hypothetical cohort (player A versus player B)            | Samples | A showdown share | A Classic share, same deals | Paired change, percentage points | Strict rank reversals | One-category reversals |
| --------------------------------------------------------- | ------: | ---------------: | --------------------------: | -------------------------------: | --------------------: | ---------------------: |
| No owned metadata on either side                          |  16,667 |           50.20% |                      50.20% |                            +0.00 |                     0 |                      0 |
| Baseline earned cards; purchased-skin counterfactual on A |  16,667 |           50.43% |                      50.24% |                            +0.19 |                   163 |                      0 |
| A: level 3/Uncommon; B: level 1/Common                    |  16,667 |           67.36% |                      49.19% |                           +18.17 |                 2,725 |                      0 |
| A: hypothetical mixed earned distribution; B: baseline    |  16,667 |           67.43% |                      49.84% |                           +17.58 |                 2,651 |                     37 |
| A: level 6/Legendary/configured fixture set; B: baseline  |  16,666 |           80.92% |                      50.33% |                           +30.59 |                 4,774 |                  1,935 |
| Both maximum earned profiles                              |  16,666 |           49.45% |                      49.49% |                            -0.04 |                   139 |                      2 |

Showdown share counts a win as one and an exact tie as one half; it is not a betting win rate, expected chip return or population forecast. A strict reversal means the player losing the exact Classic comparison wins Evolved. Same-category reversals and ties resolved are recorded separately in [the complete deterministic JSON](simulations/evolved-a-v1.json), along with chosen-category histograms, bonuses and binary outright-win confidence intervals.

The cosmetic row's change relative to Classic is caused by the unchanged **earned** style/pocket-pair rules. It is not a paid boost: each fixture was reevaluated with altered purchased skin/rarity/level/style fields, and the entire resulting Evolved candidate payload was identical to its no-purchase counterfactual. **Cosmetic counterfactual changes: zero.**

## Fixture assumptions

These are deliberately hypothetical progression stress profiles, not approved earn rates, inventory population shares, prices, time-to-upgrade promises or live reward distributions. Baseline means owned level-one Common cards sharing an earned style, with no configured set effect. Early means level-three Uncommon cards. Mixed samples each level 1–6 and rarity uniformly and varies earned style/set eligibility. Maximum means level-six Legendary cards, matching earned style and a +60 fixture-only published-set configuration. Parity gives that profile to both sides. The neutral control has no owned metadata, isolating exact Classic equivalence.

The six scenario allocations are approximately equal, not weighted by player telemetry. Source code is development/test-only. Rejection sampling avoids bounded modulo bias; the seeded xorshift source is reproducible diagnostic infrastructure, never a trusted production shuffle or activity proof. Only aggregate synthetic results are retained. No real accounts, route/health data, balances or credentials are used.

## Technical controls and release gates

All controls passed: 52 unique faces, integer scores, neutral equivalence, cosmetic invariance and **zero two-category upsets**. Exhaustive rank-table tests separately establish monotonicity and the cap's mathematical category bound; Monte Carlo alone cannot prove rare-event impossibility.

**Earned progression balance is not approved.** Maximum earned cards produced roughly 80.9% showdown share against baseline, a material advantage under this model. Even the early profile is roughly 67.4%. Do not describe these outcomes as balanced or treat passing CI as a release decision. There is no invented acceptable percentage threshold. Keep live admission disabled and require product review of target advantages, candidate/bonus behavior and published effects before any parameter revision or activation. Scoring changes require a new immutable version and renewed owner approval.

Other open gates: 2–6-player comparisons, betting/folding/side-pot strategies, real progression distributions and attainable inventories, asymmetric styles/series coverage, multiple independent seeds, power/readability playtests, telemetry-based cohort weights and production actor/settlement integrity. Fixed hand samples do not establish fairness or retention. No automated curve retuning or economy change occurs here.

The JSON's Wilson 95% bounds apply only to each cohort's **binary outright-win indicator**, not half-tie share or paired advantage. They assume the synthetic sampling model; they are not simultaneous multi-cohort bounds or guarantees for real players. Formula checked against [NIST's Wilson interval reference](https://www.itl.nist.gov/div898/handbook/prc/section2/prc241.htm). Values are rounded to eight decimal places for reproducibility; raw counts remain available.

## Reproduce

```sh
pnpm test:poker:evolved --output /tmp/evolved-a-v1.json
pnpm test:poker:evolved --verify docs/simulations/evolved-a-v1.json
```

Defaults are 100,000 hands / seed 230026. Optional `--hands` and `--seed` produce additional diagnostic corpora; they do not overwrite committed evidence unless `--output` is explicitly supplied. The CLI rejects invalid bounds and unknown options. CI regenerates the default corpus and checks normalized JSON equality, so a code/scoring change cannot quietly retain stale evidence. Technical mismatch fails the command; the statistics never turn `launchApproved` true.
