# B021 — Reconnect/replay

Added authenticated HTTP/socket `room.resume`, safe current snapshots reconstructed from private events, a client retry replica, persisted immutable turn policy/deadlines and server-only timeout workers. Resume and same-key retries preserve deadlines; original receipts cannot roll newer client state back. Timeout uses DB time, checks if legal and otherwise folds; competing workers serialize under account/room locks and write one source-labeled event. No bot, raw event replay, seed disclosure or client time proof.

Files: room service/controller/socket/app; poker contracts; mobile `play/replica.ts` and five tests; GameRoom/GameEvent metadata, additive `202610300002_turn_deadlines` migration and matching owned-test rollback; five reconnect/timeout DB/socket tests; decisions/status and report.

Validation: full quality gate initially passed 177 tests and 11 builds; final adapter adds a fifth focused client case. DB gate **76 cases in twelve files passed twice**, before and after rollback/reset/reseed, including lost receipt/rejoin, unchanged deadlines, restart, outsider/future-cursor denial, competing timeout workers, check-versus-fold and immutable policy. Final relevant lint/types/client tests/format recorded on the draft PR. B022 supplies actual transactional wallet settlement; no settlement is claimed here.

Default development turn policy is 30 seconds, immutable per hand; internal tests configure one second. Live production admission/policy remains gated. Legacy NULL deadlines are preserved until a new accepted action installs one; no historical event is rewritten or arbitrary balance minted. Worker shutdown waits for its current transaction and stops starting new work; individual room failures do not block other due rooms. Monitor `poker.timeout` applied/retry counts and queue delay; logs contain no state, identities or credentials.

For owned local DB setup use existing `pnpm infra:up`, verify local DATABASE_URL, then `pnpm db:deploy`; verification uses `pnpm ci:quality` and guarded `pnpm ci:database`. Never run the destructive rollback on populated/shared data; production recovery preserves evidence and uses reviewed forward repair/restore. Next: B022 match results and earned-only chip ledger.

Final focused client suite: five cases passed; final lint, test typecheck, formatting and whitespace checks passed. The combined unit count is now 178 (173 existing plus five replica cases).
