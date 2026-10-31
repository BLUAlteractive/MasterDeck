# Decision Register — v1.1 baseline

| ID   | Decision                                                                                                  | Rationale                                            | Open validation                    |
| ---- | --------------------------------------------------------------------------------------------------------- | ---------------------------------------------------- | ---------------------------------- |
| D-01 | Working title only; original brand/assets                                                                 | No licensing dependencies                            | Trademark/domain clearance         |
| D-02 | Hold'em Classic + Hold'em Evolved                                                                         | Preserve fairness while enabling collection power    | Early user study                   |
| D-03 | Single shuffled 52-face pool per hand                                                                     | Prevent duplicate face/manipulation                  | Cryptographic RNG audit            |
| D-04 | One 52-face loadout; 100 manager slots                                                                    | Preserve normal card math                            | UI usability                       |
| D-05 | Six levels: 1/3/5 blue, 2/4/6 red                                                                         | Respect original invention                           | Balance progression                |
| D-06 | Five like-instance fusion in one transaction                                                              | Economy integrity                                    | Reward supply simulation           |
| D-07 | Off-chain unique identifiers at launch                                                                    | Ships without wallets                                | Future provenance extension        |
| D-08 | Rarity bonuses affect only owned hole cards used in five-card hand                                        | Clear authorship and fair shared board               | Player comprehension               |
| D-09 | Score = 1000*category + monotone 0..499 within-tier value + max 1200 buff                                 | One-category upset at most                           | Simulate 100k+ seeded matches      |
| D-10 | Spades Classic tricks ignore rarity                                                                       | Traditional trust                                    | Configure nil/bags at launch       |
| D-11 | Distinct noncash Play Chips / earned-only Trail Credits / paid cosmetic-only Store Gems                   | Fairness and wagering separation                     | Counsel/store check                |
| D-12 | Fixed-content paid cosmetic packs; random earned-only discovery packs; no paid randomized packs or prizes | Monetization without chance-based real-money benefit | Counsel / pack disclosure review   |
| D-13 | OS consent-based steps or accessible alternate, and movement-funded Printing Press upgrade                | Progression / privacy / inclusion                    | iOS+Android validation             |
| D-14 | Curated original location drops and public trail laps ship; partner brand, AR and crypto as adapters      | Distinctive exploring without licenses               | Safety review, pilot trail metrics |
| D-16 | Paid artwork only changes displaySkinId, never earned playStyleFamily/rarity/score                        | Block pay-to-win purchases                           | Monetization QA                    |
| D-15 | Adults 18+ in U.S. initial beta                                                                           | Avoid minor-focused casino-like product              | Ratings / legal review             |

## Decision change protocol

Add dated ADR: context, considered options, proposed change, impacts on fairness/compliance/API/schema, tests needed, owner approval and migration path. Never silently change an immutable past match ruleset.

## v1.1 change log — 27 October 2026

| ID   | Approved design baseline                                                                                                  | Testing / governance needed                                                |
| ---- | ------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| D-17 | Same card `instanceId` upgrades in-place on walking press completion; prior five-to-one fusion still optional             | Atomic state transitions, event history, no retroactive active-match state |
| D-18 | Functional Printing Screens purchased using earned-only Trail Credits; premium screens change art only                    | No paid performance boost; screen-lock concurrency                         |
| D-19 | Accepted walking samples earn Trail Credits and progress only one active Press Job                                        | Canonical dedupe, source corrections, cap testing                          |
| D-20 | Admin-approved public park trails, sequenced checkpoint/lap verification, original trail-only rewards                     | GPS spoof/tolerance, site safety, accessibility, deletion                  |
| D-21 | Unbranded location-category drops can appear near permitted retail areas; branded McDonald's-style drops are partner-only | Site permissions / brand clearance / no proof-of-purchase gate             |
| D-22 | Purchased packs have disclosed fixed cosmetic contents; random earn-only packs need published versioned odds              | Receipt verification; chance policy and fraud review                       |

Quantities and costs are _proposed tuning inputs_ requiring playtest/product sign-off before shipping; they are not fixed economic guarantees.

## Development-readiness questions — 27 October 2026 (pending, not approved ADRs)

The review below records unresolved ambiguities; it does not change D-01–D-22 or authorize scoring, economy or legal changes. The implementation proposal is in `docs/DEVELOPMENT_PLAN.md`. Resolve each question before its affected ticket, recording options, approval, tests and migration impact under the existing decision protocol.

| Review ID | Evidence / question                                                                                                                                                                                                              | Proposed resolution and gate                                                                                                                                                                                                                                                                                                                                                               |
| --------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| R-01      | MASTER_SPEC §20 reuses D-03–D-16 for meanings different from this register.                                                                                                                                                      | Preserve existing register IDs and add an explicit crosswalk in B003; cite section plus topic until reconciled. No product-rule change.                                                                                                                                                                                                                                                    |
| R-02      | §8.1 says “Maps later,” while §24, D-20 and B072–B079 require Explore in v1.                                                                                                                                                     | Treat §24's explicit supersession as controlling. Schedule licensed map/data selection before Explore; “no GPS provider required” means no required vendor, not no device location or tile licensing.                                                                                                                                                                                      |
| R-03      | README calls B001–B008 a schema/CSPRNG sequence, but B003 is architecture and no dedicated early shuffle ticket exists. B027 depends on poker evaluator B012.                                                                    | Use backlog titles, assign shared deck/RNG interfaces in B003 and implementation/tests before deals in B014/B027. Keep Spades independent of poker evaluation.                                                                                                                                                                                                                             |
| R-04      | B001 requires successful CI but B002 creates CI. Other missing prerequisite/release edges are detailed in the development plan.                                                                                                  | Report B001 local completion and pending CI evidence separately; complete acceptance with B002. Review dependency corrections before scheduling affected work.                                                                                                                                                                                                                             |
| R-05      | Draft schema refers to undefined `DisplaySkin`, retains legacy IncubationJob/StepClaim, lacks several required entities and hard constraints.                                                                                    | B004 builds only the currently required schema with real validation. Do not create legacy incubation merely to remove it in B069. Add skin/entitlement, audit, lock, supply, ink and allocation models in scoped migrations when needed.                                                                                                                                                   |
| R-06      | Draft APIs omit request/response schemas and several templated path parameters; trail start/complete names differ from §8.5.                                                                                                     | B003 chooses canonical versioned routes, Zod contracts, authorization, error semantics and public/private socket schemas; validate OpenAPI. Evolve contracts ticket by ticket.                                                                                                                                                                                                             |
| R-07      | 100 steps/credit yields 40 credits from 4,000 steps, less than the proposed 60-credit Basic Screen. The “new player” acceptance assumes available wallet balance but does not specify its source or whether pre-job steps count. | Prefer explicit prior earned balance (6,000 accepted steps for 60 credits, then 4,000 job steps) and no retroactive allocation unless approved. Alternatively approve a disclosed earned onboarding screen or revised tuning. Product approval before B066/B069; test the exact funded and zero-balance journeys.                                                                          |
| R-08      | §24 says a press card remains playable using an old snapshot; B068 rejects a match lock. Cancellation after progress and whether PAUSED/READY jobs retain exclusive capacity are unspecified.                                    | Define start-versus-play-versus-claim locking separately. Proposed: reject start under an existing conflicting match lock; already-running jobs may be played using immutable hand snapshots. Reserve card/screen/capacity through PAUSED/READY until terminal state. Decide claim timing, cancellation/refund and source-revocation behavior before B068/B069; race-test all transitions. |
| R-09      | ActivityClaim uniqueness by source/sample does not establish cross-source overlap dedupe, corrections or reallocation. Native feeds are not inherently server-verifiable proof.                                                  | Specify a canonical interval/source reconciliation policy, stable downstream allocation keys, correction handling after rewards were spent, and realistic trust/abuse model before B061. Test device overlap, edits, deletion, timezone/cap boundaries and replay. Never fabricate proof.                                                                                                  |
| R-10      | Gameplay/economy decisions remain open: exact StandardTieValue mapping and set effects, Spades nil/bags/timeouts, fusion rarity output, reward caps, pack duplicate rules, health/GPS evidence TTL and confidence thresholds.    | Record versioned explicit rules and acceptance fixtures before affected tickets. Owner approval for scoring/economy changes; privacy/safety review for evidence retention. A green scaffold cannot settle these questions.                                                                                                                                                                 |
| R-11      | §8.6 suggests publishing a shuffle seed after closure; that can reconstruct mucked/folded private cards. §4 and acceptance tests require protected hidden information.                                                           | Define disclosure policy before B014/B020. Prefer server-restricted replay evidence/commitments without publicly revealing reconstructive seeds until reviewed. Test post-hand as well as mid-hand privacy.                                                                                                                                                                                |
| R-12      | B038/B060 overlap, old prompts say “Credits,” B039 protects Classic explicitly but paid power is forbidden in every mode, and “play and walk” could imply game-earned Trail Credits.                                             | Use the three canonical currencies from inception; gameplay alone does not earn Trail Credits except an explicitly approved accessibility-equivalent quest. Apply paid-cosmetic isolation to Evolved, fusion, press and route rewards as well as Classic. Scope B038 policy and B060 persistence once.                                                                                     |
| R-13      | No pinned dependency matrix, auth provider, local infrastructure configuration, map vendor or native health adapter is selected.                                                                                                 | Pin compatible workspace versions in B001; decide identity and environment contracts in B003; validate native/provider capabilities at the relevant integration gates. Docker CLI presence does not prove a runnable daemon.                                                                                                                                                               |
| R-14      | Full v1 specifies notifications and season-pass commerce, but the backlog gives these limited explicit acceptance coverage. Global schema text also lists many models absent from the draft.                                     | B003 should map each v1 requirement to owning tickets and acceptance evidence. Expand scoped acceptance or propose additional tickets where needed; do not interpret an 82-row graph as proof of complete product coverage.                                                                                                                                                                |

