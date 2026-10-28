# Environments and local runbook — B003

28 October 2026. This describes current B001/B002 commands and the future environment separation. B003 created no cloud resource or deployment. B004 now supplies executable local database migrations; see the database guide.

## Configuration ownership

`pnpm setup:local` copies templates without overwriting existing ignored files. Each process reads its workspace `.env`; Compose reads root `.env`. Root values are not automatically passed into workspace `.env` files. Restart the relevant process after changing a value. API and jobs validate their active configuration with Zod at startup; API/worker database/Redis URLs remain reserved and unused by the current shells. Prisma CLI reads root DATABASE_URL independently.

| Template                     | Current variables                                                                      | Visibility / behavior                                                                                                                           |
| ---------------------------- | -------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| Root `.env.example`          | POSTGRES_USER, POSTGRES_PASSWORD, POSTGRES_DB, POSTGRES_PORT, REDIS_PORT, DATABASE_URL | Local Compose only. The sample password is public development data, never a deployed credential. Loopback bindings by default.                  |
| `services/api/.env.example`  | HOST, PORT, CORS_ORIGINS; reserved DATABASE_URL and REDIS_URL                          | Server-only. Default loopback host, port 3001 and exact web/admin origins. Reserved connection URLs must follow changed Compose ports manually. |
| `services/jobs/.env.example` | JOBS_HEARTBEAT_MS; reserved REDIS_URL                                                  | Server-only heartbeat 1,000–60,000 ms; default 30,000. No queues are registered yet.                                                            |
| `apps/mobile/.env.example`   | EXPO_PUBLIC_API_URL                                                                    | Public and compiled into bundles. API URL is not a secret. Never add credentials to EXPO_PUBLIC variables.                                      |
| `apps/admin/.env.example`    | None                                                                                   | Static shell; no admin authentication or privileged SDK exists yet.                                                                             |

Future B005 configuration will define server AUTH_ISSUER, AUTH_AUDIENCE and AUTH_JWKS_URL and public provider URL/publishable-key settings when the adapter lands. These are names/design slots, not values consumed by today's code. Provider secrets and admin/service keys remain server-only; do not put them in NEXT_PUBLIC or EXPO_PUBLIC variables. Validate issuer/JWKS configuration against trusted deployment configuration, never a token-supplied URL.

| Environment               | Data and services                                                                | Access / required evidence                                                                                                                 |
| ------------------------- | -------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| Local shell               | Local ignored env; optional Compose; no auth provider required                   | Current health and static shells; local public sample credentials only.                                                                    |
| Automated unit/HTTP       | Isolated temporary state and ephemeral API port; no developer credentials needed | Signed auth fixtures only when B005 adds them. No shared DB.                                                                               |
| B004 database integration | Disposable PostgreSQL database/role per run                                      | Empty migration, reset/seed/constraints and rollback evidence; never a production URL.                                                     |
| Staging (future)          | Separate database, Redis, issuer/project, object storage and sandbox billing     | Protected secrets, test identities/receipts, feature flags, opt-in synthetic evidence. No copied production health/location records.       |
| Production (future)       | Separate least-privilege resources and secrets                                   | Release gates, monitored backups/restore, approved provider/geo rights/retention. No local test-auth bypass or sandbox receipt acceptance. |

## Launch and verify locally

Use Node 22.22.0 and pnpm 10.30.2 from the committed runtime/package-manager pins. From the repository root:

```bash
pnpm install --frozen-lockfile
pnpm setup:local
pnpm dev:api
```

In another terminal:

```bash
pnpm dev:web
```

Open <http://localhost:8081> and use **Check API connection**. Check liveness independently with `curl --fail http://localhost:3001/health`; expected JSON is `{"service":"deckforge-api","status":"ok"}`. Liveness does not prove database, auth or queue readiness. Optional `pnpm dev:admin` serves <http://localhost:3000>; `pnpm dev:jobs` emits a readiness message. `pnpm dev` starts all shells after building shared packages; explicit web launch above is easiest for a browser smoke check.

For iOS simulator use localhost; for Android emulator use `http://10.0.2.2:3001`. For a physical device set the mobile URL to the host's reachable LAN IP and API HOST to `0.0.0.0` on a trusted network. Browser CORS must contain the exact browser origin if the port/host changes. Native compile/device validation requires the documented Expo SDK 58 platform toolchains; bundle export alone is not equivalent. The earlier inspected Xcode 26.3 did not meet the 26.4+ requirement.

Ctrl+C stops each foreground development process. Do not use global process-kill commands. Shared packages emit `dist`; run `pnpm build:packages` after editing them or restart the root development command. Expo environment changes require restarting Expo.

## Optional infrastructure and recovery

Start Docker Desktop, then `pnpm infra:up` and `pnpm infra:status`. Use `pnpm infra:down` to stop services; PostgreSQL's named volume is retained. Redis is disposable; it must not be used as the only ledger or match record. B004 adds `db:deploy`, `db:seed` and guarded manual `db:reset`; see [database instructions](../prisma/README.md). Do not execute `architecture/schema.prisma` as a migration.

If API startup fails, inspect whether the port is occupied and validate HOST/PORT/CORS_ORIGINS without printing the full environment. If mobile cannot connect, verify health first, then API host, emulator/device URL, firewall and exact CORS origin. If a sandbox denies an ephemeral HTTP bind, rerun the affected verification with local-port access; that is not an application assertion failure. If Docker is unavailable, the current shells still run without it. Port changes require updating both root Compose values and reserved connection URLs.

Do not delete a database volume as routine troubleshooting. The database guide defines explicit local reset/data-loss instructions and migration/rollback verification. Production incident recovery uses approved operations runbooks and restored backups, not developer reset commands.

## Automated verification

```bash
pnpm ci:quality
pnpm ci:database
pnpm ci:audit
pnpm --package=@redocly/cli@2.72.0 dlx redocly lint architecture/API_CONTRACT.yaml --extends spec
```

The first command checks formatting, lint, types, tests and builds. Database validation now uses a fresh disposable PostgreSQL container for migrations, seeds, constraints, rollback and reset; Docker is required. Audit requires registry access and fails high/critical findings. The last command downloads a pinned documentation validator and validates the draft's OpenAPI structure; it does not prove planned handlers or domain rules exist. See [CI](CI.md) for required GitHub checks and the scoped Expo CLI override. Do not install speculative database/auth/map SDKs for this ticket.
