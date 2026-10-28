# B005 — Auth and permissions report

28 October 2026. **Backend locally validated; full acceptance pending actual development Supabase provider verification.** B004 passed local and hosted checks; this separate branch stacks on it. No provider configuration was present in the inspected workspace, and none was invented. No production service, player account or external sign-in was created during this ticket.

## Changed files

- `services/api/src/auth/token-verifier.ts`, `errors.ts`, `service.ts`, `controller.ts`, `socket.ts`: fixed issuer/JWKS and asymmetric JWT validation, server-owned identity/session/role authority, safe error envelopes/logs, private owner inventory, same-principal guest-link idempotency, local session revocation, admin/MFA probe, queued deletion and authenticated deny-by-default socket boundary with rate/expiry controls.
- `services/api/src/app.ts`, `main.ts`, `config.ts`, `.env.example`, `package.json`: conditional auth wiring, bounded body parsing, lifecycle shutdown and complete HTTPS provider configuration. No configured provider means private routes fail closed while health works.
- `packages/contracts/src/index.ts`, `architecture/API_CONTRACT.yaml`: strict input/output schemas, actual auth endpoint descriptions and implemented/planned operation separation.
- `prisma/schema.prisma`, `prisma/migrations/202610280002_auth/migration.sql`, `prisma/rollback/202610280002_auth.sql`: server-owned UserRole, session/revocation records, append-only auth audit and pending deletion queue; transactional SQL, session integrity triggers and test-only reversal.
- `services/api/src/auth/auth.integration.test.ts`, `services/api/src/app.test.ts`, `prisma/foundation.integration.test.ts`, `vitest.config.mts`, `vitest.database.config.mts`, `scripts/ci-database.mjs`: real signed-token HTTP/socket/database cases, negative config/body tests, distinct integration runner and reverse-ordered test rollbacks. Foundation seeding assertions now compare instance counts before/after to coexist with independent auth fixtures.
- Root `package.json`, `pnpm-lock.yaml`: API dev command now builds its database/contract dependencies; pinned socket test client/types; API pins JOSE 6.2.13, Socket.IO 4.8.4 and server-only database workspace dependency.
- `docs/AUTH.md`, `README.md`, `prisma/README.md`, `docs/ENVIRONMENTS.md`, `docs/PROTOCOL.md`, `docs/DECISIONS.md`, `backlog/STATUS.md`, this report: identity setup, retention/revocation/deletion limits, unresolved provider gates and actual evidence.

## Validation actually run

- Read assigned backlog/architecture/product authority and inspected existing API/schema/config. No development AUTH/Supabase variable names were present. No Supabase connector was available.
- Queried and pinned JOSE 6.2.13, Socket.IO/server/client 4.8.4 and Express types 5.0.6. Dependency install succeeded after correcting an initially unquoted workspace wildcard rejected by zsh.
- `prisma format`, `pnpm db:generate`, `pnpm db:validate`: passed. Migration generated using a schema-to-schema diff from B004; the initial migrations-directory diff required an unconfigured shadow DB and was replaced without contacting any existing database.
- Early strict typechecking caught unvalidated fetch JSON and an incompatible Node event helper for the socket client. Responses now use shared Zod schemas and socket events use a typed bounded helper; checks passed afterward. A lint warning for an unused response schema was fixed by validating the logout response.
- `pnpm ci:quality`: **23 tests in 4 files passed**, formatting/lint/strict types passed, **11 package builds passed**.
- `pnpm ci:database`: passed **18 integration cases in 2 files**, both before and after reverse migrations/reset/reseed. The same already-approved temporary-reset scope was used; consent remained process-local. Caller database URL was ignored and the runner-owned PostgreSQL container was removed.
- Auth integration cases use runtime-generated ES256 key pairs and a local JWKS HTTP server with two rollover keys, actual HTTP and Socket.IO connections and PostgreSQL. Ten auth cases cover missing/expired/wrong issuer/audience/service-role/tampered tokens, concurrent bootstrap, cross-owner reads, owner selector rejection, replayed same-user linking retaining card IDs, stale anonymous-token denial, local-role/MFA enforcement despite client metadata, durable revocation/no resurrection, room denial, packet reauthorization, idle expiry, suspension and pending deletion. These are test-signed tokens, not a fabricated claim that managed sign-in occurred.
- `pnpm --package=@redocly/cli@2.72.0 dlx redocly lint architecture/API_CONTRACT.yaml --extends spec`: passed.
- `pnpm ci:audit`: passes high/critical threshold with one inherited low advisory. The inherited project-maintained Expo/Zod compatibility override remains documented.

- Final frozen install, formatting/whitespace, local documentation links and known-credential-pattern checks passed. No private env files or known token/private-key patterns were found (limited scan, not a comprehensive audit).
- `pnpm dev:api` built contracts/database and started successfully; HTTP health returned expected JSON and unconfigured `/v1/me` returned 503. The smoke server was stopped.

## Remaining acceptance and risks

Actual Supabase anonymous token issuance, native/managed identity conversion, provider sign-out and administrator MFA configuration must be observed with a development project. Signed fixture evidence does not satisfy that external acceptance. Needed public configuration is the development project URL and publishable key; no service-role/admin secret is needed for basic anonymous sign-in. A configuration question is pending; no production key is requested.

The API preserves one internal user and existing inventory on same-provider identity conversion. Cross-account merge is explicitly rejected and still requires reviewed proof/policy. The mobile shell has no sign-in UI or refresh-token storage integration yet. Admin is a capability probe, not role provisioning/catalog tools. Rooms remain unavailable until B018; no private game broadcast is implemented. Deletion is queued/suspends access, not a privacy purge. Local logout revocation is enforced; immediate provider-wide revocation of already-issued JWTs is not claimed.

Auth tombstone/audit/deletion retention and provider purge belong to B051. Destructive reversal SQL is for the owned disposable test database only; production recovery requires reviewed forward repair or separate backup restore. No paid economy, score, activity/location proof or gameplay behavior changed.

Next smallest action: supply development identity configuration and complete B005's observed provider flow before marking M0 complete. Next planned ticket afterward: B006 — Card catalog and art manifests. No merge is performed by this work.

## Hosted backend validation

[Run 40725254362](https://github.com/BLUAlteractive/MasterDeck/actions/runs/40725254362) passed Quality checks and Dependency audit at commit b6c013e, including auth/database migration, rollback and reset/reseed tests on Ubuntu. [Draft PR #4](https://github.com/BLUAlteractive/MasterDeck/pull/4) remains pending real-provider acceptance. No merge was performed. Independent B006 catalog work can proceed while provider setup is pending; B005/M0 acceptance remains open.
