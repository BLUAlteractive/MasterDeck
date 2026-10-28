# DeckForge

A collectible playing-card platform. **B001 provides a runnable development scaffold only.** Gameplay, accounts, card grants, purchases and activity/location integrations are not implemented. DeckForge remains a working title.

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

`setup:local` copies each `.env.example` to an ignored `.env` **without overwriting existing files**. `dev` builds shared packages and starts API, jobs, admin and Expo together. Open the admin at <http://localhost:3000>. Open the Expo web preview at <http://localhost:8081> (or run the explicit web command below). The API liveness response is at <http://localhost:3001/health>. Use **Check API connection** in the mobile shell to verify its public contract. Stop the dev processes with Ctrl+C.

For an explicit browser-only mobile launch, use two terminals:

```bash
# Terminal 1
pnpm dev:api

# Terminal 2
pnpm dev:web
```

Then open <http://localhost:8081>. Optional separate shells: `pnpm dev:admin` and `pnpm dev:jobs`.

The jobs process only prints readiness/heartbeat messages and handles shutdown. Admin is a static shell with no administrative actions. The API exposes only a rate-limited public health route. Health reports process liveness, not database readiness.

## Local database services

```bash
# Start Docker Desktop first, then:
pnpm infra:up
pnpm infra:status
pnpm infra:down
```

PostgreSQL is bound to `127.0.0.1:5432`, Redis to `127.0.0.1:6379`. Both are local development services. The example database password is deliberately public and must never be used in deployed environments. `infra:down` preserves the Postgres named volume. Database migrations, seeds, Prisma CLI/client and persistence arrive in **B004**; there is no migration/reset command in B001. See [database boundary](prisma/README.md). Redis data is disposable in this scaffold.

If ports are occupied, change root `.env` infrastructure ports and the reserved API connection URLs together. API `PORT` and the mobile `EXPO_PUBLIC_API_URL` must also agree. The shells can run with Docker stopped because they do not yet use persistence.

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

Shared packages compile to `dist/`; after editing a shared package, rerun `pnpm build:packages` (or restart `pnpm dev`). No external API credentials are needed for the shells.

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
packages/game-poker/  Future Hold'em rules
packages/game-spades/ Future Spades rules, independent of poker
packages/card-domain/ Pure collection/evolution boundary
packages/contracts/  Zod public API contract
packages/ui/         Platform-neutral presentation tokens
prisma/              Database boundary; executable schema deferred to B004
scripts/             Repeatable local environment setup
```

The game/domain packages may not import UI, network, database or server frameworks. Production game state, deals, inventory and rewards will remain server-authoritative. No frontend result or balance will become authoritative.

## Product and delivery references

- [Project engineering rules](AGENTS.md) and [canonical master specification](MASTER_SPEC.md).
- [Exploration and Printing Press](docs/EXPLORATION_AND_PRESS.md), [decisions](docs/DECISIONS.md), [development plan](docs/DEVELOPMENT_PLAN.md).
- [82-ticket backlog](backlog/BUILD_BACKLOG.csv), [ticket status](backlog/STATUS.md), [B001 validation report](docs/B001_REPORT.md).
- [Execution prompts](prompts/START_HERE.md), [acceptance matrix](tests/ACCEPTANCE_MATRIX.md), [launch gates](legal/LAUNCH_GATES.md).

The files under `architecture/` are draft reference contracts. They are not deployed schemas or proof of implemented features.