No approval is inferred from recording these proposals. Most do not block the minimal B001 shells; they gate the corresponding architecture/domain/integration work.

## B001 implementation decisions — 27 October 2026

- Pin Node 22.22.0 and pnpm 10.30.2; use Expo SDK 58 with its React 19.3 / React Native 0.88 baseline, Next.js 16 and NestJS 12. The lockfile is the reproducible dependency authority. Expo's [SDK matrix](https://docs.expo.dev/versions/v58.0.0/) and [monorepo guidance](https://docs.expo.dev/guides/monorepos/) informed the selection. Native iOS requires Xcode 26.4+; the inspected machine has 26.3, so web validation does not imply native validation.
- Shared packages emit CommonJS/declarations and are built before consumers. Keep empty pure domain package boundaries rather than inventing game interfaces or rules before B003. UI exports platform-neutral tokens only.
- The single-screen mobile shell uses Expo's root component entry. Add Expo Router when navigation is introduced; no navigation or product behavior is changed by this temporary scaffold simplification.
- Local Docker services are optional for B001 shells. B004 owns executable Prisma schema/migrations; do not install or validate the known-incomplete draft as though it were production-ready.
- B001 status is tracked separately from the unchanged 82-ticket CSV. Its local implementation can pass while the original “succeed in CI” acceptance remains pending B002. No production deployment is authorized or performed.

## B002 implementation decisions — 27 October 2026

- CI uses two stable required-check names: `Quality checks` and `Dependency audit`. Frozen installs use pinned Node/pnpm; cache only pnpm downloads. Actions are SHA-pinned with read-only permissions and checkout credentials disabled. Remote merge enforcement is verified on `BLUAlteractive/MasterDeck`: both checks are bound to GitHub Actions and required on `main`, including for administrators. PR #1 demonstrated a blocked deliberate failure and successful quality recovery; audit remains blocking. See `docs/B002_REPORT.md` for run evidence.
- Audit all dependencies and fail on high/critical findings or registry errors. Updating express-rate-limit within major 8 resolves two findings. Expo CLI's remaining Zod 3 advisory stays visible and blocks audit; the initial implementation added no risk acceptance or override. The explicit compatibility remediation below supersedes that initial blocker.
- Until B004 creates executable database files, report validation as deferred. Fail the database guard once those paths appear, requiring B004 to implement actual Prisma/migration/integration checks. Do not execute the planning draft or invent migrations in B002.

## B002 dependency compatibility remediation — 28 October 2026

- Context: the latest stable Expo CLI 58.1.16 still requires `zod ^3.25.76`; no patched compatible Zod 3 release exists. Application contracts already use patched Zod 4.6.7. The high advisory blocks required CI.
- Choice: a version-qualified pnpm override changes only `@expo/cli@58.1.16>zod` to 4.6.7. This is maintained by this project, outside Expo's declared range. We reviewed both CLI Zod consumers and added executable compatibility coverage for plugin validation, output variants, MCP command parsing and JSON Schema serialization. Tests fail when the reviewed CLI or Zod versions change.
- Alternatives: waiting leaves development blocked; suppressing the advisory weakens the audit; a global override unnecessarily affects unrelated consumers. A scoped tested override removes the vulnerable dependency while preserving the gate.
- Validation/removal: full quality and audit checks, Expo native bundle exports and local development startup are required. Hosted checks must pass before acceptance. Remove this override and its compatibility tests when an upstream Expo release declares a patched dependency; review new consumers before changing the CLI version. Roll back the remediation commit if incompatible behavior is discovered, restoring the blocked audit gate.
- Impact: development tooling only; no scoring, economy, API, persistence or legal boundary change. Native bundle export does not claim native compilation/device validation. Evidence: `docs/B002_REMEDIATION.md`.

## B003 architecture clarification — 28 October 2026

Engineering baseline and alternatives are in [ADR-0001](adr/0001-platform-boundaries.md), with [architecture](ARCHITECTURE.md), [protocol](PROTOCOL.md), [environment runbook](ENVIRONMENTS.md) and [requirement coverage](REQUIREMENT_COVERAGE.md). This records implementable boundaries, not product-owner approval of pending rules.

- R-01: resolved naming by the crosswalk below; never cite a bare D-ID from MASTER_SPEC §20 as a register ID.
- R-02/R-03: v1 Explore remains core under §24; shared deck/RNG contracts belong to game-core, implemented with B014 and reused by Spades independently of poker evaluation. No backlog dependency is silently edited.
- R-04: hosted B002 checks now pass, completing B001's scaffold CI evidence; see B002_REMEDIATION. M0 still requires B004/B005.
- R-05/R-06: B004 schema review handoff and owning-ticket protocol requirements are documented. Draft OpenAPI path parameters are corrected; master §8.5 trail start/complete naming is selected. Planned operations still need complete per-feature Zod/OpenAPI schemas and auth/concurrency tests when implemented.
- R-12: canonical currencies apply from the first wallet schema; no game-earned Trail Credits except an explicitly approved accessibility-equivalent quest. B038 policy and B060 transaction ownership are distinguished.
- R-13: choose Supabase Auth as B005's first adapter; no provider account, credentials or SDK added. Environment separation and future issuer/audience/JWKS configuration are documented. Map/data and native provider selections remain gated at their owning integration tickets.
- R-14: all 82 ticket IDs are mapped to v1 requirements. Push notifications and season-pass acceptance are recorded as gaps needing owner resolution, not silently removed from launch scope.
- R-07–R-11 remain pending before their affected implementations. No tuning, seed disclosure, source trust or press cancellation decision is approved here. The combined B003–B004 prompt is interpreted sequentially using the backlog: architecture now, executable persistence in B004.

### Master §20 to decision-register crosswalk

The left column belongs only to MASTER_SPEC §20; the right column belongs to this register. The mapping reconciles topics, not product changes.

| Master §20 ID/topic                             | Register baseline                                                                             |
| ----------------------------------------------- | --------------------------------------------------------------------------------------------- |
| D-01 original brand                             | D-01                                                                                          |
| D-02 separate poker modes                       | D-02                                                                                          |
| D-03 loadout/manager                            | D-04                                                                                          |
| D-04 fusion and branches                        | D-05/D-06                                                                                     |
| D-05 red branch earned separately               | Master §4.2/§20 D-05; register D-05 covers branch progression, not a new red acquisition rule |
| D-06 included owned hole cards                  | D-08                                                                                          |
| D-07 capped integer Evolved score               | D-09                                                                                          |
| D-08 Classic Spades legality                    | D-10                                                                                          |
| D-09 nonpurchasable Play Chips                  | D-11                                                                                          |
| D-10 cosmetic Store Gems / earned Trail Credits | D-11/D-16/D-18/D-19                                                                           |
| D-11 fixed paid / earned random packs           | D-12/D-22                                                                                     |
| D-12 launch press and Explore; later AR         | D-13/D-14/D-17–D-21                                                                           |
| D-13 off-chain provenance                       | D-07                                                                                          |
| D-14 independent original IP                    | D-01/D-14                                                                                     |
| D-15 adult initial positioning                  | D-15                                                                                          |
| D-16 no physical-value prizes                   | D-12 and MASTER_SPEC §3.3/§20 D-16                                                            |

Register D-03 additionally specifies the single shuffled 52-face pool (MASTER_SPEC §4.3). Register D-16 specifically isolates paid display skins (§4.1); it must not be confused with master §20 D-16. All unchanged product restrictions still apply.

## B004 database foundation — 28 October 2026

