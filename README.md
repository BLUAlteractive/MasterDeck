# DeckForge

A collectible playing-card platform. **The application is in incremental development.** Gameplay, card grants, purchases and activity/location integrations are not implemented. B005 adds backend identity/permission boundaries; actual provider-flow acceptance remains pending development configuration. DeckForge remains a working title.

## Prerequisites

- Node **22.22.0** (`nvm install && nvm use` if using nvm).
- pnpm **10.30.2** (`corepack enable && corepack prepare pnpm@10.30.2 --activate`, if Corepack is installed; otherwise `npm install --global pnpm@10.30.2`).
- Docker Desktop or another working Docker Compose v2 engine for optional local PostgreSQL/Redis.
- Native builds additionally require the Expo SDK 58 native toolchain: Xcode 26.4+ for iOS, and a compatible Android Studio/SDK/JDK setup for Android. Web development requires neither. The scaffold does not require an Expo account or cloud build.

## First local launch

Run from the repository root:

```bash
pnpm install --frozen-lockfile
pnpm setup:local
pnpm dev
```

`setup:local` copies each `.env.example` to an ignored `.env` **without overwriting existing files**. `dev` builds shared packages and starts API, jobs, admin and Expo together. Open the admin at <http://localhost:3000>. Open the Expo web preview at <http://localhost:8081> (or run the explicit web command below). The API liveness response is at <http://localhost:3001/health>. The gallery opens in clearly labeled artwork preview mode; use the API health URL to check liveness. Stop the dev processes with Ctrl+C.

For an explicit browser-only mobile launch, use two terminals:

```bash
# Terminal 1
pnpm dev:api

# Terminal 2
pnpm dev:web
```

Then open <http://localhost:8081>. Optional separate shells: `pnpm dev:admin` and `pnpm dev:jobs`.

The jobs process only prints readiness/heartbeat messages and handles shutdown. Admin is a static shell with no administrative actions. The API always exposes a rate-limited public health route; configured B005 private routes require verified managed identity and a migrated database. Health reports process liveness, not database readiness.

## Local database services

```bash
# Start Docker Desktop first, then:
pnpm infra:up
pnpm infra:status
pnpm infra:down
```

PostgreSQL is bound to `127.0.0.1:5432`, Redis to `127.0.0.1:6379`. Both are local development services. The example database password is deliberately public and must never be used in deployed environments. `infra:down` preserves the Postgres named volume. B004 adds pinned Prisma, a scoped schema, migrations and development seeds. Set root DATABASE_URL from the updated template, then run `pnpm db:deploy` and `pnpm db:seed`. Existing env files are preserved by setup. Run `pnpm ci:database` for isolated migration/constraint/rollback/reset checks. See [database instructions and destructive reset safeguards](prisma/README.md). Redis data is disposable in this scaffold.

If ports are occupied, change root `.env` infrastructure ports and the reserved API connection URLs together. API `PORT` and the mobile `EXPO_PUBLIC_API_URL` must also agree. Health and the bundled artwork preview can run with Docker stopped; public catalog and private identity requests need a migrated PostgreSQL database.

## Mobile and networking

```bash
pnpm build:packages
pnpm --filter @deckforge/mobile ios
# or, with a configured Android emulator/device:
pnpm --filter @deckforge/mobile android
```

Native commands generate ignored native projects and may download native build dependencies. They require the platform toolchain. B001 also supports the Expo Go preview where the installed client supports SDK 58; future native health/billing modules require development builds.

- Browser/iOS simulator API URL: `http://localhost:3001`.
- Android emulator: set `apps/mobile/.env` to `EXPO_PUBLIC_API_URL=http://10.0.2.2:3001`.
- Physical device: use the computer's reachable LAN IP, set API `HOST=0.0.0.0` in `services/api/.env`, and permit local-network access only on a trusted network. API defaults to loopback.
- Browser CORS: add an exact browser origin to API `CORS_ORIGINS` if you change the web host/port. Do not use a wildcard.
- Restart Expo after environment changes. `EXPO_PUBLIC_*` values are bundled and **must never contain secrets**.

Shared packages compile to `dist/`; after editing a shared package, rerun `pnpm build:packages` (or restart `pnpm dev`). No external API credentials are needed for the health/static shells. See [identity setup and remaining acceptance](docs/AUTH.md) for optional B005 auth configuration.

## Automated checks

