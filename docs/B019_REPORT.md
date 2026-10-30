# B019 — Matchmaking and private rooms

Added durable public queues, cryptographic private invites, ready/leave commands, membership-scoped reads and unique seat permission. Server identity selects the seat; duplicate/parallel assignment is prevented across DB clients. Ready requires a valid owned 52-face loadout, and roster changes clear readiness. Host departure closes its lobby. Starting a hand remains gated on B022 funded admission; no chips or cards are granted.

Files: Lobby/LobbySeat Prisma models, additive `202610300001_lobbies` migration and test-only rollback; `services/api/src/rooms/lobby.ts`, shared helpers, app wiring, strict contracts/exports, reusable isolated identity fixture, six DB/HTTP/concurrency cases, decisions/status and this report.

Validation: `pnpm ci:quality` passed 173 unit cases and 11 builds with lint/types/format; `pnpm ci:database` validates deployment/redeployment, seeds, six lobby cases plus existing regressions and complete rollback/reset/reseed in its owned container. Final strengthened HTTP-client rerun is recorded on the PR. Two independent signed clients exercise invite/join/leave; physical-device acceptance is unverified. Initial advisory-lock void decoding and fixture assignment errors were fixed before passing gates.

Operations: `lobby.command` logs safe status only; monitor rejections/queue latency alongside API metrics. An advisory lock is a cross-process correctness boundary, not a scalability proof. Invite plaintext is retained only in the owner's idempotent receipt; no logs contain invites. No existing inventory or wallet data is mutated. Production rollback must preserve lobby/operation evidence and use reviewed forward repair; matching rollback SQL is for the disposable runner only. No production deployment/reset performed.

Next: B020 per-recipient broadcasts. Provider configuration/device gates and B022 funded admission remain open.

Final local database gate passed **68 cases in ten files twice**, including the two-client HTTP invite/join/leave flow, before and after rollback/reset/reseed. Final test types, focused lint and repository format/whitespace checks passed. All 173 unit cases and 11 builds remain passing.
