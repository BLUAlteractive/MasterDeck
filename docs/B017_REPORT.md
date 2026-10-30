# B017 — Client-safe outcomes and explanations

Added pure per-participant projection/types (`game-poker/src/projection.ts`), strict nested response schemas (`contracts/src/poker.ts`), exports and privacy/reproduction tests. Safe payloads include public board/action state, own holes, and non-folded hands at completed showdown. Fold endings expose no opponent holes. Private deck, burns, replay and folded opponents never enter payloads.

Outcome includes standard category/tie ranks, every best five, per-pot eligibility/winners/awards, unmatched refunds and calculated final stacks. The visible showdown cards reproduce standard ranks and pot winners in 1,000 deterministic fixtures. Schema tests reject full private state and injected extra fields, including nested fields.

Changed: the two modules, two exports, two test files, decisions, backlog status and this report. Commands: targeted Vitest and full `pnpm ci:quality` commit gate. No migrations, dependencies or UI screens. No wallet mutation. Full broadcast/reconnect integration and device acceptance are later tickets. Next: B018 durable authoritative room actor.

Local gate passed: four targeted privacy/schema cases; full suite 172 cases in 27 files, formatting/lint/strict types and 11 builds.