- Pin stable Prisma CLI/client/PostgreSQL adapter 7.10.1; Prisma 8 RC is outside this ticket. The Prisma 7 config owns root CLI URL and explicit seed command; generated client is ignored, regenerated and server-only. API health remains process liveness.
- Implement foundational identity bindings, faces/series/templates, instances, immutable ownership history and scoped committed operations. Defer feature tables and services; no legacy incubation or currency model is created. Sample seed contains only 52 canonical faces and one unpublished no-art series, no player grants.
- SQL adds branch/level/version/identity, composite template consistency, append-only history and scoped uniqueness constraints beyond Prisma metadata. Feature tickets still own atomic business services, source-key semantics, concurrency proof and privacy retention.
- Database checks replace B004's CI deferral with an owned, temporary PostgreSQL container. All mutations, reversal and reset verification target only that generated database; existing Compose data is untouched. Prisma's agent reset guard requires explicit fresh consent; do not bypass it or infer success from the earlier tests.
- Schema rollback SQL is test-only and destructive; deployed recovery uses reviewed forward repair or separate restore, not a reset. No production mutation is authorized by this architecture decision.

## B005 identity boundary — 28 October 2026

- Implement the selected Supabase JWT adapter with fixed server-configured HTTPS issuer/JWKS, audience and asymmetric algorithm allowlists. Test signing keys exist only in isolated tests; no runtime test-auth flag or user-selected key endpoint is introduced.
- Internal user bindings remain stable. Guest linking requires the provider-issued permanent token to resolve to the expected same internal user; it does not merge accounts, reassign cards or trust email/metadata. Cross-account merges remain a product/identity review gate.
- Local session revocation uses durable tombstones; local suspension and token expiry fail closed. Provider sign-out must also be performed by the client, and immediate external provider-wide revocation is not claimed from stateless JWT verification.
- Local database ADMIN plus verified MFA is required for the admin capability probe; no client/provider metadata role grants privileges. Deletion is a queued request plus access suspension, not a completed purge; B051 owns completion/retention/export.
- Socket authentication is wired, but all room/game actions remain unavailable until B018 implements membership and actors. This is auth boundary validation, not a playable room or private event stream.
- Actual development Supabase sign-in/linking and native configuration remain unverified without project setup. Signed-fixture tests are necessary evidence, not a substitute for this external acceptance. No production provider account or resource is created by this ticket.

## B006 catalog foundation — 28 October 2026

- Canonical 52-face values now live in pure game-core and feed database seeds and the original vector renderer. No shuffle, deal or ownership-based face probabilities are introduced.
- Original geometry and labels use no external image/font assets. JSON manifest, bundled data and 53 exports are hash-checked together. Seed art is INTERNAL_PREVIEW and the series stays DRAFT; this is not commercial/designer/producer approval. B044 must verify actual review evidence and authority before publication.
- Asset content/provenance and earned template identity are immutable; new content needs new versions. SQL front/back kinds and face mappings prevent mismatched references. Legacy draft templates may have null art references; public projections reject incomplete/unapproved manifests.
- Mobile preview is a bounded artwork catalog, not owned inventory or a starter grant. Native SVG uses the SDK-recommended 15.16.0; physical device and full accessibility evidence remain B010/B048.
- Expo now recommends 58.0.21 (CLI 58.1.17). Both CLI Zod consumers are byte-identical to reviewed 58.1.16, still declare Zod 3, and pass all five compatibility tests. The scoped 4.6.7 override and exact-version gate now target 58.1.17; no audit suppression or SDK major upgrade.

## B007 starter grant — 28 October 2026

- One permanent per-account grant, independent of request keys or remaining inventory. Client selects only a server-eligible series; UUIDs, face coverage, Blue L1 COMMON state and provenance come from the server. Same-series retries return the immutable original receipt, not current inventory. Different-series retries conflict; no extra key rows are generated for already-granted accounts.
- No preview publication is inferred. `starterEligible` defaults false, and the transaction requires approved PUBLISHED metadata and a uniform COMMON base style. B044 owns approval/administration; the seeded preview remains unusable for actual grants until review. Signed fixtures are only isolated acceptance data; B005 provider acceptance stays open.
- READ COMMITTED plus account/session/publication row locks is sufficient for this single-account source invariant; SQL adds per-user/per-face uniqueness and deferred exact 52-card/event verification. Logout now shares account-first ordering to avoid lock inversion with audit foreign keys. Operation/card/event/grant writes commit together; no provider call occurs under locks.
- Existing IP throttling is supplemented by a bounded 20/user/minute per-process limiter. It is not a distributed quota; permanent SQL uniqueness survives process boundaries. Deployment must provide shared abuse enforcement before horizontal scale.

## B008 ownership history — 28 October 2026

- Add exact-instance origin references and one event per state version. New cards/state changes require complete matching snapshots and operator attribution in the same transaction; old history is never rewritten to make an upgrade pass. A version-one GRANT may be the issuance origin, rather than inventing duplicate mint/grant rows for the same state.
- Owner-only provenance includes consumed/revoked instances and safe actor categories, omitting internal IDs/reasons/source/lock material. Public provenance certificates and audited admin investigation remain future features. Null legacy origin/state is explicit uncertainty, never an inferred grant.
- Lifecycle primitives reserve/unlock with an exact token and retain terminal consumed/revoked rows. They are server-only infrastructure, not feature authorization or fusion/press/refund APIs. Tier, owner, rarity and serial mutation remains blocked until the relevant reviewed feature extends guards with authoritative evidence. Five-to-one fusion and in-place Press evolution remain distinct.
- Migration fails on duplicate legacy versions or LOCKED rows with unknown reservation metadata; it does not delete history, fabricate a token or silently unlock. Origin pointers are backfilled only from existing recorded origin events under a transaction/table lock. Populated legacy reconciliation requires separate review.

## B009 loadout and display references — 28 October 2026

- Implement one explicit primary 52-face selection plus an independent 0–100-slot manager. They are references to owned inventory, never the source of ownership or face probability. Overflow, clearing and replacement cannot delete cards or history; no slot economics or paid preset policy is introduced.
- New loadout saves require currently OWNED exact-face instances; reserved/terminal references remain stored and become visibly invalid on revalidation. This does not decide in-progress match snapshots or the pending R-08 Press play/claim policy. B014/B018 must validate admission atomically before reserving/snapshotting; B068/B069 retain their separate policy/evidence gates.
- Manager organization may reference OWNED/LOCKED cards without authorizing use/spend. Consumed/revoked selections remain marked inactive until changed. Extra inventory stays accessible through owner pagination beyond the first 100.
- Selection writes use normalized request hashes, stable original receipts and optimistic parent versions under account/session/card locks. SQL enforces structural owner/face/revision/completeness/range constraints; supported writers own version/replay replacement semantics. No client mutation of earned identity or ownership occurs, and no ownership event is fabricated for a display change.

## B010 gallery implementation — 29 October 2026

- Replace the static study with virtualized gallery controls and clearly separate draft preview from owned inventory. Preview entries have no invented instance/history/grant. The default root remains preview-only; a named CollectionApp session boundary is wired through a configured official Supabase guest/restore/refresh host. Public development configuration and observed provider acceptance remain B005 gates. No bearer token input, public-env token, global injection or runtime fixture bypass is added.
- Inventory adds safe series/version/status/favorite metadata; original starter receipts keep their separate version-one shape. Preferences live in CardFavorite and never mutate inventory or provenance. Boolean PUT is repeatable and last-commit-wins, not a reward/economy transaction.
- Owned front/back are explicitly neutral references until approved series asset delivery exists. No arbitrary remote SVG, purchased trim imitation or preview-publication approval is inferred. Equip staging is explicit and bounded to one instance/face, with stable idempotency retries and server revalidation.
- SDK compatibility now requires RN 0.88.1 and React DOM types 19.3.0; pin them and Expo Crypto 58.0.7 for native UUID generation. Keep mobile test types in Expo scope, avoiding RN globals in Node tests. Browser/physical-device/provider gates remain unverified; bundle exports and SSR labels do not waive B010 acceptance.

- B010 host completion: add official Supabase 2.118.0, URL polyfill 4.0.0 and SecureStore 58.0.2. Native session storage uses bounded Unicode-safe two-bank chunks; failed writes preserve the prior pointer. Web credentials are tab-scoped. Disconnect clears private UI/credentials and suppresses auto-reconnect if remote revocation fails. No direct Supabase card-table access, anonymous-user auto-creation, credential input bypass or real provider acceptance is introduced.

## B011 archive read model — 29 October 2026

- R-15 (open): MASTER_SPEC §5.2 distinguishes discovered/completed credit from custody, but non-ownership discovery eligibility and revoked-credit handling are unspecified. B011 requests personal achievements and post-fusion history while listing only B008; actual verified achievements and fusion lineage belong to B036/B032. Keep these acceptance gaps open for product/dependency review; do not fabricate discovery/achievement grants or implement their engines in a read-view ticket.
- Expose current versus retained terminal records under the existing immutable-owner model. `recordedFaces` and `completeRecorded` describe database evidence only, including revoked records, and never confer collection rewards or achievement eligibility. Current set completion counts distinct OWNED/LOCKED faces; duplicates/template versions cannot inflate it. Null serial/origin remains uncertainty; no edition caps or parentage are guessed.
- Aggregate whole-owner series totals in SQL and paginate retained instances independently. Reuse B008 provenance; no persisted discovery ledger, migration, deletion, reward policy or new client ownership authority. Transfer-era historical access and credit require a reviewed policy/schema before transfers exist.
- Sequential development can proceed on B011's declared B008 prerequisite while B010 awaits external acceptance. This supersedes earlier delivery wording that barred all B011 implementation; it does not mark B005/B010 accepted, waive their device/provider gates or approve any product/economy rule.