```bash
pnpm check          # formatting, lint, typecheck, Vitest HTTP/contract/config tests
pnpm build          # shared TS, API/jobs, Next production build, Expo web export
```

Individual commands: `pnpm format`, `pnpm format:check`, `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm test:watch`. Tests start an isolated API on an ephemeral loopback port and do not require Docker or real accounts. `pnpm test:watch` assumes shared packages have already been built.

GitHub Actions configuration is implemented in **B002**. Run `pnpm ci:quality`, `pnpm ci:database` and `pnpm ci:audit` locally. The high/critical dependency audit now passes locally and on GitHub after a scoped, tested Expo CLI/Zod compatibility override; verification is tracked in [B002 remediation](docs/B002_REMEDIATION.md). See [CI setup and blockers](docs/CI.md) and [B002 validation report](docs/B002_REPORT.md). Native builds, real-device UI behavior and database readiness are separate from a green web build.

## Workspace

```text
apps/mobile/          Expo + React Native shell (also exports to web)
apps/admin/           Next.js future administration shell
services/api/         NestJS public liveness endpoint
services/jobs/        Node worker lifecycle shell
packages/game-core/   Pure shared engine boundary (no rules yet)
packages/game-poker/  Pure Classic five-card ranking and best-five-of-seven selection
packages/game-spades/ Future Spades rules, independent of poker
packages/card-domain/ Pure collection/evolution boundary
packages/contracts/  Zod public API contract
packages/ui/         Platform-neutral presentation tokens
packages/database/   Server-only generated Prisma client and development seed
prisma/              Executable foundation schema, migrations, seed and DB tests
scripts/             Repeatable local environment setup
```

The game/domain packages may not import UI, network, database or server frameworks. Production game state, deals, inventory and rewards will remain server-authoritative. No frontend result or balance will become authoritative.

## Catalog preview

B010 replaces the static B006 study with a virtualized gallery: search, suit/series filters, rank sorting, front/back inspection and session-only preview favorites. It is draft artwork, not an owned starter grant. Run `pnpm dev:api` and `pnpm dev:web`; see [catalog and art guide](docs/CATALOG.md). The public server catalog excludes the default draft seed. Gameplay and purchases are not part of the preview.

## Product and delivery references

- [Project engineering rules](AGENTS.md) and [canonical master specification](MASTER_SPEC.md).
- [Exploration and Printing Press](docs/EXPLORATION_AND_PRESS.md), [decisions](docs/DECISIONS.md), [development plan](docs/DEVELOPMENT_PLAN.md).
- [82-ticket backlog](backlog/BUILD_BACKLOG.csv), [ticket status](backlog/STATUS.md), [B001 validation report](docs/B001_REPORT.md).
- [Architecture baseline](docs/ARCHITECTURE.md), [protocol](docs/PROTOCOL.md), [environment runbook](docs/ENVIRONMENTS.md), [ADR-0001](docs/adr/0001-platform-boundaries.md), [requirement coverage](docs/REQUIREMENT_COVERAGE.md).
- [Execution prompts](prompts/START_HERE.md), [acceptance matrix](tests/ACCEPTANCE_MATRIX.md), [launch gates](legal/LAUNCH_GATES.md).

The files under `architecture/` are draft reference contracts; OpenAPI explicitly marks implemented health and planned business operations. They are not deployed schemas or proof of implemented features.

The owned gallery accepts a verified session connection from the managed-auth host; the default root does not fabricate a connection or accept pasted tokens. With public Supabase configuration the root provides managed guest/restore/refresh and secure native storage. Actual provider/linking/MFA and physical-device acceptance are still pending. See [gallery integration and verification](docs/COLLECTION_GALLERY.md).

B011 adds **Album & archive** navigation with owner-only retained records, serial/origin inspection and independent current/historical series counts. Preview exposure creates no discoveries or achievements. See [archive behavior, setup and acceptance gaps](docs/ALBUM_ARCHIVE.md).

B012 provides the pure [Classic five-card evaluator](packages/game-poker/README.md). Run `pnpm test:poker:exhaustive` to check all 2,598,960 hands and 7,462 exact rank classes. No playable table is added by this library ticket.

B013 adds validated best-five-of-seven selection with every equivalent best choice, plus `pnpm test:poker:seven` for generated/reference tests. See [B013 evidence and limits](docs/B013_REPORT.md). A complete playable poker game is still future work.
