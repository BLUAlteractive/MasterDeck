# B018 — Durable authoritative room actor

Implemented a server-authoritative single-hand room kernel. PostgreSQL account/session/room locks serialize commands across independently instantiated API services. Current authorization/membership is checked under locks. Reducer transitions and append-only private events commit atomically; strict declarative commands cannot supply identity, cards, wins, stacks or balances. Ruleset and state versions are persisted and checked.

Same-key retries return their original safe receipt after later commands. Changed semantic requests conflict. Stale versions return safe resync state. Private initialization, CSPRNG deck/config commitment and command history reproduce persisted snapshots after a service restart. HTTP reads/commands and authenticated Socket.IO acknowledgements use B017 allow-list projections. No private event endpoint or public initialization/admission endpoint is exposed.

## Changed files

- `prisma/schema.prisma`, additive migration `202610290002_game_rooms/migration.sql`, matching test-only rollback: room/member/event models, unique version/actor-command constraints, immutable history/initial-rule guards and deferred aggregate consistency.
- `services/api/src/rooms/service.ts`, `rooms/controller.ts`: private initialization, CSPRNG, durable replay/integrity, atomic command handling, authorization, idempotency, safe stale snapshots and status/duration metrics.
- `services/api/src/app.ts`, `auth/socket.ts`: service/controller wiring and safe socket acknowledgements using existing authentication/origin/payload/rate boundaries.
- `services/api/src/rooms.integration.test.ts`: 11 integration cases with real fixture-signed JWT/JWKS, HTTP, sockets and two independently instantiated services/DB clients.
- `services/api/src/auth/auth.integration.test.ts`: adapt the existing denial fixture to a valid command envelope so it continues testing inaccessible rooms and connected-session revocation.
- `packages/contracts/src/poker.ts`, `poker.test.ts`: strict canonical command/join/receipt schemas, spoofed field and amount/version rejection.
- `services/api/package.json`, `pnpm-lock.yaml`: link existing workspace game-core/game-poker packages only; no new external dependency.
- README, poker package README, Prisma README, `docs/POKER_ROOMS.md`, decisions, backlog status, acceptance matrix, B014–B017 evidence and this report: protocol/setup/recovery/remaining gates and hosted results.

## Actual verification

- `pnpm ci:quality`: **173 cases in 27 files**, formatting, lint, strict types and **11 builds passed**.
- `PRISMA_USER_CONSENT_FOR_DANGEROUS_AI_ACTION='continue' pnpm ci:database`: **62 cases in nine files passed twice**, before and after complete rollback/reset/reseed in the runner-owned PostgreSQL container. Prisma validation/generation, deploy/redeploy, migration status and seed/reseed passed. Developer/shared/production DBs were not reset or mutated.
- The 11 new DB cases verify CSPRNG deck/genesis persistence, membership/privacy, ten parallel unique-key requests with one commit, room locks across different users/clients, ten duplicate-key requests with one effect, original receipts after later events, changed-request conflicts, HTTP stale resync, illegal-action rollback, completed-hand restart replay, forced event-write failure rollback, SQL immutability/consistency, locked revocation/expiry checks and socket joins/commands. Existing auth/inventory/catalog/history/loadout regressions remain passing.
- `pnpm ci:audit`: passed the high/critical gate; one inherited low advisory remains.
- `pnpm exec tsc -p tsconfig.tests.json`, schema formatting, `git diff --check`, and targeted contract/reducer/harness checks were run during development. Final CI-quality is the authoritative combined type/test evidence.
- HTTP readiness: existing API health returned `ok`; restored Expo web preview returned **HTTP 200 on port 8081**. No browser visual, native compile or physical-device claim.

Initial failures were repaired before the successful gates: noninteractive/offline relinking found a missing cached pinned React DOM tarball, so network installation restored pinned dependencies; a Socket.IO test initially used Node EventEmitter's incompatible `once` type; the old auth fixture still sent the placeholder command shape; final formatting needed a correction. Four concurrent fixture account creations also exceeded the existing auth service's serializable retry budget; setup is now sequential while room-command concurrency remains exercised. Authentication burst capacity remains an observed separate risk, not a claim of production readiness.

## Limits and next work

Internal initialization does not fund a wallet, grant cards or admit arbitrary clients. B019/B022 must validate/reserve real loadouts and earned chips before live admission. Public room creation, multi-hand orchestration, full B020 broadcasts, B021 reconnect UX and B022 wallet settlement are not implemented. R-08 snapshot and R-11 public fairness/privacy policies remain open. No seed is revealed. Actual managed-provider/device acceptance remains pending.

Full private replay is O(command history) per operation; capacity/compaction and deployed DB/backup/retention controls require later evidence. See [room setup, protocol, metrics and recovery](POKER_ROOMS.md). The rollback SQL is destructive test-only; populated deployments require preserved evidence/backups and reviewed forward repair, not history deletion. No production migration, merge or deployment occurred.

Next smallest ticket: **B019 — Matchmaking and private rooms** (subject to real admission prerequisites and the existing auth/provider gates).

Implementation commit `006eb8c`; [draft PR #17](https://github.com/BLUAlteractive/MasterDeck/pull/17) tracks both required hosted checks. A final test strengthening observes both PostgreSQL lock waiters explicitly, rather than relying on elapsed time alone. The compiled package consumer smoke passed CSPRNG deal, terminal allocation/conservation and safe projection exports.

Final strengthened-lock rerun passed all 62 DB cases before and after rollback/reset/reseed again. Final test types, focused lint, repository formatting and whitespace checks passed.

Hosted implementation validation passed both required jobs on [CI run 41007444203](https://github.com/BLUAlteractive/MasterDeck/actions/runs/41007444203) for `006eb8c`. Current branch checks remain visible on PR #17, including the strengthened test and final documentation.
