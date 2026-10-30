# B015 — Side pots and splits

Pure Classic terminal-hand allocation now layers partial contributions, excludes folded players, compares eligible seven-card ranks per pot, refunds unmatched excess and splits ties with integer odd chips clockwise left of the button. Outputs are frozen and repeatable; no persistence or currency exchange.

Changed: `packages/game-poker/src/pots.ts`, `pots.test.ts`, root exports, decisions, backlog status and this report. Six tests include 5,000 generated contribution/fold/seat layouts, per-pot ownership/conservation, distinct side-pot winners, refunds and independent odd-chip distribution.

Validation commands: targeted Vitest; `pnpm ci:quality` (commit gate). Hosted checks run on the stacked draft PR. Wallet settlement remains B022; B015 calculates allocations only. Next: B016 deterministic harness.

Local gate passed: 165 cases in 24 files, formatting/lint/strict types and 11 builds. The six targeted allocation cases passed independently, including all 5,000 generated layouts.

Hosted validation: [draft PR #14](https://github.com/BLUAlteractive/MasterDeck/pull/14), [CI run](https://github.com/BLUAlteractive/MasterDeck/actions/runs/41005898089) — Quality checks and Dependency audit passed.
