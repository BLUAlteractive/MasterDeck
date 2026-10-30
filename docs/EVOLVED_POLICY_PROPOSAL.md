# Evolved scoring decision for B023–B026

Status: **Option A explicitly approved by the product owner on 30 October 2026 (reply: “A”). Experimental implementation of B023–B026 is authorized; live Evolved admission remains disabled pending balancing review.** MASTER_SPEC §4.4 is explicitly a balancing proposal. AGENTS requires product-owner approval for scoring choices; R-10 leaves exact tie mapping and set effects open.

Two concrete inconsistencies require a choice before implementing a versioned default:

1. A uniform mapping `floor(499 * ordinal / (classCount - 1))` is monotone but gives the ten Straight ranks tie values `0,55,110,166,221,277,332,388,443,499`. It cannot produce the example's 460. Since an attainable bonus is a multiple of ten and a Straight's eligible two-hole bonus is at most 1,120, this curve also cannot produce any Straight scoring exactly 5,500.
2. A Straight candidate cannot include both cards of a pocket pair. Its two-hole bonus therefore has the form `70*L + 30*R + 120*M + 60*E`, where `L` is the sum of level-minus-one (0–10), `R` the summed rarity index (0–8), and M/E are zero or one. Enumerating these bounded integers yields no 1,040 bonus. One included hole cannot reach it either. The published `4460 + 1040` arithmetic works, but is not an attainable card fixture under the listed coefficients.

**Option A — preserve the ticket's attainable 5,500 example (recommended for review).**

- Use versioned explicit monotone tables. For Straights from five-high through ace-high, use `0,56,112,168,225,281,337,393,450,499`. Use uniform floor quantization for other categories, ordered by the exact conventional rank classes. This is the approved experimental curve; it is not a launch approval.
- Correct the explanatory fixture to a king-high Straight: base 4,450 plus bonus 1,050 = **5,500**. Included holes at levels six/five contribute 630, two Legendary instances contribute 240, matching earned style adds 120 and a configured published same-series effect adds 60. Purchased skins and unused holes/board never contribute. A neutral Flush with tie value 210 scores 5,210. These are candidate rank vectors; a real multi-player fixture must additionally share one valid board/deck.
- Explicitly configure the same-series effect by version and earned series eligibility; no effect is invented or activated for production. Use fixture-only effects until publication and balancing review.

**Option B — uniform curve, revise numeric acceptance.**

- Use uniform floor quantization in every category. The same king-high Straight and eligible bonuses score **5,493**, still above 5,210. Update the specification/backlog example with owner approval rather than claiming the 5,500 acceptance passed.

Both options preserve Classic's exact 7,462-class oracle, the 1,200 cap, all 21 candidates, exact conventional fallback on score ties, neutral board cards and the maximum one-category upset. Neither is proven balanced. B026 must report at least 100,000 seeded fixtures across earned rarity/level cohorts, confidence/coverage limits and win/upset distributions before proposing launch thresholds. No invented balance threshold or live Evolved admission follows from green tests.

B023 will implement the selected immutable policy and validate candidate ownership/face/earned metadata. B024 will expose complete accessible explanations. B025 will isolate modes and ruleset versions; live admission stays disabled until policy and balancing review. B026 will produce repeatable diagnostic evidence, not assert fairness from a single aggregate win rate.

The explicit “A” reply approves Option A, the corrected fixture and the experimental-only scope presented above. Option B remains a rejected alternative; prior pending status is superseded.