## B012 conventional five-card ranking — 29 October 2026

- Implement only the standard face-only five-card evaluator. Category indices 0–8 and royal-as-ace-high-straight-flush match MASTER_SPEC; no new scoring/product rule is chosen. Exact tie vectors retain all kickers, and suits do not break conventional ties.
- The numeric `strength` is a sparse exact base-15 comparison key, not a dense 7,462-class ordinal or the Evolved formula/0–499 summary. B023 must implement its distinct versioned bounded scoring and exact-rank fallback; this engineering representation does not change the pending scoring/economy decisions.
- Runtime rejects non-five, duplicate, unknown, object and sparse face inputs. All outputs are frozen, and no RNG, collector metadata, network, UI or DB enters the implementation. Server actors retain authority for actual dealt faces and results.
- Keep a test-only constructive rank-pattern oracle outside the runtime build. Exhaustively compare all 52-choose-5 hands, class order/collisions/multiplicities and source-backed frequencies in ordinary CI. A 90-second per-test timeout is scoped to the bounded enumeration; it does not weaken global timeouts or skip the suite. No external evaluator dependency or copied lookup table is introduced.

## B013 best-five-of-seven selection — 29 October 2026

- Evaluate exactly seven validated distinct canonical faces through all 21 B012 subsets. Return the exact Classic rank and every equally best five-card selection; no mandatory hole-card count is introduced. Reorder copied inputs using canonical face order for stable representation only. Suit order never changes verdicts or resolves conventional ties.
- Keep B012 behavior/public exports unchanged, moving its implementation byte-for-byte into a separate module to avoid circular imports. The result and all nested selections are frozen; unknown, duplicate, sparse or wrong-length inputs fail before selecting any candidate.
- Evolved B023 must still evaluate all 21 candidates, not only the Classic winners. Retaining multiple best selections does not determine personal-card attribution, hole-card bonuses, match visibility or rewards.
- Validate generated seeds against an independent direct seven-card rank/suit reference, with separate bitmask traversal for complete tie selections. The deterministic fixture sampler is test-only and not a production RNG/deal. No third-party runtime evaluator or copied tables are added.
- Separate the acceptance matrix's ranking/tie detection item from actual split-pot allocation/settlement. B013 can return equality but cannot settle chips, eligibility or a game. This clarifies verification ownership and changes no scoring/product rule; all payout/side-pot work remains B015/B022.

## B014 Classic hand transitions — 29 October 2026

