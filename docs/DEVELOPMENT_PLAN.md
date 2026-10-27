# Development readiness review and proposed implementation plan

Date: 27 October 2026. Status: proposed; no application implementation authorized by this review.

## Outcome and product understanding

The first implementation ticket is **B001 — Monorepo scaffold**. The first milestone remains **M0 Foundation, B001–B005**, delivered as five small changes. Its demonstration is a locally running mobile/admin/API foundation with a database, CI and identity boundary. It is not yet a playable game. M1 delivers the first collection vertical slice; M3 delivers networked Classic poker.

DeckForge is a persistent collection platform for individually identified playing cards, shared across Classic Hold'em, separately labeled Evolved Hold'em and Classic Spades. A face, an edition/template, an owned instance and a purchased display skin are different concepts. Games deal from a single canonical 52-face pool, then resolve collection appearance. Inventory never determines shuffle probabilities.

Production v1 includes fusion, same-instance Printing Press upgrades, earned packs, fixed-content paid cosmetics, curated public trails and safe nearby drops. Functional progression is earned. Play Chips, Trail Credits and Store Gems remain separate. AR, licensed campaigns, trading and blockchain are outside the critical launch path. Game scoring and economy tuning remain subject to their documented approval gates.

## Repository and development environment

Reviewed all 13 existing files: AGENTS, README, master specification, both prompt files, decisions, exploration/press specification, backlog CSV, sprint plan, acceptance matrix, draft API, draft Prisma schema and launch gates.

Current folders are `architecture/`, `backlog/`, `docs/`, `legal/`, `prompts/` and `tests/`. The tests folder contains an acceptance checklist, not executable tests. There are no application directories, package manifests, lockfile, migrations, CI workflow or environment configuration. Git reports that the directory is not a repository.

Observed tools: Node v22.22.0, pnpm 10.30.2 and Xcode 26.3 (17C529). Docker and Java executables are on PATH. Docker daemon readiness, Java version, Android SDK/emulators, signing, physical devices and service credentials have not been verified. Installed versions are observations, not a selected compatibility matrix.

### Intended stack from the specification

| Layer | Baseline | Development approach |
|---|---|---|
| Workspace | Strict TypeScript, pnpm, Turborepo, ESLint, Prettier, Vitest | Pin a mutually compatible toolchain and commit its lockfile in B001; do not assume newest versions interoperate. |
| Mobile | React Native, Expo development builds, Expo Router | Minimal bootable shell first; native health/location validation on iOS and Android in the relevant tickets. |
| Mobile data/UI | React Query, transient Zustand state, Skia/Reanimated | Add as needed; do not let UI state become authoritative game state. |
| Admin | Next.js | Local shell first, RBAC in B005, content tools in B044. |
| API and realtime | NestJS, REST, Socket.IO/WebSockets | Health endpoint first; validation/auth boundaries before business endpoints. |
| Jobs | Node worker, BullMQ | Boot/shutdown shell first; queues when required by a ticket. |
| Persistence | PostgreSQL, Prisma | Local reproducible service, scoped migrations/seeds and rollback conventions in B004. |
| Coordination | Redis | Presence/rate limits/queues; never the sole inventory or settlement record. |
| Assets | S3-compatible storage and CDN | Introduce with catalog/content requirements, not a dependency for booting B001. |
| Identity | Managed provider or Supabase Auth | Select in B003, integrate in B005; deterministic test identity must not become a production bypass. |
| External adapters | StoreKit/Play Billing, OS health/location, licensed map/data | Select and validate before the corresponding tickets; no fabricated trusted proofs. |
| CI | GitHub Actions | B002; schema validation added when the executable schema lands in B004. |

Environment separation: local development with nonproduction data; isolated test databases; later staging with sandbox billing and test identities; production only after release gates. No production account or paid external service should be needed just to run B001. Native hardware and provider access will be required for later acceptance.

## Reusable engine boundaries

- `packages/game-core`: common face/deck primitives, injected randomness contracts and engine protocol; no poker-specific categories.
- `packages/card-domain`: pure instance, loadout and evolution rules, independent of persistence.
- `packages/game-poker` and `packages/game-spades`: separate pure reducers/evaluators depending on shared primitives; Spades must not depend on poker evaluation.
- `packages/contracts`: validated public commands/events and projections, with explicit separation from server secrets.
- `packages/ui`: presentation primitives with explicit native/web boundaries; no domain or authorization authority.
- `services/api`: authorization, CSPRNG adapter, serialized room commands, safe projections and transactions.
- `services/jobs`: retry-safe asynchronous work; durable transactional events/outbox design where required.

Inject deterministic randomness in tests and server-owned cryptographic randomness in live play. Keep mutable inventory out of a live hand: persist immutable eligible-card and ruleset snapshots. Create the package boundaries in B001, formalize contracts in B003, and implement actual rules only in their tickets. B055's future plugin expansion is not needed to achieve these boundaries.

## Backlog review

A read-only CSV graph check found exactly 82 unique tickets, B001–B082, 63 P0 / 14 P1 / 5 P2, no missing dependency references and no dependency cycles. This validates the declared graph, not its completeness.

Numeric order is not sufficient: B035 depends on B037; B058 depends on B072 and B075. Milestone groups also need ordering: B062 requires B044, and B064 belongs to M7 despite falling inside the sprint plan's B060–B071 range under M6.

Recommended dependency corrections, pending review:

1. B001 acceptance requires CI, while B002 builds it. Prove B001's commands locally, then treat its CI acceptance as pending until B002. Do not claim B001 fully accepted prematurely.
2. Implement B044 before B062 and the dependent pack/route authoring flows. Preserve the ticket IDs; reorder delivery rather than duplicating an admin publisher.
3. B064 should explicitly depend on B040 and B041 for verified billing, refund and restore behavior.
4. B071 should include B035 for accessible earning acceptance. B078 must integrate B074/B077 for actual drop/lap reward journeys, and B082 should explicitly gate on B035, B071, B074 and B079.
5. B054 must gate on B082 and B048, and on the complete v1 release checklist. Its current graph can reach beta without the added press/trail gate or explicit accessibility audit.
6. B027 should depend on shared face/deck primitives rather than B012's poker evaluator. Assign shared shuffle/integrity work explicitly across B003 and B014 before either game uses it.
7. Clarify B038 as wallet policy/domain invariants and B060 as three-currency persistence/transaction integration. Avoid two competing wallet implementations; use three currency names from the first schema rather than manufacturing a legacy Credits migration.
8. Retain P1 features required by v1 acceptance, including accessible alternatives and usable Spades/Press/Explore screens; P1 does not mean dispensable at launch.

## Proposed phases and evidence

| Phase | Ticket scope and order | Demonstration / gate |
|---|---|---|
| M0 Foundation | B001 → B002 → B003 → B004 → B005 | Fresh local setup, mobile/admin shells, reachable API, DB and protected identity flow. |
| M1 Collection | B006 → B007 → B008/B009 → B010/B011, one ticket at a time | Exactly 52 starter instances under concurrency, provenance, valid loadout and usable gallery. |
| M2 Pure Classic poker | B012–B017 in dependency order | Exhaustive five-card distribution, independent seven-card oracle, legal reducer, side pots and conservation tests. |
| M3 Realtime Classic | B018–B022 | Authenticated clients finish a match, reconnect safely, receive no private opponent data and settle once. |
| M4 Evolved | B023–B026 | Separate queues, versioned score explanation and 100k+ reproducible balance simulations. |
| M5 Spades | B027–B031 | Four clients complete bidding, 13 tricks, team scoring and reconnect using shared infrastructure. |
| M6 Earned progression | B032–B038, B060–B063, B066–B071; pull B044 forward before B062 | Fusion, three wallets, canonical activity, accessible alternatives, earned packs and same-ID press evolution. Deliver B036 → B037 before B035. |
| M7 Commerce and Explore | Remaining B039–B046, B064–B065, B072–B079 | Verified cosmetics/restore/refund, tournaments, reviewed drops/routes, lap awards and emergency disable. |
| M8 Production readiness | B047–B053, B080–B082, then B054 | Device E2E, accessibility, privacy, abuse/load/recovery evidence and owner-reviewed beta gate. |
| M9 Optional expansion | B055–B059 after prerequisites and separate authorization | No effect on v1 completion. |

These are acceptance-based phases, not calendar promises. Deliver one ticket per change. Reassess at each demonstration rather than building all packages or all models at once.

## First milestone definition of done

M0 is complete only when:

1. The workspace contains the four application/service shells and six named packages, with strict TypeScript and enforced pure-domain import boundaries.
2. A clean setup uses pinned Node/pnpm versions, a lockfile, safe `.env.example` files and documented start/stop/reset commands. Git initialization and remote/branch protection setup are explicitly accounted for.
3. Mobile and admin shells actually launch, the API health endpoint responds, and the jobs shell starts and stops cleanly. A local mobile-to-API smoke flow covers simulator/device host configuration. No gameplay is implied.
4. Build, lint, typecheck and meaningful smoke tests pass from the workspace root. CI runs the same checks from a clean install. A deliberate failure is observed failing and removed in B002; required checks are configured on the actual repository, not merely documented in YAML.
5. B003 records provider/environment decisions, package boundaries, public/private protocol separation and transaction/idempotency conventions. Open product questions remain explicitly pending.
6. B004 supplies an executable, validated, scoped Prisma schema with local Postgres, migrations, reproducible seeds, constraints, integration evidence and rollback/reset instructions. Do not deploy the entire draft schema blindly.
7. B005 proves guest/account identity, linking, token verification, private-resource authorization and admin RBAC boundaries with unauthorized/forbidden tests. Its inventory-preservation contract must have test evidence; starter-grant concurrency is completed in B007.
8. Each ticket reports actual commands/results, changed files, relevant negative cases and remaining risks. External checks that cannot run are blockers or pending evidence, never reported as passes.

## B001 implementation boundary, when requested

Planned files: root `package.json`, `pnpm-workspace.yaml`, `pnpm-lock.yaml`, pinned runtime/package-manager configuration, shared TypeScript/lint/format/test/task configuration, `.gitignore`, `.env.example`, README setup instructions; minimal manifests/configuration/source/smoke tests under `apps/mobile`, `apps/admin`, `services/api`, `services/jobs`, and the six named `packages/` directories. Exact filenames and compatible versions should be stated before coding. Full GitHub Actions policy belongs to B002; executable database migrations belong to B004.

B001 local acceptance: frozen clean install; lint/typecheck/test and shell builds succeed; shells demonstrably boot; shared imports resolve; documented environment setup works without secrets. Leave its explicit CI criterion pending B002. Exclude gameplay, card minting, wallets, health/GPS ingestion, purchases and deployment.

## Review evidence and limitations

Executed: file inventory/document reads; CSV count, ID, dependency-reference and acyclicity checks; tool-path and Node/pnpm/Xcode version inspection; Git status attempt (failed because no repository exists).

Not executed: application lint/typecheck/tests/builds, Prisma validation/migrations, emulator/device tests, Docker service checks or CI. No application scripts or installed workspace dependencies exist. No current external SDK compatibility or legal/store-policy validation was performed; this report describes the repository's intended stack and boundaries.

Changed files for this planning task: this document and the pending-question appendix in `docs/DECISIONS.md`. Existing product baselines, backlog rows and application state were not changed.
