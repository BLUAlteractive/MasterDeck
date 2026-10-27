# Astra product/architecture review prompts

These prompts work in a capable planning/reasoning session (called Astra in your requested workflow). They do not assume Astra is built into Codex.

## A. Architecture review
> Review MASTER_SPEC and architecture/schema.prisma as a principal engineer. Identify high-risk unclear domain boundaries, unsafe data modeling, performance failure points and design inconsistencies. Separate launch-blocking from later improvements. Do not rewrite the product strategy; propose ADRs with test criteria.

## B. Poker mathematician / game-design review
> Validate the Classic rules and 7,462 rank class handling. Stress-test Evolved's integer score, category overrides, hole-card condition, ties, optimizer choice and game balance. Design 100k+ reproducible Monte Carlo scenarios comparing a starter collection against high-tier collections. Find any pay-to-win outcome distributions and propose bounded alternatives without touching Classic.

## C. Adversarial inventory + economy review
> Threat-model starter grants, card-instance IDs, five-card fusion, refunds, role-based grants, event replay, duplicate network requests, and ledger invariants. Give concrete attack sequences, relevant SQL isolation issues, and unit/integration tests.

## D. User experience and collector retention review
> Evaluate onboarding, first fusion, first completed match, card legibility, 100-slot management vs 52-face loadout, album/ownership history and walking accessibility. Flag confusing mechanics and specify UX acceptance tests for mobile.

## E. Compliance product review preparation
> Analyze the *product design*, not give legal advice. List features that combine money/chance/prizes, store billing issues, age/geo controls, privacy consents and chain transfer risks. Compare against current official Apple and Google policies and produce questions for specialist counsel. Do not claim that a disclaimer alone makes a feature compliant.

## F. Pull request gate review
> Given this ticket, its diff and actual tests, check against AGENTS.md, MASTER_SPEC.md and acceptance matrix. Report (1) correctness, (2) concurrency/edge cases, (3) security/privacy, (4) scope drift, (5) missing instrumentation, (6) reject/approve-with-notes recommendation. No invented test runs.

## G. Launch go/no-go
> Use tests/ACCEPTANCE_MATRIX.md, legal/LAUNCH_GATES.md and release metrics. Name blockers with evidence, risks accepted by human owner, rollback plans and rollout restrictions. No 'ready' conclusion without test evidence.