- Freeze `CLASSIC_NLHE_V1`: 2–6 occupied seats, clockwise dealing with burns, heads-up button small blind, integer chips and a one-billion table-total bound. No ante, straddle or rake. Digital commands are explicit; no live verbal-bet correction or penalties are inferred.
- Minimum raises and player-specific cumulative short-all-in reopening follow [Poker TDA rules 36, 45 and 49](https://www.pokertda.com/view-poker-tda-rules/). A prior check counts as action; an incomplete opening all-in alone does not reopen it. An unacted player may raise by the last full increment. No lone player may build a dry side pot.
- The pure reducer accepts one validated 52-face deck or injected bounded draws. Production CSPRNG selection belongs to B018. Contributions remain in the pot until B015 allocation; no wallet settlement occurs here.
- R-11 remains open: no shuffle seed or private replay is disclosed after closure, since it could reconstruct folded holes. Retain private replay evidence; public fairness proof requires cryptographic/privacy review. This restricts disclosure and does not approve a new public proof policy.

## B015 pure pot allocation — 29 October 2026

- Build ascending contribution layers, return unmatched single-contributor excess, and rank only non-folded contributors to each pot. Allocate integer tie shares separately per pot; remainder chips go clockwise from the first winning seat left of the button, consistent with the linked TDA odd-chip/side-pot rules.
- Return deeply frozen payout/refund/final-stack calculations without mutating hands or wallets. Invalid terminal accounting fails closed. B022 must still provide transactional wallet settlement, idempotency and reconciliation; this library result authorizes no client balance.

## B016 repeatable simulations — 29 October 2026

- Add a test/development-only seeded xorshift fixture source outside runtime builds, plus explicit check/call scripts and legal-action bots. It is not cryptographic and is never imported by the API or production reducer.
- Ordinary CI finishes 1,000 complete hands and verifies replay, stack/contribution conservation and terminal pot allocation with a 2,000-action fail-fast bound. Require all 2–6 seat counts, five command kinds, all streets, fold/showdown endings and actual side pots in the corpus. A first sampler failed seat coverage; changing its fixture generator fixed the corpus rather than weakening the assertion.

## B017 safe Classic explanations — 29 October 2026

- Allow-list recipient projections instead of serializing private hand state. A participant sees own holes; at completed showdown all non-folded hands are tabled for reproducibility. A fold-ending hand reveals no opponent holes or rank breakdown. Folded opponent holes, burns, remaining deck and private replay never leave the engine boundary.
- Explain conventional outcomes with category, complete ordered tie vector, every equally best five and per-pot contributor/eligible/winner/award lists plus refunds. These are server calculations, not client settlement authority. Strict nested Zod schemas reject extra fields; a schema alone does not replace recipient filtering or room membership.
- This is the privacy prerequisite for B018 acknowledgements; full room broadcasts, reconnect synchronization and the B020 realtime acceptance suite remain separate. No new game screen or optional muck/show policy is introduced.

## B018 durable room authority — 29 October 2026

- Use PostgreSQL row locking as the cross-process single-writer boundary: account, session, then room. Recheck current account/session authorization and membership under locks. Apply reducer state plus one append-only event in one transaction; immutable rules/initial state and deferred snapshot/event/membership checks protect the aggregate. No Redis durability or process-local queue assumption.
- Canonical request hashes scope command IDs to the internal actor and poker-command operation across rooms. Replays return the original recipient-safe receipt, including after later commands; changed payload/version/room conflicts. Stale requests return a safe resync snapshot. Clients supply declarative actions only; identity comes from verified auth.
- Persist CSPRNG-created deck/config and private per-version snapshots for deterministic integrity replay. Store a private commitment before exposing holes; publish neither deck nor seeds. R-11 public fairness proof remains unresolved. DB access/backup controls and event-retention policy remain production gates; application logs contain status/duration only.
- B018 supplies an internal single-hand lifecycle primitive and authenticated member read/command handlers (HTTP and socket acknowledgements). There is deliberately no public room creation, funding or matchmaking endpoint. B019/B022 must atomically validate/reserve eligible loadouts and earned chips before live admission; arbitrary client stacks, decks, participants or wins are never accepted. This respects B009/R-08 and does not invent a reservation policy or claim wallet integration.
- Full private replay currently verifies every event on reads/commands. This favors integrity at the initial bounded table size; snapshot compaction, capacity/load evidence, multi-hand orchestration and safe operator tooling remain later work. B020 owns full per-recipient broadcasts; B021 owns reconnect UX. Engine acknowledgements already use B017 projections to avoid a temporary privacy gap.

## B019 lobby boundaries — 29 October 2026

- Add durable public Classic queue and private invite/ready/leave operations. A globally unique active seat per user plus unique lobby/seat prevents duplicate assignment across processes. A PostgreSQL advisory transaction mutex serializes queue selection and roster edits; capacity is checked in SQL. Reads share that mutex to avoid roster-change races. This intentionally favors initial correctness; distributed matchmaking throughput is not claimed.
- Private invites use 256-bit random capabilities with only hashes stored on Lobby; the creation receipt is private to its actor. No public roster/invite enumeration or client-selected identity/seat. Host departure closes the lobby; other roster changes reset ready flags. Ready checks current owned 52-face loadout, but funded admission must revalidate/reserve atomically at B022.
- `canStart` stays false until funded admission exists. Lobby seats do not mint chips, reserve inventory, or start a game with fabricated balances. Initial public tables use two seats; private capacity is 2–6, with no ante/stake/economy tuning introduced. Actual multi-device acceptance remains separate from isolated two-client HTTP evidence.

## B020 recipient delivery — 29 October 2026

- Subscribe each authenticated socket to at most one room after membership validation. Deliver only a fresh B017 projection after rechecking token/session/account/membership, never stored event JSON. Coalesce concurrent refreshes and emit increasing versions; re-read after subscription closes the read/subscribe race.
- PostgreSQL LISTEN/NOTIFY carries only a room UUID after transaction commit. Dedicated listeners work across API instances, reconnect on loss and refresh authorized subscriptions after resubscription. Durable room/event rows remain authoritative; notifications are not a replay log. Shutdown releases listeners and timers.
- Declare already-pinned pg/@types/pg 8.23.1 directly in database rather than importing undeclared transitive dependencies. Factory-held connection configuration stays private. No schema migration or seed disclosure. See [PostgreSQL notification semantics](https://www.postgresql.org/docs/17/sql-notify.html) and [driver events](https://node-postgres.com/apis/client).

## B021 reconnect and timeout policy — 29 October 2026

- Resume revalidates identity/membership and returns a fresh safe snapshot reconstructed from private events. Future cursors fail; no private/historical event stream is exposed. Client reconciliation ignores old versions, preserves pending command IDs across disconnect, accepts original retry receipts without rolling back newer state, and resets private state at a new session boundary.
- Initial server-owned development policy: 30-second turns, persisted immutable timeout duration per hand (internal configurable range 1–300 seconds). Reconnect, reads and duplicate requests never extend a deadline. Expiry checks DB time and checks when legal, otherwise folds; no bot substitution, wallet settlement or new payout rule. Live admission remains gated on B022 and production policy review.
- Multiple workers lock all participant accounts in stable order before the room; timeout source is explicit on immutable events. The event's actor ID identifies the affected seat, not a forged signed user request. Replay verifies deadline/source/action. Player requests after expiry cannot beat a delayed worker. Terminal states have no deadline.
- Legacy rows retain NULL deadlines and historical events are not rewritten or given invented backdated policy; their next accepted action installs the configured deadline. SQL guards atomically match room/event deadlines and preserve immutable rules/timing. Owned rollback restores previous guards before dropping added columns; deployed recovery preserves evidence and uses forward repair.
- B023 quantization/experimental scoring approval has been requested from the product owner. No approval or live Evolved enablement is inferred while that answer is pending.

## B022 earned-only settlement — 30 October 2026

- Use immutable balanced transfers/entries and reconciled materialized accounts. Only the issuance account may be negative; every earned grant offsets issuance. SQL restricts transfer kinds to issuance→player, player→matching hand escrow and completed escrow→participant results. There is no player exchange, purchase, client grant or currency interchange.
- Internal grant code records verified reward decisions supplied by a future trusted adapter; it does not establish eligibility. No production faucet, reward amount, buy-in or blind policy is approved here. Funded admission requires an explicit reviewed policy with approval reference; the running default stays disabled. Persist the full immutable policy snapshot with each admission.
- Under stable account/room locks, reserve earned chips and all 52 eligible owned loadout instances atomically with genesis; preserve immutable earned metadata and card provenance. Completion replays the private engine, computes B015 allocation, settles escrow and unlocks inventory once in the same transaction as its immutable result. Recovery workers retry terminal unsettled rooms; a failure rolls all effects back.
- Publish only recipient-safe settlement metadata after commit. Settlement may change while hand version stays constant, so socket delivery and replicas accept false→true settlement without reverting a newer view. Signed ledger conservation and account-entry reconciliation are operator audits, not client balance authority.
- Additive migration and owned-test rollback are validated with failure/concurrency/restart cases. Populated deployment recovery preserves ledger evidence and uses reviewed forward repair or restore. This does not waive real provider/device, load, backup or operational acceptance.

## B027 pure Spades tricks — 30 October 2026

- Keep Spades independent of poker evaluation despite the backlog's historical B012 dependency (R-03). Reuse only canonical faces, validated 52-card decks and injected shuffle from game-core. Four seats form opposite fixed partnerships; clockwise deal begins left of dealer.
- Follow suit if held; otherwise any card may trump. Lead spades only after broken or when no other suit remains. Highest spade wins, otherwise highest led suit; winner leads next. No rarity or purchased appearance enters the reducer. Private hands and replay remain server/domain-only until B029 recipient projection.
- State is deeply frozen and commands enforce actor, version and legal card. Thirteen tricks consume exactly 52 faces. Seeded replay and an independent trick oracle verify the reducer. B028 adds explicit bidding/scoring configuration; no launch house rules are selected by this ticket. Reference: [basic four-player rules](https://www.pagat.com/auctionwhist/spades.html).

## B028 configurable Spades scoring — 30 October 2026

- Keep launch nil/bags/target choices open (D-10/R-10). Require an explicit versioned integer configuration, copy/freeze it at match creation and export no production default. Published basic-rule values exist only in tests. This selects no launch house rules or wallet rewards.
- One immutable clockwise bid per seat precedes play; zero means nil only when enabled. Non-nil teammates' tricks satisfy their summed contract; nil success/failure scores independently. Failed nil tricks never satisfy the partner contract; their bag accumulation/points are explicit config. Carry and repeated penalties use integer arithmetic; bounded totals fail closed on overflow.
- Score both fixed partnerships once at the thirteenth trick; version/phase reject repeated final actions. Resolve target only after both scores are computed; a tied target continues. A trusted next-round operation rotates dealer and preserves immutable results. This is pure match points, not ledger settlement; B029 must add authenticated durable authority and private projection.
- Standard-rule numeric vectors and generated multi-round replay pass. Source: [Pagat basic scoring](https://www.pagat.com/auctionwhist/spades.html). Live configuration still needs product review; no timeout/bot substitute policy is silently introduced.

## Evolved numeric example conflict — 30 October 2026

- Further review of pending B023 quantization found that uniform floor quantization cannot attain Straight tie 460 or total 5,500. The listed Straight-eligible bonus coefficients cannot attain 1,040 either (no pocket-pair synergy applies to a Straight containing both holes). Do not conceal this with a synthetic bonus bypass or mark the literal acceptance passed.
- [Concrete options](EVOLVED_POLICY_PROPOSAL.md) propose either an explicit Straight tie table and attainable 4,450 + 1,050 fixture, or uniform quantization with revised 5,493 acceptance. Both require owner approval; neither changes product authority while pending. B023–B026 remain unimplemented pending that decision. B019–B022 and independent B027–B028 have continued within existing authority.

## B023 approved experimental Option A — 30 October 2026

- The product owner explicitly selected “A” after the two alternatives were explained. This supersedes the pending Evolved approval gate and authorizes B023–B026 experimental work. It does not approve live Evolved admission or a balance threshold. MASTER_SPEC now records the Straight table and attainable 4,450 + 1,050 = 5,500 fixture.
- Freeze `EVOLVED_A_EXPERIMENTAL_V1`: exact rank classes drive monotone tie quantization; Straight uses the approved explicit table, all other categories uniform floor. Build/check all 7,462 rank classes lazily so Classic does not initialize Evolved tables. Preserve exact-rank fallback and suit-neutral ties.
- Evaluate all 21 five-card subsets with only included, verified owned/reserved hole metadata. Reject foreign owners, board metadata and invalid/duplicate instances. No paid appearance field is read. Trusted publication configuration is copied/frozen and versioned; absent configured effects award nothing. Fixture publication labels are not production eligibility proof.
- Test the 5,500 and 5,210 candidate examples separately with valid cards, plus an actual shared-board upset and selection of a non-Classic-best candidate. The exact 5,210 Flush ranks contain fewer than three king-Straight ranks, so they are not falsely presented as a shared-board showdown. No two-category upset is possible under the cap.

## B024 transparent candidate explanations — 30 October 2026

- Project experimental analysis only after participant/visibility checks: own complete-board hands or non-folded terminal showdown opponents. Hidden/folded opponents return no explanation; outsiders fail. No private deck/event or owner-account metadata enters the allow-listed result, and no Classic settlement is modified.
- Explain all 21 candidates and every included earned hole/component, raw/capped totals, selected bests and exact conventional tie fallback. Strict nested contracts reject extra fields and inconsistent arithmetic. Mobile consumes server results, with spoken descriptions and an expanded-state candidate control; it never imports a scorer or treats power as a wallet instruction.
- Initial SSR caught missing web expanded semantics from native accessibilityState; explicit aria-expanded repairs the web control while retaining native state. Device/VoiceOver/TalkBack and focus acceptance remain unverified. No new persisted feature, migration or live Evolved admission.

## B025 immutable separated modes — 30 October 2026

- Queue by mode and exact rules version; private invites inherit fixed host choices. SQL constrains valid pairs and prevents mid-lobby changes. Preserve legacy command hashes by keeping optional mode absent until server resolution; normalize old Classic receipts with compatible defaults. Client-selected rule versions/metadata and join overrides are rejected.
- Live Evolved admission remains disabled independently in client messaging, API admission/version checks and SQL STARTED guard. This is owner-approved experimental scaffolding, not balance sign-off. Activation requires a reviewed durable Evolved actor/settlement integration and frozen publication/reservation snapshots; Classic continues to use only its existing evaluator and settlement.
- Add Play navigation, authenticated/cancellable lobby operations and a labeled read-only match display. Keep ambiguous retry IDs stable and never show an old game projection under another game/mode. Fix omitted stored lobby status and expose current game ID only to members. Full betting controls, device/provider and accessibility/focus journeys remain separate acceptance gates.
- Disposable migration/rollback and cross-server concurrent queue tests enforce mode isolation, not an assumption that all new Classic players share a table when older open seats exist. Operator logs carry status only. No new economy, live policy or production migration is authorized.

## B026 diagnostic evidence and balance hold — 30 October 2026

- Run and retain 100,000 synthetic paired Classic/Evolved showdowns across six explicit neutral, cosmetic and hypothetical earned-progression cohorts. Preserve seed, fixture/effect/rules versions, complete counts and rounded statistics; CI regenerates normalized evidence. Test-only seeded RNG and effects are not production sources/publication proof or earn-rate assumptions.
- All neutral/cosmetic/face/integer/two-category controls pass. Maximum earned versus baseline gives 80.92% half-tie showdown share and +30.59 percentage points against Classic on identical deals; early earned is 67.36%, +18.17 points. These material advantages are documented, not declared fair. The cosmetic counterfactual changes no payload; its comparison to Classic includes earned style/pair effects and is not a paid advantage.
- Choose no launch balance threshold and do not retune the approved experimental policy automatically. Keep live Evolved disabled pending owner balance review, real progression/effects evidence, betting/multiplayer simulations, playtests and reviewed durable integration. Wilson intervals cover only per-cohort binary outright wins under the synthetic model, not share/paired difference/population predictions. See EVOLVED_BALANCE_REPORT.md.

## B029 durable Spades protocol — 30 October 2026

- Reuse authenticated room join/resume/command envelopes and UUID-only cross-server notifications through a kind router. Keep Spades's private aggregate separate from poker's established SQL invariants. User/session/room locking, immutable events and full integrity replay remain authoritative; allow-list own-hand/public trick projections on every delivery.
- A server-only initializer requires explicit frozen rules. BID/PLAY and declarative CONTINUE requests cannot supply decks or scores; the server alone shuffles the next round. Repeated commands return original safe receipts; stale/future cursors fail safely. Terminal team points/results are atomic and immutable, with no chip rewards or currency interpretation.
- Add no Spades timeout bot or unapproved default. Disconnect pauses until authorized resume. B031 must revalidate/reserve loadouts for public admission and choose a reviewed policy. Real four-device/provider/capacity acceptance remains distinct from scripted four-client evidence. Product policy questions for Spades and fusion were presented early; no answer is inferred while pending.

## B030 Spades client authority and access — 30 October 2026

- The mobile table displays only server-projected hands/legal choices/scores; rank or rarity never decides a trick on the client. Confirm bids explicitly, label nil/partners/last-trick winner and use text plus disabled controls for legality. Dark-surface presentation tokens preserve text/button contrast.
- Refresh bearer state on capped-backoff reconnect, resume the authorized room, and suppress late token/socket/read completions after unmount. Retain pending command IDs on ambiguous transport failures; original retry receipts clear pending without rolling newer snapshots back. Definitive validation/stale failures trigger authoritative refresh.
- Strict Spades wire validation expects exactly one recipient hand and matching frozen rules. Semantic rendering, replica and cancellation cases are evidence; real device/screen-reader/focus testing remains open. Mounting through private-room navigation belongs to B031. No scoring default or automated timeout actor is added.

## B031 private group admission and rematch — 30 October 2026

- Reuse one-active-seat private invite lobbies; Spades requires four seats and an explicit reviewed server policy snapshot. Start revalidates all four loadouts and locks all 208 owned instances atomically with room genesis. Completion and provenance unlock share the final command/result transaction. The same four players must ready again before a linked rematch; concurrent retry keys cannot create parallel successors.
- Safe mode uses bounded preset messages only, outside bidding/play, under membership and DB-time cooldown checks. No external invitation delivery, arbitrary chat, scraped contacts or new social graph. SQL protects snapshots, reservations, active lifecycle and append-only social evidence.
- The main runtime supplies no policy while owner approval is pending. Test rules/approval labels are fixtures, not production authorization. Actual provider/devices/focus/load remain unverified. Paused disconnected games retain inventory; reviewed abandonment/cancellation/recovery is a release gate, not a reason to invent a bot or bypass locks.

### B032 — Explicit-policy five-to-one fusion

- Keep R-10 rarity/art output approval open. Runtime defaults to no policy. A trusted configuration can enable only the versioned matching-template/matching-earned-rarity preservation recipe; test configuration is not product approval. Reject serial-bearing editions until issuance/serial policy is reviewed. No paid cosmetic participates in eligibility or output.
- Persist an immutable five-minute DB-time preview with a proposed new UUID; explicit confirmation binds its hash and exact source versions, policy and selection effects. Consume five/create one and append six provenance events, immutable job and five unique parent edges in the same transaction. Replays return the original receipt even if policy later disables; source locks and permanent ingredient uniqueness protect competing previews.
- Preview and atomically replace affected loadout/manager references, consolidate manager slots to the lowest affected slot, inherit favorite if any source was favorited and preserve parent history. Changed selection effects require new consent. This avoids silently leaving consumed cards selected. No in-place Press semantics are reused.

### B033 — Explicit fusion consent and receipt verification

- Show five source losses, exact new child and selection effects before separate acknowledgement/confirmation. Retain the same command on ambiguous failures; prevent cancellation/new selection until its receipt is recovered. Verify child, parents, effects and preview identity before success. Keep pending state across tab navigation, abort/reset it on account changes; full process restart needs collection/archive reconciliation.
- Honor the OS reduced-motion preference; preference read failure defaults to a fully visible static result. Semantic/transport tests and web compilation are not physical-device accessibility acceptance. Main's fusion policy remains disabled pending R-10 review.

### B034 — Optional native activity read boundary

- Use a local read-only Expo HealthKit/Health Connect module. No GPS, health writes, background or historical-wide access. Explicit foreground permission/read actions only; no reward endpoint trusts a client total. Source IDs, revisions, origins and bounded intervals are retained only in transient local review. B061 must establish canonical server ingestion/verification, corrections and one-Press allocation before earning.
- HealthKit read denial is intentionally opaque: READ_REQUESTED and empty data are not GRANTED or proof of denial. Exclude manual, overlapping, conflicting-revision and implausible local records without awarding anything. A local filter is not a trusted anti-cheat verifier.
- Native acceptance remains open: installed Xcode 26.3 is below documented 26.4+, Android adb/toolchain absent and no physical-device observations. Syntax/autolinking/web/TS tests do not satisfy B034's device definition of done. B035 depends on B037, so implement B036/B037 before its quest integration.

### B036 — Verified source facts and idempotent badges

- Derive typed progression facts only from immutable settled poker, completed Spades and confirmed five-parent fusion records. Replay private game state and verify settlement before extracting outcomes; never expose private cards in progression views. No client event-write/grant endpoint.
- Explicit versioned policy controls eligibility/targets. Preserve first processed source policy and immutable goal definitions; dedupe sources, facts and per-goal consumption, reconcile counters and unique grants in SQL. Main policy defaults null. Only prestige badges are supported here; approved currency/card/XP grant adapters remain distinct.
- A source result earns at most one matching fact per user; replaying one full house ten times cannot meet the ten-distinct-outcome goal. Saturating counters and durable award keys survive worker/service restarts. Full collusion/eligibility review remains a release gate.

### B037 — Published UTC mission windows and durable recovery

- Reuse versioned progression goals/consumption/grants for daily, Monday-week and bounded-season prestige missions. Timed definitions require explicit start/end; UTC boundaries and inclusive-start/exclusive-end are documented engineering policy and frozen in goal definitions. Original result timestamps determine windows, not processing or client clocks.
- Recover missed event projections after restart; dedupe per goal/window/event and grant. Only backfill facts accepted under the same permanent/opponent/command eligibility. SQL verifies the same window, counters and reward completeness. Main configuration remains disabled until content/eligibility/reward review; no monetary or card reward values invented.

### B038 — Canonical wallet restrictions and B060 overlap

- Keep earned Play Chips in B022 and one separate balanced journal per Trail Credits/Store Gems currency. A closed purpose matrix forbids exchanges, user transfers, cashout, purchased chips, paid screens/earned packs and paid power. No public credit/debit/grant endpoint is added. Internal primitives require feature-verified decisions; fixtures are not activity/payment proofs.
- Resolve R-12 overlap by implementing the three-balance persistence and reconciliation here for dependent accessibility work. B060 reuses this ledger rather than introducing a second canonical activity balance; remaining legacy/integration acceptance stays with B060/B061. No executable legacy Credits table exists to migrate.
- Source-key replay returns the original journal reference; modified decisions conflict. SQL enforces same-currency two-account balanced directions, materialized balance reconciliation, immutable identities/history and nonnegative player/sink balances. No numeric earn/spend policy is selected or activated.

### B035 — Explicit nonwalking quests, no fabricated steps

- Build after B037 and B038 due to the documented dependency gap. Approved-policy opt-in uses new verified server facts, not health/GPS permission, disability evidence or a client step total. Freeze goal/plan terms, allow one active enrollment and one claim per goal/window, and consume each user/source once across accessible quests. Daily rollover closes expired leases.
- Atomically credit Trail Credits under the shared activity/quest UTC cap and persist an immutable `ACCESSIBLE_QUEST` proof for a matching Press recipe. Current server-transaction UTC day agrees with journal timestamps. A distinct nonwalking proof is not a step sample. B068/B069 must enforce single-job consumption and existing screen/supply/card requirements; that missing integration means full B035 functional Press acceptance remains open.
- Main accessible policy remains null pending owner review of equivalent tasks/rewards. No health access or disability disclosure is required. Existing policy snapshots cannot be retuned; changed configuration pauses claims and displays the original terms. No card upgrade is claimed by this ticket.
- Concurrent mission registration exposed Prisma client-side upsert's create race. Use insert-on-conflict-do-nothing then verify immutable policy hash; apply the same initialization pattern to shared wallet system accounts. Ten-worker mission regression and full DB reversal tests pass.

### B039 — Fixed cosmetics only, reviewed catalog and explicit price reference

- Store presentation is structurally separate from CardInstance/earned metadata: closed original colors/motifs and no functional modifiers. Publish frozen fixed contents only after product/item approval; allow-list visibility defaults off. No public grant/purchase route or paid randomness.
- Explicit minor-unit scale makes catalog reference prices unambiguous; they are not the native platform's final localized quote. This build cannot initiate payments. Product/price/rights, account age/region and platform review remain required; COMMERCE_REVIEW.md enumerates assumptions rather than asserting approval.
- Query distinct owned items before cursor pagination so repeated grants cannot hide other cosmetics. Paid source verification belongs to B040; refund-aware multiple-grant ownership belongs to B041. No card, chip or earned currency mutation occurs here.

### B040 — Platform-verified, bound, cosmetic-only purchases

- Use official Apple JWS/API and Google OAuth/ProductPurchaseV2 verification. Client paid flags and notification state never establish a grant. Require permanent managed identity and server-created account bindings. Freeze approved fixed cosmetic contents and canonical purchase identity; Apple restore IDs map to originalTransactionId. Main remains unconfigured pending product/platform review.
- Separate sandbox/production purchases, proof keys, queues and inventory views. Encrypt raw platform evidence with AEAD and row-specific associated data; private keys/credential JSON/JWS are ignored. Public CA fixture is trust material, not a credential. New grants require a purchase FK; unknown legacy paid evidence is a migration blocker, not an invitation to backfill trusted proof.
- Deduplicated durable webhook inbox and acknowledgement retries operate after provider authentication and reverify before grants. Acknowledge Google only after entitlement commit. Verified refund tombstones revoke purchase-derived cosmetics only; older valid receipts never reactivate them. Paid items never touch CardInstance or any currency ledger. Real store/device, policy, age/region, key-rotation and security acceptance remain open.

### B041 — Owner restore and durable refund recovery

- Reuse canonical verified purchases for restore; return current status and bounded owner/environment history. Preserve independent grants of overlapping items. Never debit a wallet or mutate functional cards on cosmetic refunds.
- Reverify durable purchase evidence and scan authenticated Google voids with encrypted pagination. Immutable revocation tombstones apply even before initial verification and survive interruption before grant reconciliation. Google's 30-day horizon cannot prove older missed refunds; sticky coverage gaps require operator review. Refund reversal is not automatic reactivation. Main remains disabled pending native/platform and review gates.

### B042 — Gated initial tournament format and pre-deal binding

- Proposed initial format is a full 2/4/8/16/32 permanent-account field, registration-order balanced seeding, Classic heads-up single-hand elimination, fresh rematches for equal final stacks, free entry and a nontransferable prestige title. Dispute-window hours are explicit reviewed configuration. Main defaults off; these choices do not assert product approval for scoring/economy or activate competition. Broader formats and abandonment/forfeit policy require review.
- Bind a server-created private lobby before dealing and its room inside existing earned-chip admission. Never accept a client-selected past room or reported winner. Replay immutable canonical GameResult state, check exact participants/allocation and atomically advance/title under tournament lock. Fresh attempt numbers prevent delayed readiness consenting to a rematch; normal lobby edits cannot break a bound roster.
- Admin scheduling/replay requires a current permanent ADMIN role and MFA, reason and immutable idempotency audit. Brackets expose event-local seeds, only own room IDs and no private hand state. Result reports are participant-scoped, private, immutable and idempotent during the configured window; a receipt is not an automatic winner reversal. B045 owns complete moderation triage. No invented between-round timeout, result override or uncontrolled item grant.

### B043 — Explicit next action and shared private-room transport

- Display server eligibility, free tournament entry separately from the existing earned-only hand stake, exact readiness attempt, bracket/standings, archived champion/title and scoped result-report receipts. Preview mode does not invent a scheduled event or sign-in. Client clocks only hide expired report controls; the server enforces the actual window.
- Reuse the poker replica/legal commands and one protocol-decoded socket transport for poker/Spades. Keep stable pending command IDs across reconnect/refresh, discard stale frames, fetch fresh bearer credentials and clean up private state on session/unmount. No optimistic winner, chip or award projection.
- Correct the server next-action view for a bound lobby after failed admission: only its designated host can retry start, while the opponent waits. Real funded retry/settlement is covered by an additional database case. Full moderation triage remains B045; native accessibility/device and reviewed tournament activation remain open.

### B044 — Scoped catalog authority and immutable review

- Operator-provisioned capabilities refine local ADMIN; every command rechecks current role, scope and MFA under lock. No public capability grant or mint endpoint. Draft templates reference existing art assets; commercial provenance must already be approved by the trusted pipeline. Editor, two independent reviewers and publisher cannot substitute one actor for the full review chain.
- Review the exact publishable manifest hash. Retire published series rather than rewriting earned templates. Live cosmetic switches require both an approved fixed product and the existing server allow-list; disabled offers are hidden from sale; B049 separates authoritative late receipt fulfillment so valid platform purchases are not stranded. Existing purchase restore/refund evidence remains valid. Main remains unconfigured for live commerce.
- Admin UI receives a refresh-aware managed-auth connection from its host, stores no bearer token and defaults disconnected. This implements administration infrastructure, not a claim of real operator/rights/provider approval.

### B045 — Participant safety without invented forfeitures

- Bind reports and block targets to verified room participation. Preserve immutable report version/hash and versioned block events; future admissions reject blocked pairs in either direction. Blocking an existing opponent does not modify an already accepted hand or payout.
- SUPPORT requires current operator scope, local ADMIN and MFA; audited suspension revokes sessions and open ordinary queues, while game escrow/locks and tournament evidence remain intact. Reinstatement cannot bypass pending deletion and never resurrects old bearer sessions.
- Dispute inspection replays authoritative poker/Spades history and returns bounded hashes/proofs rather than hidden-card or shuffle snapshots. Staff decisions are triage records, not an automatic result override. Incident/appeal/forfeit policy and full moderation operations remain beta gates.

### B046 — Reconciled aggregates and explicit measurement coverage

- Dashboard reads require current scoped MFA, reason and immutable audit. Use one repeatable-read database snapshot, bounded conflict retries, exact monetary strings and aggregate counts only. Paid counts are production-verified purchases; reference prices are not revenue.
- Record one latest server collection timestamp for authenticated nonempty inventory views/successful favorites; combine with settled match and fusion/Press history for rolling WEC. Do not invent historical view/archive/incubation facts or let analytics grant rewards. Coverage is disclosed and B051 owns retention/erasure.
- HTTP latency is a bounded process-only histogram with fixed labels and since-boot timestamp, separate from database facts. Integrity exceptions need investigation; zero counts do not prove absence of fraud.
- Security follow-up for B049: review disabled storefront offers with delayed first-time verified purchase proofs. An offer switch must not strand a legitimate already-paid transaction; distinguish sale visibility/initiation from authoritative fulfillment of earlier platform evidence. Live billing remains disabled until this is resolved and platform-tested.

### B047 — Optional feedback and adaptive mobile shell

- Keep sound/haptics off by default and scoped to the current identity session. Use original procedural audio, no microphone or background recording/playback permission, strict foreground checks and cleanup of late async playback. Feedback cannot replace a visible server result or block a command.
- Compact navigation and getting-started guidance preserve current account safety disclosures and server-only availability. Card interaction respects system reduced motion; orientation is adaptive. No guest linking or permanent-account policy is improvised.
- Web/TS/native configuration checks cannot satisfy real Android/iOS journey acceptance. Native toolchain/device gates remain open. Current dependency audit also reports moderate advisories in unchanged CLI/lint paths; B049 reviews them before beta.

### B048 — Measured accessibility evidence, open device sign-off

- Preserve full rank/suit text and distinct suit shapes alongside color; test the 52 accessible names and actual active palette/ink contrasts. Do not mutate hashed art merely to add an unreviewed visual variant.
- Share system reduced motion once per session, default reduced on uncertainty, and remove modal fade when requested. Keep scalable minimum-48 controls and press retention for motor drift.
- Automated/source audit is not physical VoiceOver/TalkBack, focus/large-text or full journey acceptance. Maintain an explicit device matrix and the nonwalking Press integration dependency; no accessibility claim establishes activity proof or a reward.

### B049 — Least privilege and paid-proof integrity

- Close legacy tournament ADMIN privilege with a distinct operator-provisioned GAME_OPERATOR scope, fresh MFA/current-role checks and SQL audit scope validation. Existing audit history is retained; no default administrator gains the new capability.
- An offer switch controls storefront sale visibility, not the validity of an already-paid platform proof. Continue approved fixed cosmetic fulfillment/restore/refund for legitimate delayed evidence; never invent a paid balance, contents, price or functional reward.
- Harden API response caching/framing/sniffing, add tracked-secret CI checks and scope maintainer-patched minimatch/glob to exact current CLI/lint parents. Validate actual command/build paths; retain the inherited low trusted-config deepmerge risk and external penetration/provider/device/edge/key-operations gates.

### B050 — Observed room load and bounded transaction recovery

- Measure 500 unfunded canonical room actors and 1,000 distinct signed fixture clients on an owned loopback database. A trusted bootstrap may explicitly raise handshake admission for this experiment; main's rate limits remain unchanged. Report actual hardware/latency/privacy results and do not infer 500 funded-table or production/mobile capacity.
- Recognize Prisma adapter-wrapped PostgreSQL serialization/deadlock conflicts with bounded identity retries/backoff. Do not retry arbitrary auth/provider errors. Controlled cancellation must roll back the entire journal; replaying the same source then commits once. Lost command acknowledgements retain the original key/version and event count.
- `ci:load` reuses the disposable database runner, ignores caller connection strings and repeats acceptance after owned reverse migrations/reset/reseed. Optional timing measurements are explicit; normal CI does not pretend it ran the 500-room case.

### B051 — Consent before optional analytics and verified deletion before completion

- Three independent server choices default off; policy-bound opt-in is unavailable until reviewed regional policy/retention configuration exists. Withdrawal purges optional collection telemetry; current opt-in gates WEC. No step/location proof or OS permission is inferred.
- Owner-scoped bounded exports omit tokens, proof vaults and opponent private state. They do not substitute for a reviewed regional access-request process. Immediate suspension/revocation queues deletion; active locks, missing provider setup and retry failures are explicit states.
- Require actual trusted-provider removal and independent absence verification before atomic local pseudonymization. Retain immutable financial/game/provenance/consent evidence under the reviewed retention policy, preserve keyed issuer tombstones against identity resurrection, and fail closed if that key is missing. Main has no policy/provider credentials; test fixtures confer no legal/provider approval. Reverse SQL is disposable-only.

### B052 — Observe a clean restore without claiming production recovery

- Extend the owned database runner with an explicit recovery mode, a second clean database and privately extracted original assets. Compare every public table, replay every poker/Spades history, recompute settled outcomes and reconcile balances/origins. Keep dumps in bounded process memory and print aggregate evidence only; cleanup remains mandatory on failure.
- Measure the frozen fixture snapshot's dump/restore/verification interval. Production PITR/offsite encryption, workload RPO/RTO, asset storage, key custody, deletion reapplication and operator sign-off remain separate open gates. Reverse SQL remains disposable-only; production recovery preserves append-only history and uses reviewed forward repair.

### B053 — Signed readiness is separate from runnable development

- Add strict, artifact-bound Ed25519 release attestations with role-scoped reviewed public keys, fresh timestamps and independent reviewer keys. The actual registry is empty, all feature intents are false and every real gate is unverified. Schema validation may pass while release:check correctly fails NO-GO; no test signer is a real approval or deployment authority.
- Explicit staging/production API configuration rejects development origins, ambiguous production startup and database TLS downgrade. Empty env templates and runbooks do not provision or isolate actual resources. The manifest describes reviewed feature intent; main still has no live policy/provider wiring and no JSON switch enables future services.
- Resolve backlog numbering against product authority: B053/B054 cannot waive the appended core B060–B082 pack/Press/Explore and real-device end-to-end gates. P2 B055–B059 remain optional. B054 is numerically next but distribution is blocked; B060 is the next implementable core review. Actual human go/no-go and staging traffic rollback remain open despite the successful owned B052 restore.

### B060 — Reuse the existing three-wallet ledger

- B038 already introduced explicit Play Chips, Trail Credits and Store Gems; there is no persisted legacy Credits balance to convert. Preserve all existing accounts/journals and add no speculative migration or currency exchange. Add an exact-string server-balance mobile view and demonstrate that an earned balance cannot fund a paid-currency debit, with full transaction rollback.
- Earn rate, cap and prices in the Press specification are proposals. No production economy/provider is activated by wallet presentation; later tickets require explicit versioned reviewed policy and fixtures are not approval.

### B061 — Canonical ingestion without invented health trust

- Introduce an explicit server verifier port for bound activity evidence, not an endpoint accepting native JSON, counters or a client success flag. No production verifier exists in this repository. Keep ingest unavailable until the reviewed trust path, permission/device evidence and versioned earning policy are provided; native read diagnostics remain distinct.
- Under the user lock, accept whole nonoverlapping intervals once across sources/devices/sessions, reject manual/stale/future/implausible/day-crossing records and never manufacture prorated steps. A day snapshots its policy; cap Trail Credits independently from a single selected Press allocation. The B069 job resolver remains a downstream server transaction port until that ticket.
- Preserve canonical source/proof hashes, coarse allocations and receipt history. Source corrections/deletions produce deterministic signed step adjustments in immutable review holds; stop additional activity rewards and functional Trail Credit spending rather than fabricate negative balances or silently rewrite completed cards. Automated correction resolution requires separately reviewed recovery policy and is not activated here.
- Purge precise interval timestamps after configured retention, consent withdrawal or deletion; retain minimized allocation/deduplication evidence. A withdrawal watermark prevents fresh IDs/other devices from re-crediting the scrubbed interval after opt-in. UTC-crossing intervals are excluded until a real verifier supplies trustworthy per-day records; do not estimate their split.

### B062 — Immutable reviewed pack definitions and exact odds

- Persist append-only pack versions, exact integer pool weights, explicit copy/guarantee rules, time/stock/region metadata and fixed cosmetic product references. Earned randomness accepts Trail Credits only; fixed paid packs contain only approved exact cosmetic items. Paid randomized or functional paid definitions are structurally rejected.
- Independent content/economy reviewers and a separate publisher bind their audit to the exact definition hash. Validate published original card art and fixed product contents before review/publication and every new use. Catalog drafting/publication never mints items. Main has no pack allow-list or live activation approval.
- Display exact per-draw numerator/denominator odds; stock caps count whole openings, not undisclosed per-card rarity changes. Region enforcement and stock/atomic draw fulfillment are B063, billing pack verification is B064. Configured prices/weights remain explicit reviewed data, not silently approved economy tuning.

- B062 paid-stock clarification: fixed cosmetics require `stockLimit: null` until a trusted platform purchase-admission/reservation flow can honor finite caps without rejecting legitimate delayed proofs. Earned stock limits remain supported; no finite paid-stock promise is activated.

### B063 — Atomic earned openings and bound supply provenance

- A whole opening, its exact version/hash, one Trail Credit debit, independently minted card origins and bound ink share one transaction. Serialize user then pack stock; no partial debit or oversell. Every retry preserves original instance IDs and does not call a region provider after commitment. Historical receipts remain readable when new openings are disabled.
- Use server-generated encrypted seeds and versioned HMAC-SHA256 rejection sampling, exact integer weights and immutable draws for internal replay. The API returns a seed commitment, not a usable seed or hidden RNG state. Production key custody/rotation and reviewed economy configuration remain activation gates.
- Trail Ink is an earned bound supply with a reconciled append-only journal, not a fourth purchasable/exchangeable currency. No public grant endpoint exists. Later Press and trail tickets must provide authoritative transactions and source evidence for their allowed supply reasons.

### B064 — Fixed packs reuse immutable verified cosmetic entitlements

- Bind an independently reviewed fixed pack to one immutable multi-item cosmetic product and exact platform SKU. Current offer admission requires fresh permanent identity, unchanged definition, enabled global offer and a configured platform verifier; it grants nothing. Regional paid admission remains unavailable without trusted region verification.
- Reuse the B039/B040 transaction, account binding, encrypted proof, multi-grant snapshot, refund and restore journals. Do not introduce a second pack payment ledger or let current sale visibility invalidate an already-paid proof. Concurrent verified purchases grant exact preset items once; refund all items from that purchase and preserve unrelated ownership. Main/native checkout and real platform acceptance remain explicitly unactivated.
- Pack admission hardening also enforces the master spec's linked-account spending boundary for earned openings. Guest quest earning remains independently supported; a guest cannot spend earned pack credits before linking. Already committed owner receipts remain readable/retryable.
