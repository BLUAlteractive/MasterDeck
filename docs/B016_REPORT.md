# B016 — Poker test harness

Added a seeded development harness in `packages/game-poker/test/simulation.ts`, three ordinary-CI tests, `scripts/poker-harness.mts`, a root command and ticket documentation/status. Fixture code is excluded from production package output and never supplies runtime randomness.

Run `pnpm test:poker:harness` for 1,000 hands or `pnpm test:poker:harness --seed 874` for a single reproducible case. Each hand uses only legal commands, terminates within a fixed bound, replays exactly and conserves chips before and after B015 allocation. Coverage assertions require 2–6 seats, every action/street, fold and showdown endings, and side pots.

Validation: targeted three tests passed. The initial generator failed the seat-count assertion and was corrected; the assertion remains. The first sandboxed CLI invocation could not open tsx IPC; the authorized local-socket rerun is the CLI evidence. Full `pnpm ci:quality` is the commit gate. This exercises individual complete hands, not a multi-hand tournament, load test, wallet settlement or externally certified poker engine. Next: B017 safe outcome payloads.

Local gate passed: 168 cases in 25 files, formatting/lint/strict types and 11 builds. CLI summary: 1,000 hands, 8,292 commands, 175 folds, 825 showdowns, 581 hands with side pots. Single-seed 874 reproduction passed.

Hosted validation: [draft PR #15](https://github.com/BLUAlteractive/MasterDeck/pull/15), [CI run](https://github.com/BLUAlteractive/MasterDeck/actions/runs/41006041569) — Quality checks and Dependency audit passed.
