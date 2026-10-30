# Classic poker engine and durable rooms

B014–B018 provide a reusable pure engine, integer pot allocation, reproducible test harness, safe outcomes and server-authoritative single-hand room commands. They do not yet provide a playable table UI, public matchmaking, funded admission or wallet settlement.

## Local verification

From the repository root, with Node/pnpm pinned by the repo:

```sh
pnpm install --frozen-lockfile
pnpm setup:local
pnpm test:poker:harness
pnpm test:poker:harness --seed 874
pnpm ci:quality
pnpm ci:database
```

The database runner owns a random disposable PostgreSQL container and ignores the developer database. It deploys/redeploys, seeds/reseeds, tests, reverses every migration, resets/reseeds its own database and repeats tests. Docker must be available. Never point ad hoc reset commands at a shared database.

For the existing collection preview: `pnpm dev:web`, then [localhost:8081](http://localhost:8081/). Run `pnpm dev:api` separately for API health at [localhost:3001/health](http://localhost:3001/health) (or the configured PORT). Root setup preserves existing env files. Real owned-account flows require the development Supabase configuration documented in AUTH.md; the test fixture issuer is not a runtime authentication bypass.

To apply the new additive migration to an explicitly selected local development DB: start `pnpm infra:up`, confirm DATABASE_URL is the intended local instance, then `pnpm db:deploy`. Do not run the rollback SQL on populated/shared databases.

## Engine boundary

`createPokerHand(config, deck)` validates one canonical 52-face deck; `startPokerHand(config, nextInt)` performs Fisher–Yates through injected bounded integers. The server uses Node CSPRNG `randomInt`, while fixtures use a separate development generator outside runtime builds. The reducer rejects stale/out-of-turn/illegal commands and returns deeply frozen state. Betting uses street-total `BET_TO`, explicit check/call/fold/all-in, standard minimum increments and cumulative player-specific reopening. Table chip total is bounded at one billion; there is no ante, straddle or rake.

`allocatePokerPots` accepts terminal private state, layers contributions, excludes folds, refunds unmatched excess and splits each pot with integer odd chips clockwise left of the button. It calculates results without writing a wallet. `projectPokerHand` allow-lists a participant's own holes, public board/action state and non-folded showdown hands. Folded opponents, remaining deck, burns and replay inputs remain private even after closure. Category, tie vector, best fives and pot eligibility/awards let a client reproduce a completed standard result from visible cards; clients never authorize payouts.

## Durable command protocol

Authenticated members may GET `/v1/games/:gameId`, or acknowledge `room.join` on Socket.IO namespace `/rooms` with `{gameId}`. A join does not subscribe to unfiltered broadcast data. POST `/v1/games/commands` and socket `game.command` share the strict payload:

```json
{
  "gameId": "55555555-5555-4555-8555-555555555555",
  "commandId": "stable_command_123",
  "stateVersion": 0,
  "payload": { "action": "CALL" }
}
```

For `BET_TO`, include integer `target` in `payload`; all other actions reject it. No playerId, seed, stack, card, winner or balance field is accepted. Actor ID comes from verified identity. A successful receipt contains gameId, commandId, committed stateVersion and the actor's safe view. An identical key/body returns that original receipt after retries or later activity. Changed semantic bodies conflict. Stale commands return HTTP 409/socket error `STALE_VERSION` plus `resync`; out-of-turn or illegal wagers return 422. Unknown rooms and nonmembership share `ROOM_UNAVAILABLE`. Authentication, origin restrictions, payload bounds and existing rate limits apply.

Account/session/room locks serialize independently instantiated services against the same PostgreSQL database. Every transition and its durable event commit together. Private initialization plus append-only commands reconstruct all states and check persisted snapshots/commitment; corrupt evidence fails closed. No private event endpoint exists. `initializePokerRoom` is an internal server primitive with no public controller: B019/B022 must supply validated, reserved/funded admission before real player use. Tests provision isolated users/stacks only and grant no wallet chips.

## Operations and rollback

The additive `202610290002_game_rooms` migration creates GameRoom, GameParticipant and GameEvent, exact version/actor-command uniqueness, immutable event/member/initial-rule guards and deferred consistency checks. New tables do not mutate inventory, grants, loadouts or wallets. `poker.room_initialized` and `poker.command` log safe status/duration; count accepted/duplicate/rejected outcomes and latency centrally. No identity, command body, token, state, deck or connection URL is logged. External alert thresholds/exporters remain operational work.

The matching rollback SQL is **destructive test-only** and is exercised by the owned runner. For a deployed environment, stop incompatible writers, preserve backups/private dispute evidence and migration history, and use a reviewed forward repair or restore to a separate DB before an approved cutover. Do not delete room history or mark a populated migration rolled back. No production migration or data mutation was performed.

Production gates: B005 actual provider acceptance, B019 admission/queue, B020 broadcasts, B021 reconnect, B022 wallet settlement, R-08 snapshot policy, R-11 privacy-reviewed public fairness proof, operator DB/backup controls, capacity and device acceptance. No seed reveal is introduced to work around R-11.
