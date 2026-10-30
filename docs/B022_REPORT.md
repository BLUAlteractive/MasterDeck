# B022 — Match results and chip ledger

Implemented an earned-only, balanced Play Chip ledger, atomic funded Classic admission, immutable results and recoverable settlement. Server allocation determines payouts. Concurrent/repeated starts and finishes return the original effect; no public grant, client amount, winner, purchase or currency conversion endpoint exists.

Changed files: Prisma schema, `202610300003_play_chip_ledger` migration and matching owned-test rollback; chip contracts/tests and lobby/poker contract metadata; API chip controller, ledger and settlement modules, room/lobby services, app and socket wiring; mobile replica/tests; authenticated/funded test fixtures and nine integration cases; decisions, status and this report.

Admission requires an explicitly supplied reviewed policy (including approval reference), sufficient earned balances, ready participants and eligible owned 52-face loadouts. It atomically persists the complete policy, starts the hand, transfers stakes into escrow and locks/snapshots all reserved cards. Runtime configuration currently supplies no approved policy, so live admission remains disabled. The internal earned-grant primitive is accounting infrastructure: a future trusted reward adapter must verify eligibility; no launch faucet or reward amount has been chosen.

Settlement locks participant accounts and room, reconstructs the private hand, computes B015 allocation, transfers escrow once, unlocks cards with provenance, closes the lobby and inserts an immutable result in one transaction. Restart workers retry unfinished settlement. A safe `game.settled` projection signals settlement even when the terminal hand version is unchanged; client replicas accept that monotonic transition without exposing folded holes.

SQL independently enforces balanced immutable entries, materialized account reconciliation, permitted issuance/reservation/settlement sources and account classes, exact admission reserves and completed-result escrow/card invariants. An issuance account offsets earned grants; it is the only account allowed negative balance. The internal audit checks account-versus-entry balances and signed world conservation without exposing owners in logs. Observe `game.admission`, settlement/worker retry status and audit mismatches; no state or credentials are logged.

Validation completed 30 October 2026:

- `pnpm ci:quality`: formatting, lint, strict types, **181 unit tests in 29 files**, **11 builds** passed. Log: `/tmp/deckforge-b022-quality-final.log`.
- `PRISMA_USER_CONSENT_FOR_DANGEROUS_AI_ACTION='Continue' pnpm ci:database`: Prisma validation/generation, migrations, rollback/reset/reseed and **85 database cases in 13 files passed twice** in an owned disposable PostgreSQL container. Log: `/tmp/deckforge-b022-database-acceptance.log`.
- Cases include competing starts/finishes across services, 100 generated grants with replay and exact reconciliation, insufficient funds, authorization/strict inputs, SQL tampering and direct player-to-player rejection, forced transaction failure, restart recovery and actual authenticated socket settlement delivery.

The temporary automatic-review usage-limit failure was resolved on resume; the authorized owned-test command subsequently passed. No production/shared database was reset or migrated. Runtime secrets remain ignored and untouched.

Local launch remains `pnpm install --frozen-lockfile`, `pnpm setup:local`, `pnpm infra:up`, then `pnpm db:deploy` against the verified local database. Run `pnpm dev:api` and `pnpm dev:web` in separate terminals; web uses localhost:8081. Configure the documented development identity provider to exercise authenticated flows. No live funded hand is enabled until a reviewed admission policy and trusted earned reward source are wired. Do not use the fixture policy or grants as production configuration.

Rollback is tested only on disposable development databases; preserve populated ledger/history and use reviewed forward repair or restore for deployed recovery. Real provider/device flows, populated legacy upgrades, capacity and operations acceptance remain open. Evolved policy approval remains pending; next independent ticket is B027, then B028, before returning to B023–B026.
